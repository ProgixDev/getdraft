import api from './api';

export const subscriptionsService = {
  async getMySubscription(): Promise<any> {
    const { data } = await api.get('/subscriptions/me');
    return data.data;
  },

  async createCheckout(planId: string): Promise<{ checkoutUrl: string }> {
    const { data } = await api.post('/subscriptions/checkout', { planId });
    return data.data;
  },

  async createPortal(): Promise<{ portalUrl: string }> {
    const { data } = await api.post('/subscriptions/portal');
    return data.data;
  },
};
