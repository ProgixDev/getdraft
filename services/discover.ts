import api from "./api";

export interface DiscoverQuery {
  distanceKm?: number;
  includeInternational?: boolean;
  country?: string;
  city?: string;
  sport?: string;
  recruiterType?: string;
  athletePosition?: string;
  athleteLevel?: string;
  verifiedRecruitersOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface FeedResponse {
  cards: any[];
  hasMore: boolean;
  swipesRemaining: number;
}

export interface SwipeResponse {
  matched: boolean;
  matchId: string | null;
  swipesRemaining: number;
}

// Globe is a TALENT MAP of athletes — everyone sees athletes,
// recruiters/coaches draft them. So role is narrowed and the per-card
// athlete fields the new player card needs sit on the same object.
export interface MapPoint {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  avatar_url: string | null;
  role: "athlete";
  sport: string | null;
  position: string | null;
  level: string | null;
  class_year: string | null;
  height: string | null;
  gpa: number | null;
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
  ): Promise<SwipeResponse> {
    const { data } = await api.post("/discover/swipe", {
      targetUserId,
      direction,
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
  async getMapPoints(): Promise<MapPoint[]> {
    try {
      const { data } = await api.get("/discover/map");
      const rows = (data?.data ?? data) as MapPoint[];
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  },
};
