import api from "./api";

export type RankingDivision = "CA" | "US" | "OTHER";

/** One row of the backend `athlete_ranking_scores` view (migration 019). */
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

export const DIVISION_LABEL: Record<RankingDivision, string> = {
  CA: "Canada",
  US: "USA",
  OTHER: "International",
};

export const DIVISION_FLAG: Record<RankingDivision, string> = {
  CA: "🇨🇦",
  US: "🇺🇸",
  OTHER: "🌍",
};

/**
 * 1–5 star prospect tier from the rank's percentile within its cohort
 * (top 1% = 5★, 5% = 4★, 15% = 3★, 40% = 2★, otherwise 1★) — mirrors the
 * recruiting-ranking convention the client referenced.
 */
export function starsForRank(rank: number, cohortSize: number): number {
  if (!cohortSize || cohortSize < 1 || !rank) return 1;
  const pct = rank / cohortSize; // lower is better; rank 1 => best
  if (pct <= 0.01) return 5;
  if (pct <= 0.05) return 4;
  if (pct <= 0.15) return 3;
  if (pct <= 0.4) return 2;
  return 1;
}

// Graceful demo fallback — keeps the leaderboard populated when the API is
// unreachable or the live DB is still sparse. Real data always wins.
const MOCK_RANKINGS: RankingRow[] = [
  mock("Liam Tremblay", "CA", "Hockey", "Center", "U SPORTS", 5, 0),
  mock("Noah Gagnon", "CA", "Hockey", "Defense", "CEGEP", 4, 1),
  mock("William Roy", "CA", "Hockey", "Goalie", "U SPORTS", 4, 2),
  mock("Olivia Bergeron", "CA", "Basketball", "Guard", "CEGEP", 5, 0),
  mock("Emma Côté", "CA", "Basketball", "Forward", "U SPORTS", 3, 1),
  mock("Lucas Bouchard", "CA", "Soccer", "Striker", "CEGEP", 4, 0),
  mock("Jacob Miller", "US", "Football", "Quarterback", "NCAA D1", 5, 0),
  mock("Mason Davis", "US", "Football", "Wide Receiver", "NCAA D1", 4, 1),
  mock("Ethan Wilson", "US", "Football", "Linebacker", "JUCO", 3, 2),
  mock("Sophia Martinez", "US", "Basketball", "Guard", "NCAA D1", 5, 0),
  mock("Ava Johnson", "US", "Basketball", "Center", "NCAA D2", 4, 1),
  mock("James Brown", "US", "Baseball", "Pitcher", "NCAA D1", 4, 0),
];

function mock(
  name: string,
  division: RankingDivision,
  sport: string,
  position: string,
  level: string,
  drafts: number,
  rankOffset: number,
): RankingRow {
  const cohort = MOCK_COHORT[`${division}:${sport}`] ?? 6;
  const score = drafts * 10 + 18 - rankOffset * 4;
  return {
    user_id: `mock-${name.replace(/\s+/g, "-").toLowerCase()}`,
    name,
    avatar_url: null,
    country: division === "CA" ? "Canada" : division === "US" ? "USA" : "Other",
    kyc_status: rankOffset === 0 ? "approved" : "none",
    sport,
    position,
    level,
    class_year: "2026",
    division,
    drafts_received: drafts,
    matches_count: Math.max(0, drafts - 1),
    outreach_received: Math.max(0, 3 - rankOffset),
    profile_views: 40 - rankOffset * 6,
    likes_received: drafts,
    profile_completion: 100 - rankOffset * 8,
    score,
    division_rank: rankOffset + 1,
    cohort_size: cohort,
  };
}

const MOCK_COHORT: Record<string, number> = {
  "CA:Hockey": 3,
  "CA:Basketball": 2,
  "CA:Soccer": 1,
  "US:Football": 3,
  "US:Basketball": 2,
  "US:Baseball": 1,
};

export const rankingsService = {
  async getRankings(
    division: RankingDivision,
    sport?: string,
    limit = 50,
  ): Promise<RankingRow[]> {
    try {
      const { data } = await api.get("/rankings", {
        params: { division, ...(sport ? { sport } : {}), limit },
      });
      const rows = (data.data ?? []) as RankingRow[];
      if (rows.length === 0) {
        return MOCK_RANKINGS.filter(
          (r) => r.division === division && (!sport || r.sport === sport),
        );
      }
      return rows;
    } catch {
      return MOCK_RANKINGS.filter(
        (r) => r.division === division && (!sport || r.sport === sport),
      );
    }
  },

  async getSports(division: RankingDivision): Promise<string[]> {
    try {
      const { data } = await api.get("/rankings/sports", {
        params: { division },
      });
      const sports = (data.data ?? []) as string[];
      if (sports.length > 0) return sports;
    } catch {
      // fall through to mock
    }
    return Array.from(
      new Set(
        MOCK_RANKINGS.filter((r) => r.division === division).map((r) => r.sport),
      ),
    );
  },

  async getMyRank(): Promise<RankingRow | null> {
    try {
      const { data } = await api.get("/rankings/me");
      return (data.data as RankingRow | null) ?? null;
    } catch {
      return null;
    }
  },

  // Ranking row for any user — powers the credibility chip on the public
  // profile. Same null-on-failure contract as getMyRank so callers can
  // simply hide the chip when this resolves to null.
  async getRankForUser(userId: string): Promise<RankingRow | null> {
    try {
      const { data } = await api.get(`/rankings/user/${userId}`);
      return (data.data as RankingRow | null) ?? null;
    } catch {
      return null;
    }
  },
};
