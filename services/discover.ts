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
};
