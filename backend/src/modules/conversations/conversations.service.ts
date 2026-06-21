import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';

interface ParticipantRow {
  id: string;
  name: string | null;
  avatar_url: string | null;
  role: string | null;
  is_banned?: boolean | null;
}

@Injectable()
export class ConversationsService {
  constructor(private supabaseService: SupabaseService) {}

  // ----- pair canonicalization -----
  private canonical(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  // ----- get or create with another user -----
  async getOrCreate(meId: string, otherUserId: string) {
    if (meId === otherUserId) {
      throw new BadRequestException('Cannot DM yourself');
    }
    const supabase = this.supabaseService.getAdminClient();

    // Confirm the other user exists and isn't banned.
    const { data: other } = await supabase
      .from('users')
      .select('id, name, avatar_url, role, is_banned')
      .eq('id', otherUserId)
      .maybeSingle();
    if (!other || other.is_banned) {
      throw new NotFoundException('User not found');
    }

    // Block enforcement (either direction): a blocked/blocking pair must not
    // be able to start or reopen a DM. Mirrors discover.service.swipe().
    if (await this.isBlockedPair(meId, otherUserId)) {
      throw new ForbiddenException('Cannot message a blocked user');
    }

    const [userA, userB] = this.canonical(meId, otherUserId);

    // Try to find existing conversation
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_a_id', userA)
      .eq('user_b_id', userB)
      .maybeSingle();

    let convId = existing?.id as string | undefined;
    if (!convId) {
      const { data: inserted, error } = await supabase
        .from('conversations')
        .insert({ user_a_id: userA, user_b_id: userB })
        .select('id')
        .single();
      if (error || !inserted) {
        throw new BadRequestException(
          error?.message ?? 'Could not create conversation',
        );
      }
      convId = inserted.id;
    }

    return {
      id: convId,
      otherUser: this.shapeUser(other as ParticipantRow),
    };
  }

  async getInbox(meId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: rows, error } = await supabase
      .from('conversations')
      .select(
        'id, user_a_id, user_b_id, last_message, last_message_at, ' +
          'a:users!conversations_user_a_id_fkey(id, name, avatar_url, role, is_banned), ' +
          'b:users!conversations_user_b_id_fkey(id, name, avatar_url, role, is_banned)',
      )
      .or(`user_a_id.eq.${meId},user_b_id.eq.${meId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new BadRequestException(error.message);

    const list = rows ?? [];
    const ids = list.map((c: any) => c.id as string);
    const unread = await this.fetchUnreadCounts(meId, ids);
    // Drop conversations whose other participant is blocked (either direction)
    // so a blocked user disappears from the messaging inbox.
    const blockedIds = await this.blockedUserIds(meId);

    return list
      .map((row: any) => {
        const otherRow = (row.user_a_id === meId ? row.b : row.a) as
          | ParticipantRow
          | null;
        if (!otherRow) return null;
        if (blockedIds.has(otherRow.id)) return null;
        // Hide conversations whose other participant is banned, so a banned
        // user no longer surfaces in the inbox (mirrors the REST auth-guard
        // ban check). Already-running threads stay queryable by id; the
        // gateway/socket layer enforces the deeper sends.
        if (otherRow.is_banned === true) return null;
        return {
          id: row.id as string,
          otherUser: this.shapeUser(otherRow),
          lastMessage: (row.last_message as string) ?? null,
          lastMessageAt: (row.last_message_at as string) ?? null,
          unreadCount: unread.get(row.id as string) ?? 0,
        };
      })
      .filter(Boolean);
  }

  async getMessages(meId: string, conversationId: string, cursor?: string) {
    await this.assertParticipant(meId, conversationId);
    const supabase = this.supabaseService.getAdminClient();

    let q = supabase
      .from('direct_messages')
      .select('id, sender_id, text, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (cursor) q = q.lt('created_at', cursor);

    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);

    const rows = (data ?? []).reverse();
    return rows.map((r: any) => ({
      id: r.id as string,
      senderId: r.sender_id as string,
      text: r.text as string,
      createdAt: r.created_at as string,
    }));
  }

  async sendMessage(meId: string, conversationId: string, text: string) {
    const otherUserId = await this.assertParticipant(meId, conversationId);
    if (otherUserId && (await this.isBlockedPair(meId, otherUserId))) {
      throw new ForbiddenException('Cannot message a blocked user');
    }
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: meId,
        text,
      })
      .select('id, sender_id, text, created_at')
      .single();
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'send failed');
    }
    return {
      id: data.id as string,
      senderId: data.sender_id as string,
      text: data.text as string,
      createdAt: data.created_at as string,
    };
  }

  async markRead(meId: string, conversationId: string) {
    await this.assertParticipant(meId, conversationId);
    const supabase = this.supabaseService.getAdminClient();
    const { error } = await supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', meId)
      .is('read_at', null);
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  // ---------- helpers ----------

  private async assertParticipant(
    meId: string,
    conversationId: string,
  ): Promise<string | null> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('conversations')
      .select('id, user_a_id, user_b_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!data) throw new NotFoundException('Conversation not found');
    if (data.user_a_id !== meId && data.user_b_id !== meId) {
      throw new ForbiddenException('Not a participant');
    }
    return data.user_a_id === meId ? data.user_b_id : data.user_a_id;
  }

  /** True if either user has blocked the other. */
  private async isBlockedPair(a: string, b: string): Promise<boolean> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${a},blocked_id.eq.${b}),` +
          `and(blocker_id.eq.${b},blocked_id.eq.${a})`,
      )
      .limit(1);
    return (data?.length ?? 0) > 0;
  }

  /** All user ids the caller has blocked OR been blocked by. */
  private async blockedUserIds(meId: string): Promise<Set<string>> {
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${meId},blocked_id.eq.${meId}`);
    const set = new Set<string>();
    for (const row of data ?? []) {
      const r = row as { blocker_id: string; blocked_id: string };
      set.add(r.blocker_id === meId ? r.blocked_id : r.blocker_id);
    }
    return set;
  }

  private async fetchUnreadCounts(meId: string, convIds: string[]) {
    const map = new Map<string, number>();
    if (convIds.length === 0) return map;
    const supabase = this.supabaseService.getAdminClient();
    const { data } = await supabase
      .from('direct_messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', meId)
      .is('read_at', null);
    for (const row of data ?? []) {
      const k = (row as any).conversation_id as string;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }

  private shapeUser(row: ParticipantRow) {
    return {
      id: row.id,
      name: row.name ?? '',
      avatarUrl: row.avatar_url ?? null,
      role: row.role ?? null,
    };
  }
}
