import { Injectable, BadRequestException } from '@nestjs/common';
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

    const { error } = await supabase
      .from('recruiter_profiles')
      .update({ verified: true })
      .eq('user_id', userId);

    if (error) throw new BadRequestException(error.message);

    return { message: 'Recruiter verified' };
  }

  async banUser(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase
      .from('users')
      .update({ is_banned: true })
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);

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

    return {
      totalUsers: totalUsers || 0,
      totalMatches: totalMatches || 0,
      totalMessages: totalMessages || 0,
    };
  }
}
