import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { writeAuthzClaims } from '../../common/utils/authz-claims';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private supabaseService: SupabaseService,
    private chatGateway: ChatGateway,
  ) {}

  async getUsers(
    page = 1,
    limit = 20,
    role?: string,
    /**
     * Server-side flag filters used by the admin Users tab so the count
     * matches the list past the first page. 'kyc_pending' covers both
     * 'pending' (session created) and 'in_review' (Didit processing) —
     * same set the dashboard's queue counts use.
     */
    flag?: 'kyc_pending' | 'kyc_declined' | 'banned',
  ) {
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
    if (flag === 'kyc_pending') {
      query = query.in('kyc_status', ['pending', 'in_review']);
    } else if (flag === 'kyc_declined') {
      query = query.eq('kyc_status', 'declined');
    } else if (flag === 'banned') {
      query = query.eq('is_banned', true);
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

    // Flipping the column alone left a banned user with full API access:
    // JwtAuthGuard reads the flag from auth.users.app_metadata (it asks
    // GoTrue on every request, so the change applies to tokens already
    // issued). app_metadata, not user_metadata -- the user can write the
    // latter themselves and would just un-ban themselves (authz-claims.ts).
    // writeAuthzClaims returns its error instead of throwing, and that
    // error used to be dropped: the admin saw "User banned" while the guard
    // still let the user in. It is the step that matters, so it must work.
    const { error: claimErr } = await writeAuthzClaims(supabase, userId, {
      is_banned: true,
    });
    if (claimErr) {
      throw new InternalServerErrorException(
        'The ban was saved but is not enforced yet. Try again.',
      );
    }
    // Also ban in Supabase Auth itself, so no new session can be started and
    // no refresh token can be used. (The old signOut(userId, 'global') did
    // nothing: signOut takes an access token, not a user id.)
    const { error: authBanErr } = await supabase.auth.admin.updateUserById(
      userId,
      { ban_duration: '876000h' },
    );
    if (authBanErr) {
      this.logger.warn(`auth ban failed for ${userId}: ${authBanErr.message}`);
    }

    // Revoking sessions does not close a chat socket that is already open.
    try {
      this.chatGateway.disconnectUser(userId);
    } catch {
      // Best-effort: the gateway also re-checks the ban on every send.
    }

    return { message: 'User banned' };
  }

  async unbanUser(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('users')
      .update({ is_banned: false })
      .eq('id', userId)
      .select('id');

    if (error) throw new BadRequestException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException('User not found');
    }

    // Mirror of banUser: clear the guard's flag and the Supabase Auth ban,
    // so the user can sign in again. Write `false` rather than deleting the
    // key: an absent claim sends the guard down its legacy-account DB
    // fallback on every request until it repairs itself.
    const { error: claimErr } = await writeAuthzClaims(supabase, userId, {
      is_banned: false,
    });
    const { error: authBanErr } = await supabase.auth.admin.updateUserById(
      userId,
      { ban_duration: 'none' },
    );
    if (claimErr || authBanErr) {
      throw new InternalServerErrorException(
        'The unban was saved but the account is still locked. Try again.',
      );
    }

    return { message: 'User unbanned' };
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
    const roles = [
      'athlete',
      'coach',
      'recruiter',
      'team',
      'parent',
      'admin',
    ] as const;
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
      // KYC pipeline writes both 'pending' (session created locally) and
      // 'in_review' (Didit accepted the upload and is processing it).
      // kyc.service treats them as one active set; the dashboard count
      // must match or in-review users vanish from the queue.
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('kyc_status', ['pending', 'in_review']),
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
