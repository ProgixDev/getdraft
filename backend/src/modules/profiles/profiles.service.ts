import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { UpsertAthleteProfileDto } from './dto/athlete-profile.dto';
import { UpsertRecruiterProfileDto } from './dto/recruiter-profile.dto';
import { UpsertParentProfileDto } from './dto/parent-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(private supabaseService: SupabaseService) {}

  // --- Athlete Profile ---

  async getAthleteProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('athlete_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Athlete profile not found');
    }
    return data;
  }

  async upsertAthleteProfile(userId: string, dto: UpsertAthleteProfileDto) {
    const supabase = this.supabaseService.getAdminClient();
    const profileCompletion = this.calculateAthleteCompletion(dto);

    const { data: existing } = await supabase
      .from('athlete_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('athlete_profiles')
        .update({
          ...dto,
          profile_completion: profileCompletion,
        })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    const { data, error } = await supabase
      .from('athlete_profiles')
      .insert({
        user_id: userId,
        ...dto,
        profile_completion: profileCompletion,
      })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // --- Recruiter Profile ---

  async getRecruiterProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('recruiter_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Recruiter profile not found');
    }
    return data;
  }

  async upsertRecruiterProfile(userId: string, dto: UpsertRecruiterProfileDto) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: existing } = await supabase
      .from('recruiter_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('recruiter_profiles')
        .update({ ...dto })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    const { data, error } = await supabase
      .from('recruiter_profiles')
      .insert({ user_id: userId, ...dto })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // --- Parent Profile ---

  async getParentProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data, error } = await supabase
      .from('parent_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Parent profile not found');
    }
    return data;
  }

  async upsertParentProfile(userId: string, dto: UpsertParentProfileDto) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: existing } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('parent_profiles')
        .update({ ...dto })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    const { data, error } = await supabase
      .from('parent_profiles')
      .insert({ user_id: userId, ...dto })
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // --- Public profile by user ID ---

  async getPublicProfile(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, name, role, avatar_url, location, country')
      .eq('id', userId)
      // Banned users disappear from public lookups (matches users.service.ts
      // getPublicProfile + searchUsers). Returns 404 so the client can't
      // distinguish "doesn't exist" from "suspended".
      .eq('is_banned', false)
      .single();

    if (!user) throw new NotFoundException('User not found');

    let profile = null;
    if (user.role === 'athlete') {
      const { data } = await supabase
        .from('athlete_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      profile = data;
    } else if (user.role === 'coach' || user.role === 'recruiter') {
      const { data } = await supabase
        .from('recruiter_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      profile = data;
    } else if (user.role === 'parent') {
      const { data } = await supabase
        .from('parent_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      profile = data;
    }

    return { ...user, profile };
  }

  // --- Helpers ---

  private calculateAthleteCompletion(dto: UpsertAthleteProfileDto): number {
    const fields = [
      dto.sport,
      dto.position,
      dto.level,
      dto.bio,
      dto.class_year,
      dto.gpa,
      dto.height,
      dto.weight,
      (dto.photos?.length ?? 0) > 0,
      (dto.videos?.length ?? 0) > 0,
      (dto.awards?.length ?? 0) > 0,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }
}
