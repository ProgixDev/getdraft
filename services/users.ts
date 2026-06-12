import api from "./api";

export const usersService = {
  async getMe(): Promise<any> {
    const { data } = await api.get("/users/me");
    return data.data;
  },

  async updateMe(updates: Record<string, any>): Promise<any> {
    const { data } = await api.put("/users/me", updates);
    return data.data;
  },

  async completeOnboarding(): Promise<void> {
    // Opt this call out of api.ts's session-expired auto-logout. If the
    // PUT 401s right at the end of signup (e.g. the access token aged
    // out while the user lingered on KYC / questions / tutorial / plan)
    // and refresh also fails, the AuthScreen's finishOnboarding catch
    // already flips Redux's isOnboarded locally and routes into the
    // app. Letting api.ts dispatch logout in parallel would tear
    // isAuthenticated down and bounce the user to login instead.
    await api.put("/users/me/onboarding", undefined, {
      skipSessionExpiredHandler: true,
    } as any);
  },

  async getPublicUser(userId: string): Promise<any> {
    const { data } = await api.get(`/users/${userId}`);
    return data.data;
  },

  async trackProfileView(userId: string): Promise<void> {
    await api.post(`/users/${userId}/view`);
  },

  async blockUser(userId: string, reason?: string): Promise<void> {
    await api.post(`/users/${userId}/block`, reason ? { reason } : undefined);
  },

  async unblockUser(userId: string): Promise<void> {
    await api.delete(`/users/${userId}/block`);
  },

  async searchUsers(
    q: string,
    limit = 20,
  ): Promise<{ id: string; name: string; avatarUrl: string | null; role: string | null }[]> {
    const { data } = await api.get("/users/search", { params: { q, limit } });
    return data.data;
  },
};
