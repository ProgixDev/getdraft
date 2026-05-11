import api from './api';

export interface PaymentSheetParams {
  paymentIntentClientSecret: string;
  ephemeralKeySecret: string;
  customerId: string;
  publishableKey: string;
  subscriptionId: string;
}

export const subscriptionsService = {
  async getMySubscription(): Promise<any> {
    const { data } = await api.get('/subscriptions/me');
    return data.data;
  },

  /** Web Checkout path — kept for any non-mobile entry points. */
  async createCheckout(planId: string): Promise<{ checkoutUrl: string }> {
    const { data } = await api.post('/subscriptions/checkout', { planId });
    return data.data;
  },

  /** Mobile Payment Sheet bundle — the one we use on the device. */
  async createPaymentSheet(planId: string): Promise<PaymentSheetParams> {
    const { data } = await api.post('/subscriptions/payment-sheet', { planId });
    return data.data;
  },

  async createPortal(): Promise<{ portalUrl: string }> {
    const { data } = await api.post('/subscriptions/portal');
    return data.data;
  },
};
