import api from './api';

export type GuardianRelationship =
  | 'parent'
  | 'legal_guardian'
  | 'step_parent'
  | 'sibling'
  | 'aunt_uncle'
  | 'grandparent'
  | 'other';

export type GuardianLinkStatus =
  | 'pending_video'
  | 'pending_admin'
  | 'approved'
  | 'declined'
  | 'expired';

export interface GuardianLink {
  id: string;
  athlete_user_id?: string;
  guardian_user_id?: string;
  relationship: GuardianRelationship;
  status: GuardianLinkStatus;
  video_storage_path?: string | null;
  video_recorded_at?: string | null;
  decided_at?: string | null;
  admin_notes?: string | null;
  created_at?: string;
  athlete?: { id: string; name: string; profile_photo_url?: string | null };
  guardian?: { id: string; name: string; profile_photo_url?: string | null; email?: string };
}

export const guardianLinksService = {
  // Athlete
  async issueQr(): Promise<{ token: string; expiresAt: string }> {
    const { data } = await api.post('/guardian-links/qr');
    return data.data;
  },

  async listForAthlete(): Promise<GuardianLink[]> {
    const { data } = await api.get('/guardian-links/my-athlete-links');
    return data.data ?? [];
  },

  async revoke(linkId: string): Promise<{ revoked: boolean }> {
    const { data } = await api.delete(`/guardian-links/${linkId}`);
    return data.data;
  },

  // Guardian
  async scan(payload: {
    qrToken: string;
    relationship: GuardianRelationship;
    questionnaire: Record<string, unknown>;
  }): Promise<GuardianLink> {
    const { data } = await api.post('/guardian-links/scan', payload);
    return data.data;
  },

  async getVideoUploadUrl(payload: { linkId: string; fileName: string }): Promise<{
    signedUrl: string;
    token: string;
    path: string;
  }> {
    const { data } = await api.post('/guardian-links/video-upload-url', payload);
    return data.data;
  },

  async submitVideo(payload: { linkId: string; storagePath: string }): Promise<GuardianLink> {
    const { data } = await api.post('/guardian-links/submit-video', payload);
    return data.data;
  },

  async getMyLink(): Promise<GuardianLink | null> {
    const { data } = await api.get('/guardian-links/me');
    return data.data ?? null;
  },

  // Admin
  async adminList(status?: GuardianLinkStatus): Promise<(GuardianLink & { video_url?: string })[]> {
    const { data } = await api.get('/guardian-links/admin', {
      params: status ? { status } : undefined,
    });
    return data.data ?? [];
  },

  async adminApprove(linkId: string, notes?: string): Promise<GuardianLink> {
    const { data } = await api.post(`/guardian-links/admin/${linkId}/approve`, { notes });
    return data.data;
  },

  async adminDecline(linkId: string, notes?: string): Promise<GuardianLink> {
    const { data } = await api.post(`/guardian-links/admin/${linkId}/decline`, { notes });
    return data.data;
  },
};
