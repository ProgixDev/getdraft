import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';

@Injectable()
export class MatchesService {
  constructor(private supabaseService: SupabaseService) {}

  async getMatches(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`)
      .eq('is_active', true)
      .order('matched_at', { ascending: false });

    if (!matches || matches.length === 0) return [];

    const results = await Promise.all(
      matches.map(async (match) => {
        const otherUserId =
          match.user_1_id === userId ? match.user_2_id : match.user_1_id;

        // Get other user info
        const { data: otherUser } = await supabase
          .from('users')
          .select('id, name, role, avatar_url, location')
          .eq('id', otherUserId)
          .single();

        // Get recruiter profile if applicable
        let recruiterRole = 'agent';
        let organization = '';
        let verified = false;
        if (otherUser?.role === 'recruiter' || otherUser?.role === 'coach') {
          const { data: rp } = await supabase
            .from('recruiter_profiles')
            .select('role_type, organization, verified')
            .eq('user_id', otherUserId)
            .single();
          if (rp) {
            recruiterRole = rp.role_type;
            organization = rp.organization;
            verified = rp.verified;
          }
        }

        // Get unread count and last message
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('match_id', match.id)
          .eq('is_read', false)
          .neq('sender_id', userId);

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('text')
          .eq('match_id', match.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          id: match.id,
          recruiterName: otherUser?.name || '',
          recruiterRole,
          organization,
          location: otherUser?.location || '',
          verified,
          matchedAt: match.matched_at,
          unreadCount: unreadCount || 0,
          lastMessage: lastMsg?.text || null,
        };
      }),
    );

    return results;
  }

  async getMatch(matchId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (!match) throw new NotFoundException('Match not found');
    if (match.user_1_id !== userId && match.user_2_id !== userId) {
      throw new ForbiddenException('Not your match');
    }

    return match;
  }

  async unmatch(matchId: string, userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: match } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (!match) throw new NotFoundException('Match not found');
    if (match.user_1_id !== userId && match.user_2_id !== userId) {
      throw new ForbiddenException('Not your match');
    }

    await supabase
      .from('matches')
      .update({ is_active: false })
      .eq('id', matchId);

    return { message: 'Unmatched successfully' };
  }
}
