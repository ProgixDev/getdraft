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
}

// Demo seed for the talent map — every entry is an athlete with a
// headshot, realistic sport/position/level/class-year/height/GPA, and a
// real CA or US lat/lng. Surfaces a populated globe in offline or pre-
// seeded environments; live athletes with lat/lng will replace these
// once signup persists coordinates (currently only country is saved).
//
// Photo URLs are Unsplash headshots (free-use). avatar_url is null on
// purpose so the card's `avatar_url ?? photo` fallback exercises the
// `photo` path that real athletes will hit until they set an avatar.
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
    level: "U SPORTS",
    class_year: "2026",
    height: "6'1\"",
    gpa: 3.7,
    photo:
      "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=600&q=80",
    verified: true,
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
    level: "CEGEP",
    class_year: "2027",
    height: "5'9\"",
    gpa: 3.9,
    photo:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&q=80",
    verified: false,
  },
  {
    id: "mock-globe-vancouver",
    name: "Noah Gagnon",
    lat: 49.2827,
    lng: -123.1207,
    avatar_url: null,
    role: "athlete",
    sport: "Soccer",
    position: "Striker",
    level: "U SPORTS",
    class_year: "2026",
    height: "5'11\"",
    gpa: 3.4,
    photo:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&q=80",
    verified: false,
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
    level: "NCAA D1",
    class_year: "2026",
    height: "5'10\"",
    gpa: 3.8,
    photo:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=600&q=80",
    verified: true,
  },
  {
    id: "mock-globe-austin",
    name: "Jacob Miller",
    lat: 30.2672,
    lng: -97.7431,
    avatar_url: null,
    role: "athlete",
    sport: "Football",
    position: "Quarterback",
    level: "NCAA D1",
    class_year: "2027",
    height: "6'3\"",
    gpa: 3.5,
    photo:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80",
    verified: false,
  },
  {
    id: "mock-globe-miami",
    name: "Mason Davis",
    lat: 25.7617,
    lng: -80.1918,
    avatar_url: null,
    role: "athlete",
    sport: "Football",
    position: "Wide Receiver",
    level: "NCAA D1",
    class_year: "2026",
    height: "6'0\"",
    gpa: 3.2,
    photo:
      "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&q=80",
    verified: true,
  },
  {
    id: "mock-globe-chicago",
    name: "Ava Johnson",
    lat: 41.8781,
    lng: -87.6298,
    avatar_url: null,
    role: "athlete",
    sport: "Basketball",
    position: "Center",
    level: "NCAA D2",
    class_year: "2028",
    height: "6'2\"",
    gpa: 3.6,
    photo:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&q=80",
    verified: false,
  },
  {
    id: "mock-globe-nyc",
    name: "James Brown",
    lat: 40.7128,
    lng: -74.006,
    avatar_url: null,
    role: "athlete",
    sport: "Baseball",
    position: "Pitcher",
    level: "NCAA D1",
    class_year: "2026",
    height: "6'2\"",
    gpa: 3.3,
    photo:
      "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600&q=80",
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
