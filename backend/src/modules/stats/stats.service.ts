import { Injectable, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { UserRole } from '../../common/types';

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

  /**
   * Counters behind the profile stats bar.
   *
   * Only the athlete's own bar is public (Profile Views / Drafts / Matches on
   * app/user/[userId].tsx) — everything else here is private. This used to
   * answer for ANY id, which let a caller enumerate view and match counts for
   * coaches, recruiters and parents, who surface them nowhere.
   */
  async getProfileStats(userId: string, viewerId: string, viewerRole: UserRole) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('role, is_banned, preferences')
      .eq('id', userId)
      .maybeSingle();

    const isOwnerOrAdmin = viewerId === userId || viewerRole === UserRole.ADMIN;
    if (!isOwnerOrAdmin) {
      // Mirrors discover.service: the flag lives in free-form JSONB, so
      // ABSENT must mean visible; only an explicit `false` hides.
      const hidden = (user?.preferences as any)?.profileVisible === false;
      if (user?.role !== 'athlete' || user.is_banned || hidden) {
        throw new ForbiddenException('Not allowed to view these stats.');
      }
    }

    const { count: matchCount } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .or(`user_1_id.eq.${userId},user_2_id.eq.${userId}`)
      .eq('is_active', true);

    const { count: viewCount } = await supabase
      .from('profile_views')
      .select('*', { count: 'exact', head: true })
      .eq('viewed_id', userId);

    if (user?.role === 'athlete') {
      const { data: profile } = await supabase
        .from('athlete_profiles')
        .select('profile_views, likes_received, profile_completion')
        .eq('user_id', userId)
        .maybeSingle();

      const publicBar = {
        role: user.role,
        profileViews: profile?.profile_views ?? viewCount ?? 0,
        likesReceived: profile?.likes_received ?? 0,
        totalMatches: matchCount ?? 0,
      };
      // profileCompletion is an onboarding nudge for the athlete, not a
      // public credential — it tells a stranger how much of a minor's
      // profile is still blank.
      if (!isOwnerOrAdmin) return publicBar;
      return {
        ...publicBar,
        profileCompletion: profile?.profile_completion ?? 0,
      };
    }

    // Non-athlete (or missing) target — only reachable for self/admin, since
    // the check above already rejected everyone else.
    return {
      role: user?.role ?? null,
      profileViews: viewCount ?? 0,
      likesReceived: 0,
      profileCompletion: 0,
      totalMatches: matchCount ?? 0,
    };
  }
}
