import api from "./api";

export interface AdminStats {
  totalUsers: number;
  totalMatches: number;
  totalMessages: number;
  byRole: {
    athlete: number;
    coach: number;
    recruiter: number;
    parent: number;
    admin: number;
  };
}

export interface AdminQueueCounts {
  pendingGuardianReviews: number;
  kycPending: number;
  kycDeclined: number;
  bannedTotal: number;
  signupsLast24h: number;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: "athlete" | "coach" | "recruiter" | "parent" | "admin";
  kyc_status?:
    | "none"
    | "pending"
    | "in_review"
    | "approved"
    | "declined"
    | null;
  is_banned?: boolean;
  is_onboarded?: boolean;
  created_at: string;
  avatar_url?: string | null;
}

export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
  page: number;
  totalPages: number;
}

export const adminService = {
  async getStats(): Promise<AdminStats> {
    const { data } = await api.get("/admin/stats");
    return data.data;
  },

  async getQueueCounts(): Promise<AdminQueueCounts> {
    const { data } = await api.get("/admin/queue-counts");
    return data.data;
  },

  async getUsers(
    page = 1,
    limit = 20,
    role?: string,
  ): Promise<AdminUserList> {
    const { data } = await api.get("/admin/users", {
      params: { page, limit, ...(role ? { role } : {}) },
    });
    return data.data;
  },
};
