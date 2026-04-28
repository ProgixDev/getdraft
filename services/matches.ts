import api from './api';

export const matchesService = {
  async getMatches(): Promise<any[]> {
    const { data } = await api.get('/matches');
    return data.data;
  },

  async getMatch(matchId: string): Promise<any> {
    const { data } = await api.get(`/matches/${matchId}`);
    return data.data;
  },

  async unmatch(matchId: string): Promise<void> {
    await api.delete(`/matches/${matchId}`);
  },
};
