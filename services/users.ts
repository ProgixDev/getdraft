import api from './api';

export const usersService = {
  async getMe(): Promise<any> {
    const { data } = await api.get('/users/me');
    return data.data;
  },

  async updateMe(updates: Record<string, any>): Promise<any> {
    const { data } = await api.put('/users/me', updates);
    return data.data;
  },

  async completeOnboarding(): Promise<void> {
    await api.put('/users/me/onboarding');
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
};
