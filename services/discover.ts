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

export interface MapPoint {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
  avatar_url: string | null;
  role: "athlete" | "coach" | "recruiter";
  sport: string | null;
  position: string | null;
  recruiterType: "agent" | "coach" | null;
  verified: boolean;
}

// Small geo-spread demo set so the globe is never blank when the backend
// is unreachable or hasn't yet been seeded with users that have lat/lng.
const MOCK_MAP_POINTS: MapPoint[] = [
  {
    id: "mock-globe-toronto",
    name: "Liam Tremblay",
    lat: 43.6532,
    lng: -79.3832,
    avatar_url: null,
    role: "athlete",
    sport: "Hockey",
    position: "Center",
    recruiterType: null,
    verified: false,
  },
  {
    id: "mock-globe-montreal",
    name: "Olivia Bergeron",
    lat: 45.5019,
    lng: -73.5674,
    avatar_url: null,
    role: "athlete",
    sport: "Basketball",
    position: "Guard",
    recruiterType: null,
    verified: false,
  },
  {
    id: "mock-globe-austin",
    name: "Marcus Johnson",
    lat: 30.2672,
    lng: -97.7431,
    avatar_url: null,
    role: "recruiter",
    sport: "Football",
    position: null,
    recruiterType: "agent",
    verified: true,
  },
  {
    id: "mock-globe-la",
    name: "Sophia Martinez",
    lat: 34.0522,
    lng: -118.2437,
    avatar_url: null,
    role: "athlete",
    sport: "Basketball",
    position: "Guard",
    recruiterType: null,
    verified: false,
  },
  {
    id: "mock-globe-nyc",
    name: "Coach Reed",
    lat: 40.7128,
    lng: -74.006,
    avatar_url: null,
    role: "coach",
    sport: "Soccer",
    position: null,
    recruiterType: "coach",
    verified: false,
  },
];

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

  // Globe map — minimal candidates with coordinates. Same shape as the
  // feed but only role/sport/coords/avatar so the WebView payload is
  // small. Graceful try/catch → mock fallback so the globe is never
  // blank in demos or when the backend is offline.
  async getMapPoints(): Promise<MapPoint[]> {
    try {
      const { data } = await api.get("/discover/map");
      const rows = (data?.data ?? data) as MapPoint[];
      if (Array.isArray(rows) && rows.length > 0) return rows;
      return MOCK_MAP_POINTS;
    } catch {
      return MOCK_MAP_POINTS;
    }
  },
};
