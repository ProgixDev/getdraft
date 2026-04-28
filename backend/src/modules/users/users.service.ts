import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { UpdateUserDto } from './dto/update-user.dto';
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
      .update({ ...dto, updated_at: new Date().toISOString() })
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
      .update({ is_onboarded: true, updated_at: new Date().toISOString() })
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
    if (viewerId === viewedId) return;

    const supabase = this.supabaseService.getAdminClient();

    await supabase
      .from('profile_views')
      .insert({ viewer_id: viewerId, viewed_id: viewedId });

    // Increment profile_views counter on athlete_profiles
    await supabase.rpc('increment_profile_views', { target_user_id: viewedId });
  }

  async blockUser(blockerId: string, blockedId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { error } = await supabase
      .from('blocks')
      .insert({ blocker_id: blockerId, blocked_id: blockedId });

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('User already blocked');
      }
      throw new BadRequestException(error.message);
    }

    // Deactivate any existing match
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
