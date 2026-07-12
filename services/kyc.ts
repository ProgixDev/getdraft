import api from './api';

export type KycStatus = 'none' | 'pending' | 'in_review' | 'approved' | 'declined';

export interface StartKycResponse {
  sessionId: string;
  url: string;
  status: KycStatus;
}

export interface KycStatusResponse {
  kycStatus: KycStatus;
  sessionId: string | null;
  decisionPreview: { status: string } | null;
}

export const kycService = {
  async start(callbackUrl?: string): Promise<StartKycResponse> {
    const { data } = await api.post('/kyc/start', callbackUrl ? { callbackUrl } : {});
    return data.data;
  },

  async getStatus(): Promise<KycStatusResponse> {
    const { data } = await api.get('/kyc/status');
    return data.data;
  },
};
