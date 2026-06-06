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
