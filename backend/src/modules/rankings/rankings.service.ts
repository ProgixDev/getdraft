import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { UserRole } from '../../common/types';

export type RankingDivision = 'CA' | 'US' | 'OTHER';

/** One row of the `athlete_ranking_scores` view (see migration 019). */
export interface RankingRow {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  country: string | null;
  kyc_status: string;
  sport: string;
  position: string | null;
  level: string | null;
  class_year: string | null;
  division: RankingDivision;
  drafts_received: number;
  matches_count: number;
  outreach_received: number;
  profile_views: number;
  likes_received: number;
  profile_completion: number;
  score: number;
  division_rank: number;
  cohort_size: number;
}

/**
 * What a third party may see of someone else's ranking row: exactly what the
 * public profile's credibility chip renders (standing + the score it is
 * derived from). The raw counters the score is built from stay private, and
 * `kyc_status` — identity-verification state on a platform full of minors —
 * never leaves the owner's own responses.
 */
export type PublicRankingRow = Omit<
  RankingRow,
  | 'kyc_status'
  | 'drafts_received'
  | 'matches_count'
  | 'outreach_received'
  | 'profile_views'
  | 'likes_received'
  | 'profile_completion'
>;

const VIEW = 'athlete_ranking_scores';

@Injectable()
export class RankingsService {
  constructor(private supabaseService: SupabaseService) {}

  /**
   * Athletes who switched "Profile Visible" off.
   *
   * The ranking view carries no privacy filter of its own, so without this an
   * athlete who opted out of discovery would still be listed publicly on the
   * leaderboard (name + avatar + score) — the exact opposite of what the toggle
   * promises. Mirrors discover.service: the flag lives in free-form JSONB, so
   * ABSENT must mean visible; only an explicit `false` hides.
   */
  private async hiddenAthleteIds(): Promise<string[]> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('users')
      .select('id, preferences')
      .eq('role', 'athlete');
    return (data ?? [])
      .filter((u: any) => u?.preferences?.profileVisible === false)
      .map((u: any) => u.id as string);
  }

  /** Single-user form of {@link hiddenAthleteIds}, same absent-means-visible rule. */
  private async isHiddenAthlete(userId: string): Promise<boolean> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('users')
      .select('preferences')
      .eq('id', userId)
      .maybeSingle();
    return (data as any)?.preferences?.profileVisible === false;
  }

  /**
   * Leaderboard for a division (CA/US/OTHER). When a sport is given the
   * list is the ranked cohort for that (division, sport); without a sport
   * it is the division's top athletes overall, ordered by raw score (each
   * row still carries its own per-sport `division_rank`).
   */
  async getRankings(params: {
    division?: RankingDivision;
    sport?: string;
    limit?: number;
  }): Promise<RankingRow[]> {
    const division = params.division ?? 'CA';
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const supabase = this.supabaseService.getAdminClient();

    let query = supabase.from(VIEW).select('*').eq('division', division);

    // Respect "Profile Visible": opted-out athletes are excluded here (not
    // post-filtered) so `limit` still returns a full page.
    const hidden = await this.hiddenAthleteIds();
    if (hidden.length > 0) {
      query = query.not('user_id', 'in', `(${hidden.join(',')})`);
    }

    if (params.sport) {
      query = query
        .eq('sport', params.sport)
        .order('division_rank', { ascending: true });
    } else {
      query = query.order('score', { ascending: false });
    }

    const { data, error } = await query.limit(limit);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as RankingRow[];
  }

  /** Distinct sports that have at least one ranked athlete in a division. */
  async getSports(division: RankingDivision): Promise<string[]> {
    const supabase = this.supabaseService.getAdminClient();
    let sportQuery = supabase.from(VIEW).select('sport').eq('division', division);
    // Same privacy filter as getRankings, so a sport whose only athletes opted
    // out doesn't show up in the picker and then open an empty leaderboard.
    const hidden = await this.hiddenAthleteIds();
    if (hidden.length > 0) {
      sportQuery = sportQuery.not('user_id', 'in', `(${hidden.join(',')})`);
    }
    const { data, error } = await sportQuery;
    if (error) throw new BadRequestException(error.message);
    const sports = new Set<string>();
    (data ?? []).forEach((r: { sport?: string }) => {
      if (r.sport) sports.add(r.sport);
    });
    return Array.from(sports).sort();
  }

  /**
   * The caller's own ranking row, or null when the caller is not a ranked
   * athlete (no athlete profile / not role athlete / banned).
   */
  async getMyRank(userId: string): Promise<RankingRow | null> {
    return this.fetchRow(userId);
  }

  /**
   * Ranking row for an arbitrary user id — used by the public profile to
   * render a credibility chip. Returns null when the user is not a ranked
   * athlete; callers should hide the chip in that case.
   *
   * Anyone other than the athlete (and admins) gets the narrowed
   * {@link PublicRankingRow}: the chip only needs standing + score, so
   * shipping the whole view row also handed out every engagement counter and
   * the athlete's KYC state for any id the caller cared to type.
   */
  async getRankForUser(
    userId: string,
    viewerId: string,
    viewerRole: UserRole,
  ): Promise<RankingRow | PublicRankingRow | null> {
    const row = await this.fetchRow(userId);
    if (!row) return null;
    if (viewerId === userId || viewerRole === UserRole.ADMIN) return row;

    // Same "Profile Visible" contract as the leaderboard: an athlete who
    // opted out isn't ranked publicly, so the chip disappears for everyone
    // but themselves.
    if (await this.isHiddenAthlete(userId)) return null;

    // Allow-list, not a delete-list — a future column added to the view is
    // then private by default rather than leaking until someone notices.
    return {
      user_id: row.user_id,
      name: row.name,
      avatar_url: row.avatar_url,
      country: row.country,
      sport: row.sport,
      position: row.position,
      level: row.level,
      class_year: row.class_year,
      division: row.division,
      score: row.score,
      division_rank: row.division_rank,
      cohort_size: row.cohort_size,
    };
  }

  private async fetchRow(userId: string): Promise<RankingRow | null> {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from(VIEW)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return (data as RankingRow | null) ?? null;
  }
}
