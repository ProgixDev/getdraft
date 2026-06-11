import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { UpdateUserDto } from './dto/update-user.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { CurrentUserPayload } from '../../common/types';

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  async getMe(user: CurrentUserPayload) {
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      throw new NotFoundException('User not found');
    }

    return data;
  }

  async updateMe(user: CurrentUserPayload, dto: UpdateUserDto) {
    const supabase = this.supabaseService.getAdminClient();

    // If role is being changed (OAuth signup hits this right after the
    // provider returns), we MUST mirror it onto auth.users.user_metadata.
    // JwtAuthGuard reads `user_metadata.role` for every request, and
    // RolesGuard checks against that — without this mirror an OAuth
    // recruiter gets 403 on /outreach, and an OAuth parent isn't blocked
    // from /discover/swipe. The public.users column is the authoritative
    // app value; user_metadata is the JWT view of it.
    if (dto.role) {
      const { data: authUser, error: readErr } =
        await supabase.auth.admin.getUserById(user.id);
      if (readErr || !authUser?.user) {
        throw new BadRequestException(
          `Could not read auth user: ${readErr?.message ?? 'not found'}`,
        );
      }
      // Merge so we don't clobber other metadata (name set at signup, etc).
      const mergedMeta = {
        ...(authUser.user.user_metadata ?? {}),
        role: dto.role,
      };
      const { error: metaErr } = await supabase.auth.admin.updateUserById(
        user.id,
        { user_metadata: mergedMeta },
      );
      if (metaErr) {
        throw new BadRequestException(
          `Could not update auth metadata: ${metaErr.message}`,
        );
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update(dto)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async completeOnboarding(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    // Parents MUST have a real guardian_links row (pending_admin or
    // approved) before is_onboarded can flip to true. Client-side
    // preferences are not trustworthy — preferences is a free-form JSONB
    // a parent could PUT themselves. This is the server-authoritative
    // half of the guardian gate; the client mirrors the same rule.
    const { data: existing, error: readErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    if (readErr || !existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.role === 'parent') {
      const { data: link } = await supabase
        .from('guardian_links')
        .select('id, status')
        .eq('guardian_user_id', userId)
        .in('status', ['pending_admin', 'approved'])
        .maybeSingle();
      if (!link) {
        throw new BadRequestException(
          'Guardian link required before onboarding can be completed.',
        );
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update({ is_onboarded: true })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async getPublicProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, role, avatar_url, location, country, created_at')
      .eq('id', userId)
      .eq('is_banned', false)
      .single();

    if (error || !user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async trackProfileView(viewerId: string, viewedId: string) {
    if (viewerId === viewedId) return { tracked: false };

    const supabase = this.supabaseService.getAdminClient();

    await supabase
      .from('profile_views')
      .insert({ viewer_id: viewerId, viewed_id: viewedId });

    await supabase.rpc('increment_profile_views', { target_user_id: viewedId });

    return { tracked: true };
  }

  async listProfileViewers(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data } = await supabase
      .from('profile_views')
      .select(
        `id, created_at,
         viewer:users!profile_views_viewer_id_fkey(id, name, avatar_url, role, location)`,
      )
      .eq('viewed_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    return data || [];
  }

  async listMyBlocks(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data } = await supabase
      .from('blocks')
      .select(
        `id, blocked_id, reason, created_at,
         blocked:users!blocks_blocked_id_fkey(id, name, avatar_url, role)`,
      )
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });

    return data || [];
  }

  async searchUsers(meId: string, q: string, limit: number) {
    const supabase = this.supabaseService.getAdminClient();
    const term = (q ?? '').trim();
    let query = supabase
      .from('users')
      .select('id, name, avatar_url, role')
      .neq('id', meId)
      .eq('is_banned', false)
      .order('name', { ascending: true })
      .limit(limit);
    if (term.length > 0) {
      const escaped = term.replace(/[%_\\]/g, (m) => `\\${m}`);
      query = query.ilike('name', `%${escaped}%`);
    }
    const { data } = await query;
    return (data ?? []).map((u: any) => ({
      id: u.id as string,
      name: (u.name as string) ?? '',
      avatarUrl: (u.avatar_url as string) ?? null,
      role: (u.role as string) ?? null,
    }));
  }

  async blockUser(blockerId: string, blockedId: string, dto: BlockUserDto) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase.from('blocks').insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason: dto.reason ?? null,
    });

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('User already blocked');
      }
      throw new BadRequestException(error.message);
    }

    await supabase
      .from('matches')
      .update({ is_active: false })
      .or(
        `and(user_1_id.eq.${blockerId},user_2_id.eq.${blockedId}),and(user_1_id.eq.${blockedId},user_2_id.eq.${blockerId})`,
      );

    return { message: 'User blocked' };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);

    if (error) {
      throw new BadRequestException(error.message);
    }

    return { message: 'User unblocked' };
  }
}
