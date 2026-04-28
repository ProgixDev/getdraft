import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';

@Injectable()
export class ChatService {
  constructor(private supabaseService: SupabaseService) {}

  async getThreads(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`)
      .eq('is_active', true)
      .order('matched_at', { ascending: false });

    if (!matches) return [];

    const threads = await Promise.all(
      matches.map(async (match) => {
        const otherUserId =
          match.user_1_id === userId ? match.user_2_id : match.user_1_id;

        const { data: otherUser } = await supabase
          .from('users')
          .select('id, name, role, avatar_url')
          .eq('id', otherUserId)
          .single();

        const { data: rp } = await supabase
          .from('recruiter_profiles')
          .select('role_type, organization, verified')
          .eq('user_id', otherUserId)
          .single();

        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('match_id', match.id)
          .eq('is_read', false)
          .neq('sender_id', userId);

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('text, created_at')
          .eq('match_id', match.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          id: match.id,
          recruiterName: otherUser?.name || '',
          recruiterRole: rp?.role_type || 'agent',
          organization: rp?.organization || '',
          verified: rp?.verified || false,
          unreadCount: unreadCount || 0,
          lastMessage: lastMsg?.text || null,
          lastMessageAt: lastMsg?.created_at || match.matched_at,
        };
      }),
    );

    return threads;
  }

  async getMessages(
    matchId: string,
    userId: string,
    cursor?: string,
    limit = 50,
  ) {
    await this.verifyMatchAccess(matchId, userId);

    const supabase = this.supabaseService.getAdminClient();

    let query = supabase
      .from('messages')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data } = await query;

    // Mark unread messages as read
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('match_id', matchId)
      .eq('is_read', false)
      .neq('sender_id', userId);

    return (data || []).reverse();
  }

  async sendMessage(matchId: string, userId: string, text: string) {
    await this.verifyMatchAccess(matchId, userId);

    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('messages')
      .insert({
        match_id: matchId,
        sender_id: userId,
        text,
      })
      .select()
      .single();

    if (error) throw new NotFoundException(error.message);

    return data;
  }

  async markAsRead(matchId: string, userId: string) {
    await this.verifyMatchAccess(matchId, userId);

    const supabase = this.supabaseService.getAdminClient();

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('match_id', matchId)
      .eq('is_read', false)
      .neq('sender_id', userId);

    return { message: 'Messages marked as read' };
  }

  private async verifyMatchAccess(matchId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: match } = await supabase
      .from('matches')
      .select('user_1_id, user_2_id, is_active')
      .eq('id', matchId)
      .single();

    if (!match) throw new NotFoundException('Match not found');
    if (!match.is_active) throw new ForbiddenException('Match is no longer active');
    if (match.user_1_id !== userId && match.user_2_id !== userId) {
      throw new ForbiddenException('Not authorized');
    }
  }
}
