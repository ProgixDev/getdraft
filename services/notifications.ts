import api from './api';

export const notificationsService = {
  async registerToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    await api.post('/notifications/register-token', { token, platform });
  },

  async removeToken(token: string): Promise<void> {
    await api.delete('/notifications/token', { data: { token } });
  },

  async getNotifications(): Promise<any[]> {
    const { data } = await api.get('/notifications');
    return data.data;
  },
};
