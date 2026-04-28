import api from './api';

export const statsService = {
  async getGlobeStats(): Promise<any> {
    const { data } = await api.get('/stats/globe');
    return data.data;
  },

  async getWelcomeStats(): Promise<any> {
    const { data } = await api.get('/stats/welcome');
    return data.data;
  },

  async getProfileStats(userId: string): Promise<any> {
    const { data } = await api.get(`/stats/profile/${userId}`);
    return data.data;
  },
};
