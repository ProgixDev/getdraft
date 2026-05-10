import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { SwipeDto } from './dto/swipe.dto';
import {
  CurrentUserPayload,
  UserRole,
  SwipeDirection,
  PlanId,
} from '../../common/types';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(
    private supabaseService: SupabaseService,
    private notificationsService: NotificationsService,
  ) {}

  async getFeed(user: CurrentUserPayload, query: DiscoverQueryDto) {
    if (user.role === UserRole.PARENT) {
      throw new ForbiddenException('Parents do not have a discover feed');
    }

    const offset = ((query.page || 1) - 1) * (query.limit || 20);
    const limit = query.limit || 20;

    const swipesRemaining = await this.getSwipesRemaining(user.id);

    const isAthlete = user.role === UserRole.ATHLETE;
    if (isAthlete) {
      return this.getRecruiterFeed(user.id, query, offset, limit, swipesRemaining);
    }
    return this.getAthleteFeed(user.id, query, offset, limit, swipesRemaining);
  }

  private async getRecruiterFeed(
    userId: string,
    query: DiscoverQueryDto,
    offset: number,
    limit: number,
    swipesRemaining: number,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: swipedIds } = await supabase
      .from('swipes')
      .select('swiped_id')
      .eq('swiper_id', userId);
    const excludeIds = (swipedIds || []).map((s) => s.swiped_id);

    const { data: blockedIds } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', userId);
    const blockIds = (blockedIds || []).map((b) => b.blocked_id);

    const { data: blockedByIds } = await supabase
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', userId);
    const blockedByList = (blockedByIds || []).map((b) => b.blocker_id);

    const allExcluded = [...excludeIds, ...blockIds, ...blockedByList, userId];

    let dbQuery = supabase
      .from('users')
      .select(
        `id, name, avatar_url, location, country, latitude, longitude,
         recruiter_profiles!inner(organization, sport, role_type, verified, tags, bio, photos, videos)`,
      )
      .in('role', ['coach', 'recruiter'])
      .eq('is_banned', false);

    if (allExcluded.length > 0) {
      dbQuery = dbQuery.not('id', 'in', `(${allExcluded.join(',')})`);
    }

    if (query.sport && query.sport !== 'all') {
      dbQuery = dbQuery.eq('recruiter_profiles.sport', query.sport);
    }
    if (query.recruiterType && query.recruiterType !== 'all') {
      dbQuery = dbQuery.eq('recruiter_profiles.role_type', query.recruiterType);
    }
    if (query.verifiedRecruitersOnly) {
      dbQuery = dbQuery.eq('recruiter_profiles.verified', true);
    }
    if (query.country && !query.includeInternational) {
      dbQuery = dbQuery.eq('country', query.country);
    }

    const { data: users, error } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new BadRequestException(error.message);

    const cards = (users || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      role: u.recruiter_profiles.role_type,
      organization: u.recruiter_profiles.organization,
      location: u.location,
      country: u.country,
      distanceKm: 0,
      sport: u.recruiter_profiles.sport,
      verified: u.recruiter_profiles.verified,
      tags: u.recruiter_profiles.tags || [],
      bio: u.recruiter_profiles.bio,
      photos: u.recruiter_profiles.photos || [],
      videos: u.recruiter_profiles.videos || [],
      imageUrl: u.avatar_url || (u.recruiter_profiles.photos?.[0] ?? null),
    }));

    return { cards, hasMore: cards.length === limit, swipesRemaining };
  }

  private async getAthleteFeed(
    userId: string,
    query: DiscoverQueryDto,
    offset: number,
    limit: number,
    swipesRemaining: number,
  ) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: swipedIds } = await supabase
      .from('swipes')
      .select('swiped_id')
      .eq('swiper_id', userId);
    const excludeIds = (swipedIds || []).map((s) => s.swiped_id);

    const { data: blockedIds } = await supabase
      .from('blocks')
      .select('blocked_id')
      .eq('blocker_id', userId);
    const blockIds = (blockedIds || []).map((b) => b.blocked_id);

    const { data: blockedByIds } = await supabase
      .from('blocks')
      .select('blocker_id')
      .eq('blocked_id', userId);
    const blockedByList = (blockedByIds || []).map((b) => b.blocker_id);

    const allExcluded = [...excludeIds, ...blockIds, ...blockedByList, userId];

    let dbQuery = supabase
      .from('users')
      .select(
        `id, name, avatar_url, location, country, latitude, longitude,
         athlete_profiles!inner(sport, position, level, bio, class_year, gpa, height, weight, photos, videos, forty_yard_dash, awards)`,
      )
      .eq('role', 'athlete')
      .eq('is_banned', false);

    if (allExcluded.length > 0) {
      dbQuery = dbQuery.not('id', 'in', `(${allExcluded.join(',')})`);
    }

    if (query.sport && query.sport !== 'all') {
      dbQuery = dbQuery.eq('athlete_profiles.sport', query.sport);
    }
    if (query.athletePosition && query.athletePosition !== 'all') {
      dbQuery = dbQuery.eq('athlete_profiles.position', query.athletePosition);
    }
    if (query.athleteLevel && query.athleteLevel !== 'all') {
      dbQuery = dbQuery.eq('athlete_profiles.level', query.athleteLevel);
    }
    if (query.country && !query.includeInternational) {
      dbQuery = dbQuery.eq('country', query.country);
    }

    const { data: users, error } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new BadRequestException(error.message);

    const cards = (users || []).map((u: any) => ({
      id: u.id,
      name: u.name,
      sport: u.athlete_profiles.sport,
      position: u.athlete_profiles.position,
      level: u.athlete_profiles.level,
      location: u.location,
      country: u.country,
      distanceKm: 0,
      classYear: u.athlete_profiles.class_year,
      gpa: u.athlete_profiles.gpa,
      height: u.athlete_profiles.height,
      weight: u.athlete_profiles.weight,
      photos: u.athlete_profiles.photos || [],
      videos: u.athlete_profiles.videos || [],
      bio: u.athlete_profiles.bio,
      fortyYardDash: u.athlete_profiles.forty_yard_dash,
      awards: u.athlete_profiles.awards || [],
    }));

    return { cards, hasMore: cards.length === limit, swipesRemaining };
  }

  async swipe(user: CurrentUserPayload, dto: SwipeDto) {
    if (user.id === dto.targetUserId) {
      throw new BadRequestException('Cannot swipe yourself');
    }

    const supabase = this.supabaseService.getAdminClient();

    const { data: existingBlock } = await supabase
      .from('blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${dto.targetUserId}),and(blocker_id.eq.${dto.targetUserId},blocked_id.eq.${user.id})`,
      )
      .limit(1)
      .maybeSingle();

    if (existingBlock) {
      throw new ForbiddenException('Cannot swipe a blocked user');
    }

    const remaining = await this.getSwipesRemaining(user.id);
    if (remaining === 0) {
      throw new ForbiddenException(
        'Daily swipe limit reached. Upgrade your plan for more swipes.',
      );
    }

    const { error: swipeError } = await supabase.from('swipes').insert({
      swiper_id: user.id,
      swiped_id: dto.targetUserId,
      direction: dto.direction,
    });

    if (swipeError) {
      if (swipeError.code === '23505') {
        throw new ConflictException('Already swiped on this user');
      }
      throw new BadRequestException(swipeError.message);
    }

    await supabase.rpc('increment_swipes_used', { target_user_id: user.id });

    let matched = false;
    let matchId: string | null = null;

    if (dto.direction === SwipeDirection.DRAFT) {
      await supabase.rpc('increment_likes_received', {
        target_user_id: dto.targetUserId,
      });

      const { data: mutualSwipe } = await supabase
        .from('swipes')
        .select('id')
        .eq('swiper_id', dto.targetUserId)
        .eq('swiped_id', user.id)
        .eq('direction', SwipeDirection.DRAFT)
        .maybeSingle();

      if (mutualSwipe) {
        const [user1, user2] =
          user.id < dto.targetUserId
            ? [user.id, dto.targetUserId]
            : [dto.targetUserId, user.id];

        const { data: match, error: matchError } = await supabase
          .from('matches')
          .insert({ user_1_id: user1, user_2_id: user2 })
          .select('id')
          .maybeSingle();

        if (matchError) {
          this.logger.warn(
            `Match creation failed for ${user1}/${user2}: ${matchError.message}`,
          );
        } else if (match) {
          matched = true;
          matchId = match.id;

          // Push "Game On!" to both users (best-effort; method swallows its own errors)
          const { data: names } = await supabase
            .from('users')
            .select('id, name')
            .in('id', [user.id, dto.targetUserId]);
          const nameOf = (id: string) =>
            names?.find((n) => n.id === id)?.name ?? 'Someone';
          const data = { type: 'new_match', matchId: match.id };
          await Promise.all([
            this.notificationsService.sendPushToUser(
              dto.targetUserId,
              'Game On! 🤝',
              `You matched with ${nameOf(user.id)}`,
              data,
            ),
            this.notificationsService.sendPushToUser(
              user.id,
              'Game On! 🤝',
              `You matched with ${nameOf(dto.targetUserId)}`,
              data,
            ),
          ]);
        }
      }
    }

    const swipesRemaining = await this.getSwipesRemaining(user.id);
    return { matched, matchId, swipesRemaining };
  }

  async whoDraftedMe(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .maybeSingle();

    const planId = (sub?.plan_id as PlanId) || PlanId.BASIC;
    if (planId !== PlanId.PRO && planId !== PlanId.PREMIUM) {
      throw new ForbiddenException(
        'Upgrade to Pro or Premium to see who drafted you',
      );
    }

    const { data } = await supabase
      .from('swipes')
      .select(
        `swiped_id, created_at,
         swiper:users!swipes_swiper_id_fkey(id, name, avatar_url, role, location)`,
      )
      .eq('swiped_id', userId)
      .eq('direction', SwipeDirection.DRAFT)
      .order('created_at', { ascending: false })
      .limit(50);

    return data || [];
  }

  private async getSwipesRemaining(userId: string): Promise<number> {
    const supabase = this.supabaseService.getAdminClient();

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('daily_swipe_limit, swipes_used_today, swipes_reset_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (!sub) return 10;

    const today = new Date().toISOString().split('T')[0];
    if (sub.swipes_reset_at !== today) {
      await supabase
        .from('subscriptions')
        .update({ swipes_used_today: 0, swipes_reset_at: today })
        .eq('user_id', userId);
      return sub.daily_swipe_limit === -1 ? 999 : sub.daily_swipe_limit;
    }

    if (sub.daily_swipe_limit === -1) return 999;
    return Math.max(0, sub.daily_swipe_limit - sub.swipes_used_today);
  }
}
