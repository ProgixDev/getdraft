import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import {
  UserRole,
  isRecruiterRole,
  recruiterRoleTypeFor,
} from '../../common/types';
import { ageFromDob } from '../../common/utils/age';
import { reevaluateMinorActivation } from '../../common/utils/activation';
import { UpsertAthleteProfileDto } from './dto/athlete-profile.dto';
import { UpsertRecruiterProfileDto } from './dto/recruiter-profile.dto';
import { UpsertParentProfileDto } from './dto/parent-profile.dto';

export const DOB_LOCKED_MESSAGE =
  "Date of birth can't be changed. Contact support.";

/**
 * 403 when an account writes a profile that is not its own kind. Each role
 * has exactly one profile table; before this check any role could create a
 * row in any of them (a coach with an athlete profile shows on the globe as
 * an athlete pin).
 */
export const WRONG_PROFILE_MESSAGES = {
  athlete: 'Only athlete accounts have an athlete profile.',
  recruiter: 'Only coach, agent and team accounts have this profile.',
  parent: 'Only parent accounts have a parent profile.',
} as const;

/**
 * A date of birth as its 'YYYY-MM-DD' calendar date (how Postgres stores a
 * DATE), or null when there is none. A value that is not a date comes back
 * as-is, so it can never compare equal to a real one.
 */
function dobDay(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (match) return match[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toISOString().slice(0, 10);
}

/** Whole days between two 'YYYY-MM-DD' dates (NaN if either is not one). */
function daysApart(a: string, b: string): number {
  return (
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) /
    86_400_000
  );
}

/** Age shown on a profile: whole years, or null when unknown / in the future. */
function publicAge(dateOfBirth: unknown): number | null {
  const age = ageFromDob(dobDay(dateOfBirth));
  return age !== null && age >= 0 ? age : null;
}

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private supabaseService: SupabaseService) {}

  // --- Athlete Profile ---

  async getAthleteProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('athlete_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Athlete profile not found');
    }
    return data;
  }

  /**
   * Give a user an avatar the first time they add photos.
   *
   * users.avatar_url and the profile tables' photos column were never linked,
   * so anyone who uploaded photos through onboarding kept a null avatar and
   * rendered as a grey silhouette everywhere an avatar appears -- Draft
   * Board, chat, rankings, who-drafted-you. It stayed hidden because every
   * demo account had both set by the seed script; the first real user to
   * upload photos was the first to hit it.
   *
   * Only ever fills a null, so an avatar the user picked deliberately is not
   * overwritten by a later photo edit. Best-effort: a failure here must not
   * fail the profile save.
   */
  private async ensureAvatarFromPhotos(
    userId: string,
    photos?: string[] | null,
  ) {
    const first = photos?.[0];
    if (!first) return;
    try {
      const supabase = this.supabaseService.getAdminClient();
      const { data } = await supabase
        .from('users')
        .select('avatar_url')
        .eq('id', userId)
        .single();
      if (data?.avatar_url) return;
      await supabase.from('users').update({ avatar_url: first }).eq('id', userId);
    } catch {
      // ignore -- the profile itself saved fine
    }
  }

  async upsertAthleteProfile(
    userId: string,
    role: UserRole,
    dto: UpsertAthleteProfileDto,
  ) {
    if (role !== UserRole.ATHLETE) {
      throw new ForbiddenException(WRONG_PROFILE_MESSAGES.athlete);
    }
    const supabase = this.supabaseService.getAdminClient();

    // Pull the full existing row (not just the id) so a partial save can
    // recompute completion against the MERGED state. Without this, an edit
    // of a single field would drop completion to the % of that one field
    // and overwrite a previously-higher number.
    const { data: existing } = await supabase
      .from('athlete_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Date of birth is locked once onboarding is done and one is stored. It
    // decides the guardian gate (under 18), the KYC waiver (minors) and the
    // Community age group (13-17 vs 18+), so changing it would let an adult
    // move into the 13-17 Community, or a minor out from under their
    // guardian. Before onboarding it can still be corrected, and an account
    // that never gave one may add it once.
    const write: UpsertAthleteProfileDto = { ...dto };
    let onboarded: boolean | undefined;
    const isOnboarded = async () =>
      (onboarded ??= await this.isOnboarded(userId));
    const storedDob = dobDay(existing?.date_of_birth);
    let dobAddedNow = false;
    if (dto.date_of_birth !== undefined) {
      if (storedDob) {
        if (await isOnboarded()) {
          const incoming = dobDay(dto.date_of_birth);
          // Edit Profile resends the stored date on every save, and the
          // app's date picker shifts it back a day east of UTC (local
          // midnight through toISOString). Same date, or that one-day shift:
          // keep what is stored and carry on, so saving a bio still works.
          // Anything else, including clearing it, is a change.
          if (incoming !== null && daysApart(incoming, storedDob) <= 1) {
            delete write.date_of_birth;
          } else {
            throw new BadRequestException(DOB_LOCKED_MESSAGE);
          }
        }
      } else {
        dobAddedNow = dobDay(dto.date_of_birth) !== null;
      }
    }

    if (existing) {
      const merged = { ...existing, ...write } as UpsertAthleteProfileDto;
      const profileCompletion = this.calculateAthleteCompletion(merged);
      const { data, error } = await supabase
        .from('athlete_profiles')
        .update({
          ...write,
          profile_completion: profileCompletion,
        })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw new BadRequestException(error.message);
      if (dobAddedNow && (await isOnboarded())) {
        await this.applyGuardianGateToLateDob(userId);
      }
      await this.ensureAvatarFromPhotos(userId, data?.photos);
      return data;
    }

    // CREATE path. `sport` is optional on the DTO so partial updates work
    // (see the note there), which means the requirement has to be enforced
    // here instead -- otherwise the first write could mint a profile with no
    // sport, and sport is what Discover, rankings and matching all key on.
    if (!dto.sport) {
      throw new BadRequestException(
        'sport is required when creating an athlete profile.',
      );
    }

    const profileCompletion = this.calculateAthleteCompletion(write);
    const { data, error } = await supabase
      .from('athlete_profiles')
      .insert({
        user_id: userId,
        ...write,
        profile_completion: profileCompletion,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    if (dobAddedNow && (await isOnboarded())) {
      await this.applyGuardianGateToLateDob(userId);
    }
    await this.ensureAvatarFromPhotos(userId, data?.photos);
    return data;
  }

  /** users.is_onboarded, read fresh (it gates the date-of-birth lock). */
  private async isOnboarded(userId: string): Promise<boolean> {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('is_onboarded')
      .eq('id', userId)
      .maybeSingle();
    // Unknown is not "not onboarded": that would unlock the date of birth.
    if (error) {
      throw new BadRequestException(
        `Could not read the account: ${error.message}`,
      );
    }
    return data?.is_onboarded === true;
  }

  /**
   * A date of birth given for the first time AFTER onboarding. The guardian
   * gate runs at onboarding (users.service completeOnboarding), so an account
   * that finished it without a DOB is 'active' as an adult. Saying now that
   * they are 15 has to go through the same gate, or anyone could walk into
   * the 13-17 Community without a guardian. reevaluateMinorActivation leaves
   * adults alone and moves a minor with no approved guardian link to
   * pending_guardian, exactly as onboarding would have.
   */
  private async applyGuardianGateToLateDob(userId: string): Promise<void> {
    const supabase = this.supabaseService.getAdminClient();
    try {
      await reevaluateMinorActivation(supabase, userId);
    } catch (err) {
      // The gate could not be applied. Undo the date of birth rather than
      // leave a minor's date on an ungated account; a retry runs this again.
      this.logger.error(
        `[activation] guardian gate after a late DOB failed for ${userId}: ${(err as Error).message}`,
      );
      await supabase
        .from('athlete_profiles')
        .update({ date_of_birth: null })
        .eq('user_id', userId);
      throw new BadRequestException(
        'Could not save your date of birth right now. Try again.',
      );
    }
  }

  // --- Recruiter Profile ---

  async getRecruiterProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('recruiter_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Recruiter profile not found');
    }
    return data;
  }

  /**
   * The profile of a coach, an agent or a team: one table, told apart by
   * role_type. role_type is NOT taken from the request. It follows the
   * account type (coach -> 'coach', agent -> 'agent', team -> 'team') and is
   * rewritten on every save, so a coach cannot label itself a team -- which
   * the Community pool, the recruiter-type filter and every label read.
   */
  async upsertRecruiterProfile(
    userId: string,
    role: UserRole,
    dto: UpsertRecruiterProfileDto,
  ) {
    const roleType = recruiterRoleTypeFor(role);
    if (!roleType) {
      throw new ForbiddenException(WRONG_PROFILE_MESSAGES.recruiter);
    }
    const supabase = this.supabaseService.getAdminClient();

    // Whatever role_type the client sent is dropped here.
    const { role_type: _clientRoleType, ...fields } = dto;
    const write = { ...fields, role_type: roleType };

    const { data: existing } = await supabase
      .from('recruiter_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('recruiter_profiles')
        .update(write)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw new BadRequestException(error.message);
      await this.ensureAvatarFromPhotos(userId, data?.photos);
      return data;
    }

    const { data, error } = await supabase
      .from('recruiter_profiles')
      .insert({ user_id: userId, ...write })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    await this.ensureAvatarFromPhotos(userId, data?.photos);
    return data;
  }

  // --- Parent Profile ---

  async getParentProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Parent profile not found');
    }
    return data;
  }

  async upsertParentProfile(
    userId: string,
    role: UserRole,
    dto: UpsertParentProfileDto,
  ) {
    if (role !== UserRole.PARENT) {
      throw new ForbiddenException(WRONG_PROFILE_MESSAGES.parent);
    }
    const supabase = this.supabaseService.getAdminClient();

    const { data: existing } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('parent_profiles')
        .update({ ...dto })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    const { data, error } = await supabase
      .from('parent_profiles')
      .insert({ user_id: userId, ...dto })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // --- Public profile by user ID ---

  /**
   * Someone's profile as another user sees it. Two things never leave for a
   * viewer who is not the owner:
   *   - the exact date of birth: `age` (whole years) replaces it, top level
   *     and inside an athlete's `profile`. Community now puts athletes in
   *     front of each other, and a birth date is an identifier;
   *   - guardian links: a parent profile's child_athlete_id is dropped, and
   *     an athlete's parent_user_id is only given to coaches, agents and
   *     teams, who need it to address outreach to the guardian (POST
   *     /outreach takes the parent's id). Other athletes and parents get null.
   * The owner reading their own profile gets everything, as before.
   *
   * A team's `profile` is its recruiter_profiles row, like a coach's or an
   * agent's, with org_type and website on it.
   */
  async getPublicProfile(
    userId: string,
    viewerId?: string,
    viewerRole?: UserRole | string,
  ) {
    const supabase = this.supabaseService.getAdminClient();
    const isOwner = !!viewerId && viewerId === userId;
    const viewerSendsOutreach = isRecruiterRole(viewerRole);

    const { data: user } = await supabase
      .from('users')
      .select('id, name, role, avatar_url, location, country')
      .eq('id', userId)
      // Banned users disappear from public lookups (matches users.service.ts
      // getPublicProfile + searchUsers). Returns 404 so the client can't
      // distinguish "doesn't exist" from "suspended".
      .eq('is_banned', false)
      .single();

    if (!user) throw new NotFoundException('User not found');

    let profile: Record<string, any> | null = null;
    let age: number | null = null;
    // Surfaced only for athletes so a recruiter/coach knows which parent
    // to address via POST /outreach. Picks the first approved guardian
    // link; non-athletes and athletes without an approved guardian get
    // null and the frontend hides the "Send outreach" affordance. Only
    // looked up for the owner and for coaches/agents/teams (see above).
    let parent_user_id: string | null = null;

    if (user.role === 'athlete') {
      const { data } = await supabase
        .from('athlete_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      age = publicAge(data?.date_of_birth);
      if (data) {
        if (isOwner) {
          profile = { ...data, age };
        } else {
          const { date_of_birth: _dateOfBirth, ...shared } = data;
          profile = { ...shared, age };
        }
      }

      if (isOwner || viewerSendsOutreach) {
        const { data: guardianLink } = await supabase
          .from('guardian_links')
          .select('guardian_user_id')
          .eq('athlete_user_id', userId)
          .eq('status', 'approved')
          .limit(1)
          .maybeSingle();
        parent_user_id = guardianLink?.guardian_user_id ?? null;
      }
    } else if (isRecruiterRole(user.role)) {
      const { data } = await supabase
        .from('recruiter_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      profile = data;
    } else if (user.role === 'parent') {
      const { data } = await supabase
        .from('parent_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (data && !isOwner) {
        // Which athlete this parent is guardian of is theirs to share.
        const { child_athlete_id: _childAthleteId, ...shared } = data;
        profile = shared;
      } else {
        profile = data;
      }
    }

    // Match status for the viewer — powers the "Matched" badge + Message
    // shortcut on the public profile. Checks both id orderings so it's
    // independent of how the pair was stored. Viewing your own profile, or
    // an unauthenticated read, is never "matched".
    let is_matched = false;
    let match_id: string | null = null;
    if (viewerId && viewerId !== userId) {
      const { data: match } = await supabase
        .from('matches')
        .select('id')
        .or(
          `and(user_1_id.eq.${viewerId},user_2_id.eq.${userId}),and(user_1_id.eq.${userId},user_2_id.eq.${viewerId})`,
        )
        // Only a live match. An unmatched pair, or a Community match closed
        // for breaking the age / sport rules, must not keep its badge.
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (match) {
        is_matched = true;
        match_id = match.id;
      }
    }

    return { ...user, age, profile, parent_user_id, is_matched, match_id };
  }

  // --- Helpers ---

  private calculateAthleteCompletion(dto: UpsertAthleteProfileDto): number {
    const fields = [
      dto.sport,
      dto.position,
      dto.level,
      dto.bio,
      dto.class_year,
      dto.gpa,
      dto.height,
      dto.weight,
      (dto.photos?.length ?? 0) > 0,
      (dto.videos?.length ?? 0) > 0,
      (dto.awards?.length ?? 0) > 0,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }
}
