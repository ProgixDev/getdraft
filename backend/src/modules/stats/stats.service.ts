import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';

@Injectable()
export class StatsService {
  constructor(private supabaseService: SupabaseService) {}

  async getGlobeStats() {
    const supabase = this.supabaseService.getAdminClient();

    // Count users by role and continent (approximated by country)
    const { data: users } = await supabase
      .from('users')
      .select('role, country')
      .eq('is_banned', false);

    const continentMap: Record<string, string> = {
      'United States': 'North America',
      Canada: 'North America',
      Mexico: 'North America',
      Brazil: 'South America',
      Argentina: 'South America',
      Colombia: 'South America',
      'United Kingdom': 'Europe',
      France: 'Europe',
      Germany: 'Europe',
      Spain: 'Europe',
      Italy: 'Europe',
      Netherlands: 'Europe',
      Belgium: 'Europe',
      Switzerland: 'Europe',
      Sweden: 'Europe',
      Norway: 'Europe',
      Australia: 'Oceania',
      'New Zealand': 'Oceania',
      Japan: 'Asia',
      China: 'Asia',
      'South Korea': 'Asia',
      India: 'Asia',
      Nigeria: 'Africa',
      'South Africa': 'Africa',
      Kenya: 'Africa',
      Ghana: 'Africa',
      Egypt: 'Africa',
    };

    const stats: Record<
      string,
      { athletes: number; coaches: number; recruiters: number }
    > = {
      'North America': { athletes: 0, coaches: 0, recruiters: 0 },
      'South America': { athletes: 0, coaches: 0, recruiters: 0 },
      Europe: { athletes: 0, coaches: 0, recruiters: 0 },
      Asia: { athletes: 0, coaches: 0, recruiters: 0 },
      Africa: { athletes: 0, coaches: 0, recruiters: 0 },
      Oceania: { athletes: 0, coaches: 0, recruiters: 0 },
    };

    (users || []).forEach((u) => {
      const continent = continentMap[u.country] || 'Other';
      if (!stats[continent]) return;

      if (u.role === 'athlete') stats[continent].athletes++;
      else if (u.role === 'coach') stats[continent].coaches++;
      else if (u.role === 'recruiter') stats[continent].recruiters++;
    });

    return stats;
  }

  async getWelcomeStats() {
    const supabase = this.supabaseService.getAdminClient();

    const { count: athletes } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'athlete')
      .eq('is_banned', false);

    const { count: coaches } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'coach')
      .eq('is_banned', false);

    const { count: recruiters } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'recruiter')
      .eq('is_banned', false);

    const { count: parents } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'parent')
      .eq('is_banned', false);

    return {
      athletes: athletes || 0,
      coaches: coaches || 0,
      recruiters: recruiters || 0,
      parents: parents || 0,
    };
  }

  async getProfileStats(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: profile } = await supabase
      .from('athlete_profiles')
      .select('profile_views, likes_received, profile_completion')
      .eq('user_id', userId)
      .single();

    const { count: matchCount } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`)
      .eq('is_active', true);

    return {
      profileViews: profile?.profile_views || 0,
      likesReceived: profile?.likes_received || 0,
      profileCompletion: profile?.profile_completion || 0,
      totalMatches: matchCount || 0,
    };
  }
}
