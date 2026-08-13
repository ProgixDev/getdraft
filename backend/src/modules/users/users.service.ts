import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { CurrentUserPayload, UserRole } from '../../common/types';
import { isMinor } from '../../common/utils/age';
import { writeAuthzClaims } from '../../common/utils/authz-claims';
import {
  setActivationStatus,
  reevaluateMinorActivation,
} from '../../common/utils/activation';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private supabaseService: SupabaseService,
    private subscriptionsService: SubscriptionsService,
    private configService: ConfigService,
  ) {}

  async getMe(user: CurrentUserPayload) {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      throw new NotFoundException('User not found');
    }

    // Convenience flag the client uses to decide whether to show the
    // pending-activation gate. Older rows (pre-022) have no column → active.
    const activationStatus = (data.activation_status ?? 'active') as
      | 'active'
      | 'pending_guardian';

    // profileCompleted: the profile step is done once the role-specific profile
    // row exists. handle_new_user() only seeds users + subscriptions — the role
    // profile is created at the profile step — so its existence is a reliable
    // signal. Replaces the old resume heuristic that checked a non-existent
    // users.bio column (which bounced avatar-less users back to the profile step).
    const profileTable =
      data.role === 'athlete'
        ? 'athlete_profiles'
        : data.role === 'coach' || data.role === 'recruiter'
          ? 'recruiter_profiles'
          : data.role === 'parent'
            ? 'parent_profiles'
            : null;
    let profileCompleted = true; // admin / unknown roles have no profile step
    if (profileTable) {
      const { data: prof } = await supabase
        .from(profileTable)
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      profileCompleted = !!prof;
    }

    return {
      ...data,
      activation_status: activationStatus,
      isActivated: activationStatus === 'active',
      profileCompleted,
    };
  }

  async updateMe(user: CurrentUserPayload, dto: UpdateUserDto) {
    const supabase = this.supabaseService.getAdminClient();

    // preferences is a SHARED jsonb blob written by independent writers:
    // settings.tsx (5 toggle keys), OnboardingQuestionsScreen
    // (preferences.onboarding — "feeds the matching algorithm"), and
    // GuardianLinkScreen (preferences.dev). A plain column update would
    // overwrite the others' keys. Read-modify-write to merge top-level
    // keys; deeper nesting is the writer's responsibility (each writer
    // namespaces under a unique key today).
    let mergedDto: Record<string, any> = dto;
    if (dto.preferences) {
      const { data: existing, error: readErr } = await supabase
        .from('users')
        .select('preferences')
        .eq('id', user.id)
        .single();
      if (readErr) {
        throw new BadRequestException(readErr.message);
      }
      mergedDto = {
        ...dto,
        preferences: {
          ...(existing?.preferences ?? {}),
          ...dto.preferences,
        },
      };
    }

    if (dto.role) {
      // The admin role is provisioned out-of-band (DB only) and must never
      // be self-assignable through this self-service endpoint — otherwise any
      // authenticated user could promote themselves and reach the admin
      // console. Onboarding only ever sets athlete/parent/coach/recruiter.
      if (dto.role === UserRole.ADMIN) {
        throw new ForbiddenException('The admin role cannot be self-assigned.');
      }
      // Mirror onto auth.users.app_metadata, NOT user_metadata. OAuth signup
      // hits this right after the provider returns, and onboarding hits it
      // when the user picks a role — JwtAuthGuard resolves `role` from
      // app_metadata and RolesGuard checks against that, so without this an
      // OAuth recruiter gets 403 on /outreach and a parent isn't blocked
      // from /discover/swipe.
      //
      // It must be app_metadata specifically, and it must happen even though
      // the public.users column below is authoritative: resolveAuthzClaims
      // short-circuits on the metadata copy as soon as all three claims are
      // present, so writing only the column would leave the signup-time role
      // winning forever (see common/utils/authz-claims.ts). user_metadata is
      // also self-writable with the shipped anon key, so it can never hold
      // an authz claim.
      const { error: metaErr } = await writeAuthzClaims(supabase, user.id, {
        role: dto.role,
      });
      if (metaErr) {
        throw new BadRequestException(
          `Could not update auth metadata: ${metaErr.message}`,
        );
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update(mergedDto)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async completeOnboarding(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Parents MUST have a real guardian_links row (pending_admin or
    // approved) before is_onboarded can flip to true. Client-side
    // preferences are not trustworthy — preferences is a free-form JSONB
    // a parent could PUT themselves. This is the server-authoritative
    // half of the guardian gate; the client mirrors the same rule.
    const { data: existing, error: readErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    if (readErr || !existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.role === 'parent') {
      const { data: link } = await supabase
        .from('guardian_links')
        .select('id, status')
        .eq('guardian_user_id', userId)
        .in('status', ['pending_admin', 'approved'])
        .maybeSingle();
      if (!link) {
        throw new BadRequestException(
          'Guardian link required before onboarding can be completed.',
        );
      }
    }

    // Under-18 athletes finish onboarding but land in 'pending_guardian':
    // they can't use any feature until a guardian validates them (existing
    // QR flow) and an admin approves that link. Age is read from the
    // athlete profile's DOB; a missing DOB or any non-athlete role stays
    // 'active'. See guardian-links.service.ts -> adminDecide for the flip.
    let activationStatus: 'active' | 'pending_guardian' = 'active';
    if (existing.role === 'athlete') {
      const { data: prof, error: profErr } = await supabase
        .from('athlete_profiles')
        .select('date_of_birth')
        .eq('user_id', userId)
        .maybeSingle();
      // Don't silently treat a query error as "adult" — that would let a
      // minor slip past the guardian gate. A genuinely missing row (no DOB)
      // still falls through as adult, which is the intended default.
      if (profErr) {
        throw new BadRequestException(
          `Could not read athlete profile for activation check: ${profErr.message}`,
        );
      }
      if (isMinor(prof?.date_of_birth)) {
        activationStatus = 'pending_guardian';
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update({ is_onboarded: true })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    // Set the column AND mirror into the JWT metadata so the very next
    // request from this minor is already gated by the ActivationGuard.
    if (activationStatus !== 'active') {
      await setActivationStatus(supabase, userId, activationStatus);
      this.logger.log(
        `[activation] athlete ${userId} onboarded as minor → pending_guardian`,
      );
    }

    return {
      ...data,
      activation_status: activationStatus,
      isActivated: activationStatus === 'active',
    };
  }

  async getPublicProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, role, avatar_url, location, country, created_at')
      .eq('id', userId)
      .eq('is_banned', false)
      .single();

    if (error || !user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async trackProfileView(viewerId: string, viewedId: string) {
    if (viewerId === viewedId) return { tracked: false };

    const supabase = this.supabaseService.getAdminClient();

    // Dedupe: athlete_profiles.profile_views must count UNIQUE viewers, so a
    // repeat open by the same viewer must NOT call increment_profile_views.
    // Refresh the existing event's timestamp so the "Profile viewers" list
    // still surfaces the most-recent viewer at the top.
    const { data: existing } = await supabase
      .from('profile_views')
      .select('id')
      .eq('viewer_id', viewerId)
      .eq('viewed_id', viewedId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('profile_views')
        .update({ created_at: new Date().toISOString() })
        .eq('id', existing.id);
      return { tracked: false };
    }

    await supabase
      .from('profile_views')
      .insert({ viewer_id: viewerId, viewed_id: viewedId });

    await supabase.rpc('increment_profile_views', { target_user_id: viewedId });

    return { tracked: true };
  }

  async listProfileViewers(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data } = await supabase
      .from('profile_views')
      .select(
        `id, created_at,
         viewer:users!profile_views_viewer_id_fkey(id, name, avatar_url, role, location)`,
      )
      .eq('viewed_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    return data || [];
  }

  async listMyBlocks(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data } = await supabase
      .from('blocks')
      .select(
        `id, blocked_id, reason, created_at,
         blocked:users!blocks_blocked_id_fkey(id, name, avatar_url, role)`,
      )
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });

    return data || [];
  }

  async searchUsers(meId: string, q: string, limit: number) {
    const supabase = this.supabaseService.getAdminClient();
    const term = (q ?? '').trim();
    let query = supabase
      .from('users')
      .select('id, name, avatar_url, role')
      .neq('id', meId)
      .eq('is_banned', false)
      .order('name', { ascending: true })
      .limit(limit);
    if (term.length > 0) {
      const escaped = term.replace(/[%_\\]/g, (m) => `\\${m}`);
      query = query.ilike('name', `%${escaped}%`);
    }
    const { data } = await query;
    return (data ?? []).map((u: any) => ({
      id: u.id as string,
      name: (u.name as string) ?? '',
      avatarUrl: (u.avatar_url as string) ?? null,
      role: (u.role as string) ?? null,
    }));
  }

  async blockUser(blockerId: string, blockedId: string, dto: BlockUserDto) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase.from('blocks').insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason: dto.reason ?? null,
    });

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('User already blocked');
      }
      throw new BadRequestException(error.message);
    }

    await supabase
      .from('matches')
      .update({ is_active: false })
      .or(
        `and(user_1_id.eq.${blockerId},user_2_id.eq.${blockedId}),and(user_1_id.eq.${blockedId},user_2_id.eq.${blockerId})`,
      );

    return { message: 'User blocked' };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'User unblocked' };
  }

  /**
   * Permanent self-service account deletion. Best-effort cancels the
   * Stripe subscription (so we don't keep charging a deleted user) and
   * then removes the auth.users row — every public.* row referencing
   * it (users, profiles, swipes, matches, conversations, messages,
   * posts, saved_posts, guardian_links, subscriptions) cascades away
   * via ON DELETE CASCADE FKs. Stripe failures are logged, never
   * fatal: a card-processor outage must not strand the user with an
   * undeletable account.
   */
  /**
   * Deletes every stored object belonging to a user, across all buckets.
   *
   * Safe to key on the prefix: getSignedUploadUrl builds every path as
   * `${userId}/${Date.now()}-${safeName}`, and deleteFile already refuses
   * any path that does not start with the caller's own id, so a user's
   * objects can only ever live under their own folder.
   *
   * guardian-videos is included even though it is a private bucket — a
   * consent recording of a parent has no reason to outlive the account, and
   * "private" only means it needs a signed URL, not that it is gone.
   *
   * Best-effort by design: this runs during account deletion, and a storage
   * hiccup must not leave someone with an account they cannot delete. Failures
   * are logged loudly because the leftover is a privacy problem, not litter.
   */
  private async purgeUserMedia(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const buckets = [
      'avatars',
      'photos',
      'videos',
      'posts',
      'guardian-videos',
    ];

    for (const bucket of buckets) {
      try {
        const { data: objects, error: listErr } = await supabase.storage
          .from(bucket)
          .list(userId, { limit: 1000 });

        if (listErr) {
          this.logger.error(
            `[purge] could not list ${bucket}/${userId}: ${listErr.message}`,
          );
          continue;
        }
        if (!objects || objects.length === 0) continue;

        const paths = objects.map((o) => `${userId}/${o.name}`);
        const { error: rmErr } = await supabase.storage
          .from(bucket)
          .remove(paths);

        if (rmErr) {
          this.logger.error(
            `[purge] could not remove ${paths.length} object(s) from ${bucket}: ${rmErr.message}`,
          );
          continue;
        }

        this.logger.log(
          `[purge] removed ${paths.length} object(s) from ${bucket} for ${userId}`,
        );
      } catch (err: any) {
        this.logger.error(
          `[purge] ${bucket} failed for ${userId}: ${err?.message ?? err}`,
        );
      }
    }
  }

  async deleteAccount(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: row } = await supabase
      .from('users')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .maybeSingle();

    // If this account is a guardian, capture the athletes it's linked to
    // BEFORE the delete — the guardian_links rows cascade away with the
    // parent, so we must remember who to re-check afterwards. A minor left
    // with no other approved guardian must not stay usable (COPPA).
    const { data: linkedAthletes } = await supabase
      .from('guardian_links')
      .select('athlete_user_id')
      .eq('guardian_user_id', userId);
    const affectedAthleteIds = Array.from(
      new Set((linkedAthletes ?? []).map((l: any) => l.athlete_user_id)),
    );

    if (row?.stripe_subscription_id) {
      try {
        await this.subscriptionsService.cancelSubscription(userId, true);
      } catch (err: any) {
        this.logger.error(
          `Stripe cancel failed during deleteAccount(${userId}): ${err?.message ?? err}`,
        );
      }
    }

    // Storage does NOT cascade. Deleting the auth row removes every database
    // reference to this media while leaving the objects themselves in place —
    // and photos/videos/posts/avatars are public buckets, so those files stay
    // downloadable by anyone holding the URL, forever, with no login. Every
    // user of the app has been handed those URLs by the API.
    //
    // That makes "delete my account" untrue for exactly the data it matters
    // most for: this platform's users include minors. Runs BEFORE the auth
    // delete, while we can still resolve what belongs to this user.
    await this.purgeUserMedia(userId);

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      throw new BadRequestException(error.message);
    }

    // Cascade has now removed this guardian's links. Re-gate any minor who
    // lost their last approved guardian. Best-effort per athlete: one
    // failure must not abort the others, and the account is already gone.
    for (const athleteId of affectedAthleteIds) {
      try {
        const status = await reevaluateMinorActivation(supabase, athleteId);
        if (status === 'pending_guardian') {
          this.logger.warn(
            `[activation] athlete ${athleteId} re-gated to pending_guardian after guardian ${userId} deleted their account`,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `[activation] re-evaluation failed for athlete ${athleteId} after guardian ${userId} deletion: ${err?.message ?? err}`,
        );
      }
    }

    return { deleted: true };
  }
}
