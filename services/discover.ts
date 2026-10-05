import api from "./api";

/** recruit = athletes ↔ coaches/agents/teams; peer = your own role (Community). */
export type DiscoverMode = "recruit" | "peer";

export interface DiscoverQuery {
  /** Omitted = recruit, which is what every build before Community sent. */
  mode?: DiscoverMode;
  distanceKm?: number;
  includeInternational?: boolean;
  country?: string;
  /** Wilaya / state / province. Narrows within `country`. */
  region?: string;
  city?: string;
  sport?: string;
  recruiterType?: string;
  athletePosition?: string;
  athleteLevel?: string;
  verifiedRecruitersOnly?: boolean;
  page?: number;
  limit?: number;
  // ISO timestamp from a previous response's nextCursor. When set the
  // backend ignores `page` and returns rows strictly older than this.
  cursor?: string;
}

/**
 * Why an athlete can't use the Community right now. Athlete ↔ athlete
 * Community is limited to the same sport and the same age group (13-17 or
 * 18+), so an athlete with no date of birth or no sport cannot be placed,
 * under-13s are never placed, and a minor still waiting on their guardian
 * stays out. `disabled` means the server has athlete Community switched off.
 */
export type CommunityIneligibleReason =
  | "under_13"
  | "missing_dob"
  | "missing_sport"
  | "pending_guardian"
  | "disabled";

/** youth = 13-17, adult = 18+. Athletes only meet their own group. */
export type CommunityAgeGroup = "youth" | "adult";

/**
 * The viewer's Community status, sent with a peer-mode feed. Coaches, agents
 * and parents always get `{ eligible: true, reason: null, sport: null,
 * ageGroup: null }`; for athletes `sport` is their own profile sport (the
 * server ignores the `sport` filter for them) and `ageGroup` their group.
 */
export interface CommunityStatus {
  eligible: boolean;
  reason: CommunityIneligibleReason | null;
  sport: string | null;
  ageGroup: CommunityAgeGroup | null;
}

/** "Ages 13-17" / "Ages 18+", or null when the group is unknown. */
export function ageGroupLabel(
  group: CommunityAgeGroup | null | undefined,
): string | null {
  if (group === "youth") return "Ages 13-17";
  if (group === "adult") return "Ages 18+";
  return null;
}

export interface FeedResponse {
  cards: any[];
  hasMore: boolean;
  /** Drafts left today. "Not counted" when isUnlimitedSwipes() says so. */
  swipesRemaining: number;
  // Remaining Super Drafts this month (separate, always-capped allowance).
  // Optional so an older backend that doesn't send it doesn't break the client.
  superDraftsRemaining?: number;
  // ISO created_at of the last card on this page, or null when there
  // are no more pages. Send back on the next call as `cursor`.
  nextCursor?: string | null;
  /**
   * Peer (Community) mode only; may be absent in recruit mode. Optional so
   * an older backend that doesn't send it keeps working: absent means
   * eligible, with no sport / age-group rule to describe. When `eligible` is
   * false the page is empty and `reason` says why.
   */
  community?: CommunityStatus | null;
}

export interface SwipeResponse {
  matched: boolean;
  matchId: string | null;
  /** Drafts left today. "Not counted" when isUnlimitedSwipes() says so. */
  swipesRemaining: number;
  superDraftsRemaining?: number;
}

/**
 * Whether `swipesRemaining` means "Drafts are not counted", which is the
 * answer for Community (peer mode) on every plan, and for an unlimited plan
 * in recruiting. Two spellings reach the app:
 *   -1      the "no limit" sentinel. It is NOT "none left": a `<= 0` check
 *           on its own would lock the deck.
 *   9999+   what the server has always reported for an unlimited allowance
 *           (9999 plus any bonus Drafts), and what it sends for Community
 *           while builds that lock at `<= 0` are still installed.
 */
export const UNLIMITED_SWIPES_FLOOR = 9999;

export function isUnlimitedSwipes(
  swipesRemaining: number | null | undefined,
): boolean {
  if (typeof swipesRemaining !== "number") return false;
  return swipesRemaining === -1 || swipesRemaining >= UNLIMITED_SWIPES_FLOOR;
}

/**
 * The pool a Draft or Pass on someone you did NOT find in the Discover deck
 * belongs to (Draft Board Accept/Refuse, Who Drafted You "Draft back"): the
 * same role as yours is a Community connection, anything else is recruiting.
 * Returns undefined when either role is unknown, so the request carries no
 * mode and the server works it out from the two accounts.
 *
 * `agent` is how a recruiter profile names the `recruiter` role, so the two
 * are the same role here.
 */
export function swipeModeFor(
  myRole: string | null | undefined,
  otherRole: string | null | undefined,
): DiscoverMode | undefined {
  const norm = (r: string | null | undefined) => {
    const v = (r ?? "").trim().toLowerCase();
    return v === "agent" ? "recruiter" : v;
  };
  const mine = norm(myRole);
  const theirs = norm(otherRole);
  if (!mine || !theirs) return undefined;
  return mine === theirs ? "peer" : "recruit";
}

// Globe is a TALENT MAP of athletes — everyone sees athletes,
// recruiters/coaches draft them. So role is narrowed and the per-card
// athlete fields the new player card needs sit on the same object.
export interface MapPoint {
  id: string;
  name: string | null;
  // Rounded by the server to 2 decimals (about 1 km), so no pin gives away
  // where someone lives. Treat as an area, never an address.
  lat: number;
  lng: number;
  avatar_url: string | null;
  // The map mirrors the Discover role matrix: athletes get coach/agent/team
  // pins, coaches/agents/teams get athlete pins. Athlete-only fields are null
  // on a recruiter pin (and vice-versa) — the card renders what it has.
  // Every coach, agent and team pin is `recruiter` here, as older builds
  // expect; `accountType` says which of the three it is.
  role: "athlete" | "recruiter";
  /** Absent from a server that predates team accounts. */
  accountType?: "athlete" | "coach" | "agent" | "team" | null;
  sport: string | null;
  position: string | null;
  level: string | null;
  class_year: string | null;
  height: string | null;
  gpa: number | null;
  /** Coach/agent/team pins only — their org, agency or club name. */
  organization?: string | null;
  // First gallery photo from athlete_profiles.photos[0]. The globe card
  // falls back to this when avatar_url is missing.
  photo: string | null;
  verified: boolean;
  // True for seeded/demo accounts (@getdraft.app emails). The globe colors
  // these orange and manually-created real users green.
  generated: boolean;
}

export const discoverService = {
  async getFeed(query: DiscoverQuery = {}): Promise<FeedResponse> {
    const { data } = await api.get("/discover/feed", { params: query });
    // The backend TransformInterceptor returns feed responses UNWRAPPED (it skips
    // payloads containing `.cards`), while other endpoints are wrapped in { data }.
    // Handle both shapes so the real feed flows through instead of being dropped.
    return (data?.data ?? data) as FeedResponse;
  },

  async swipe(
    targetUserId: string,
    direction: "draft" | "pass",
    isSuper = false,
    mode?: DiscoverMode,
  ): Promise<SwipeResponse> {
    const { data } = await api.post("/discover/swipe", {
      targetUserId,
      direction,
      // Only send the flag for a Super Draft so a normal swipe payload is
      // unchanged. A Super Draft is always a draft under the hood.
      ...(isSuper ? { isSuper: true } : {}),
      // Every caller that knows the pool says which one it is. The server
      // re-checks the role pair (and, for athlete Community, the sport and
      // age group) per mode, so a card can never be drafted into the wrong
      // kind of match. Left out only when the caller can't tell; the server
      // then treats a same-role pair as Community and anything else as
      // recruiting.
      ...(mode ? { mode } : {}),
    });
    return data.data;
  },

  async whoDraftedMe(): Promise<any[]> {
    const { data } = await api.get("/discover/who-drafted-me");
    return data.data;
  },

  async myDrafts(): Promise<any[]> {
    const { data } = await api.get("/discover/my-drafts");
    return data.data;
  },

  async withdrawDraft(targetUserId: string): Promise<{ withdrawn: boolean }> {
    const { data } = await api.delete(`/discover/drafts/${targetUserId}`);
    return data.data;
  },

  // Globe map — the REAL athletes only (the backend places them by precise
  // coords or by country). No mock fallback by request: an empty or failed
  // result yields an empty globe, never generated players.
  /**
   * `query` was previously not accepted at all, so the globe always showed
   * everyone: the backend has supported country filtering the whole time and
   * nothing ever sent it. Region (wilaya / state / province) rides along the
   * same way.
   */
  async getMapPoints(query?: {
    country?: string;
    region?: string;
    mode?: DiscoverMode;
  }): Promise<MapPoint[]> {
    try {
      const params: Record<string, string> = {};
      if (query?.country) params.country = query.country;
      if (query?.region) params.region = query.region;
      if (query?.mode === "peer") params.mode = "peer";
      // The backend gates `country` behind !includeInternational, so a filter
      // picked here has to turn that off or it is silently ignored.
      if (query?.country || query?.region) params.includeInternational = "false";

      const qs = new URLSearchParams(params).toString();
      const { data } = await api.get(`/discover/map${qs ? `?${qs}` : ""}`);
      const rows = (data?.data ?? data) as MapPoint[];
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  },
};
