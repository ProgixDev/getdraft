import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';

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

const VIEW = 'athlete_ranking_scores';

@Injectable()
export class RankingsService {
  constructor(private supabaseService: SupabaseService) {}

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
    const { data, error } = await supabase
      .from(VIEW)
      .select('sport')
      .eq('division', division);
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
