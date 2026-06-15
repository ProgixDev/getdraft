import api from "./api";

export interface PaymentSheetParams {
  paymentIntentClientSecret: string;
  ephemeralKeySecret: string;
  customerId: string;
  publishableKey: string;
  subscriptionId: string;
}

export const subscriptionsService = {
  async getMySubscription(): Promise<any> {
    const { data } = await api.get("/subscriptions/me");
    return data.data;
  },

  /**
   * Call right after the subscription Payment Sheet succeeds — reconciles the
   * plan from Stripe immediately instead of waiting for the webhook. Returns
   * the fresh subscription. Safe to call even if the webhook also fires.
   */
  async confirmSubscription(): Promise<any> {
    const { data } = await api.post("/subscriptions/confirm");
    return data.data;
  },

  /** Call right after a swipe-pack Payment Sheet succeeds. */
  async confirmSwipePack(
    paymentIntentId: string,
  ): Promise<{ bonus_swipes: number; status: string }> {
    const { data } = await api.post("/subscriptions/swipe-pack/confirm", {
      paymentIntentId,
    });
    return data.data;
  },

  /** Web Checkout path — kept for any non-mobile entry points. */
  async createCheckout(planId: string): Promise<{ checkoutUrl: string }> {
    const { data } = await api.post("/subscriptions/checkout", { planId });
    return data.data;
  },

  /** Mobile Payment Sheet bundle — the one we use on the device. */
  async createPaymentSheet(planId: string): Promise<PaymentSheetParams> {
    const { data } = await api.post("/subscriptions/payment-sheet", { planId });
    return data.data;
  },

  async createPortal(): Promise<{ portalUrl: string }> {
    const { data } = await api.post("/subscriptions/portal");
    return data.data;
  },

  async cancel(immediate = false): Promise<{
    canceled: boolean;
    status?: string;
    atPeriodEnd?: boolean;
    cancelAt?: string | null;
    message?: string;
  }> {
    const { data } = await api.post("/subscriptions/cancel", { immediate });
    return data.data;
  },

  async resume(): Promise<{ resumed: boolean; status?: string }> {
    const { data } = await api.post("/subscriptions/resume");
    return data.data;
  },

  async listSwipePacks(): Promise<
    Array<{ id: string; swipes: number; amountCents: number; label: string }>
  > {
    const { data } = await api.get("/subscriptions/swipe-packs");
    return data.data;
  },

  async buySwipePackSheet(packId: string): Promise<
    PaymentSheetParams & {
      paymentIntentId: string;
      pack: { id: string; swipes: number; amountCents: number; label: string };
    }
  > {
    const { data } = await api.post("/subscriptions/swipe-pack", { packId });
    return data.data;
  },
};
