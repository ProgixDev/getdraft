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
import { setActivationStatus } from '../../common/utils/activation';

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
    return { ...data, activation_status: activationStatus, isActivated: activationStatus === 'active' };
  }

  async updateMe(user: CurrentUserPayload, dto: UpdateUserDto) {
    const supabase = this.supabaseService.getAdminClient();

    // If role is being changed (OAuth signup hits this right after the
    // provider returns), we MUST mirror it onto auth.users.user_metadata.
    // JwtAuthGuard reads `user_metadata.role` for every request, and
    // RolesGuard checks against that — without this mirror an OAuth
    // recruiter gets 403 on /outreach, and an OAuth parent isn't blocked
    // from /discover/swipe. The public.users column is the authoritative
    // app value; user_metadata is the JWT view of it.
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
      const { data: authUser, error: readErr } =
        await supabase.auth.admin.getUserById(user.id);
      if (readErr || !authUser?.user) {
        throw new BadRequestException(
          `Could not read auth user: ${readErr?.message ?? 'not found'}`,
        );
      }
      // Merge so we don't clobber other metadata (name set at signup, etc).
      const mergedMeta = {
        ...(authUser.user.user_metadata ?? {}),
        role: dto.role,
      };
      const { error: metaErr } = await supabase.auth.admin.updateUserById(
        user.id,
        { user_metadata: mergedMeta },
      );
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

  /**
   * Dev-only escape hatch — flips the current user straight to 'active'
   * without waiting for a guardian/admin. Mirrors the kyc dev-approve
   * pattern and is hard-disabled in production. Powers the __DEV__
   * "skip activation" button on the pending-activation screen.
   */
  async devActivate(userId: string): Promise<{ activationStatus: 'active' }> {
    const env = this.configService.get<string>('NODE_ENV') ?? 'development';
    if (env === 'production') {
      throw new BadRequestException('Dev activate is disabled in production.');
    }
    const supabase = this.supabaseService.getAdminClient();
    await setActivationStatus(supabase, userId, 'active');
    this.logger.warn(`[dev] activation bypassed for user ${userId}`);
    return { activationStatus: 'active' };
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
  async deleteAccount(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: row } = await supabase
      .from('users')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .maybeSingle();

    if (row?.stripe_subscription_id) {
      try {
        await this.subscriptionsService.cancelSubscription(userId, true);
      } catch (err: any) {
        this.logger.error(
          `Stripe cancel failed during deleteAccount(${userId}): ${err?.message ?? err}`,
        );
      }
    }

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      throw new BadRequestException(error.message);
    }

    return { deleted: true };
  }
}
