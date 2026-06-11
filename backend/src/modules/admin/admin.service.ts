import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';

@Injectable()
export class AdminService {
  constructor(private supabaseService: SupabaseService) {}

  async getUsers(page = 1, limit = 20, role?: string) {
    const supabase = this.supabaseService.getAdminClient();
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role) {
      query = query.eq('role', role);
    }

    const { data, count, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return {
      users: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  async verifyRecruiter(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('recruiter_profiles')
      .update({ verified: true })
      .eq('user_id', userId)
      .select('id');

    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException('Recruiter profile not found');
    }

    return { message: 'Recruiter verified' };
  }

  async banUser(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('users')
      .update({ is_banned: true })
      .eq('id', userId)
      .select('id');

    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException('User not found');
    }

    return { message: 'User banned' };
  }

  async getStats() {
    const supabase = this.supabaseService.getAdminClient();

    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    const { count: totalMatches } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: totalMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    // Per-role headcounts power the admin dashboard cards. One round trip
    // per role is fine — count(head:true) doesn't pull rows.
    const roles = ['athlete', 'coach', 'recruiter', 'parent', 'admin'] as const;
    const byRoleEntries = await Promise.all(
      roles.map(async (role) => {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', role);
        return [role, count ?? 0] as const;
      }),
    );
    const byRole = Object.fromEntries(byRoleEntries) as Record<
      (typeof roles)[number],
      number
    >;

    return {
      totalUsers: totalUsers || 0,
      totalMatches: totalMatches || 0,
      totalMessages: totalMessages || 0,
      byRole,
    };
  }

  /**
   * Single round-trip the admin dashboard polls — pending review counts
   * and recent activity counters. Cheap (count-only) queries; keeps the
   * UI from fanning out 5 parallel requests.
   */
  async getQueueCounts() {
    const supabase = this.supabaseService.getAdminClient();

    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      pendingGuardianReviews,
      kycPending,
      kycDeclined,
      bannedTotal,
      signupsLast24h,
    ] = await Promise.all([
      supabase
        .from('guardian_links')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_admin'),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('kyc_status', 'pending'),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('kyc_status', 'declined'),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_banned', true),
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sinceIso),
    ]);

    return {
      pendingGuardianReviews: pendingGuardianReviews.count ?? 0,
      kycPending: kycPending.count ?? 0,
      kycDeclined: kycDeclined.count ?? 0,
      bannedTotal: bannedTotal.count ?? 0,
      signupsLast24h: signupsLast24h.count ?? 0,
    };
  }
}
