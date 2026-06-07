import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DiscoverQueryDto } from './dto/discover-query.dto';
import { SwipeDto } from './dto/swipe.dto';
import {
  CurrentUserPayload,
  UserRole,
  SwipeDirection,
  PlanId,
} from '../../common/types';

@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(private prisma: PrismaService) {}

  async getFeed(user: CurrentUserPayload, query: DiscoverQueryDto) {
    if (user.role === UserRole.PARENT) {
      throw new ForbiddenException('Parents do not have a discover feed');
    }

    const offset = ((query.page || 1) - 1) * (query.limit || 20);
    const limit = query.limit || 20;

    const swipesRemaining = await this.getSwipesRemaining(user.id);

    // Open feed: every athlete/coach/recruiter sees everyone.
    return this.getEveryoneFeed(user.id, query, offset, limit, swipesRemaining);
  }

  private athleteCardFromUser(u: any) {
    const p = u.athlete_profiles;
    return {
      cardType: 'athlete' as const,
      id: u.id,
      name: u.name,
      sport: p.sport,
      position: p.position,
      level: p.level,
      location: u.location,
      country: u.country,
      distanceKm: 0,
      classYear: p.class_year,
      gpa: p.gpa,
      height: p.height,
      weight: p.weight,
      photos: p.photos || [],
      videos: p.videos || [],
      bio: p.bio,
      fortyYardDash: p.forty_yard_dash,
      awards: p.awards || [],
    };
  }

  private recruiterCardFromUser(u: any) {
    const p = u.recruiter_profiles;
    return {
      cardType: 'recruiter' as const,
      id: u.id,
      name: u.name,
      role: p.role_type,
      organization: p.organization,
      location: u.location,
      country: u.country,
      distanceKm: 0,
      sport: p.sport,
      verified: p.verified,
      tags: p.tags || [],
      bio: p.bio,
      photos: p.photos || [],
      videos: p.videos || [],
      imageUrl: u.avatar_url || (p.photos?.[0] ?? null),
    };
  }

  private async getEveryoneFeed(
    userId: string,
    query: DiscoverQueryDto,
    offset: number,
    limit: number,
    swipesRemaining: number,
  ) {
    const excluded = await this.excludedUserIds(userId);

    const where: Prisma.public_usersWhereInput = {
      role: { in: ['athlete', 'coach', 'recruiter'] },
      is_banned: false,
      id: { notIn: excluded },
    };
    if (query.country && !query.includeInternational) where.country = query.country;
    if (query.sport && query.sport !== 'all') {
      where.OR = [
        { athlete_profiles: { is: { sport: query.sport } } },
        { recruiter_profiles: { is: { sport: query.sport } } },
      ];
    }

    const users = await this.prisma.public_users.findMany({
      where,
      select: {
        id: true,
        name: true,
        avatar_url: true,
        role: true,
        location: true,
        country: true,
        latitude: true,
        longitude: true,
        athlete_profiles: {
          select: {
            sport: true,
            position: true,
            level: true,
            bio: true,
            class_year: true,
            gpa: true,
            height: true,
            weight: true,
            photos: true,
            videos: true,
            forty_yard_dash: true,
            awards: true,
          },
        },
        recruiter_profiles: {
          select: {
            organization: true,
            sport: true,
            role_type: true,
            verified: true,
            tags: true,
            bio: true,
            photos: true,
            videos: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: limit,
    });

    const cards = users
      .map((u) => {
        if (u.role === 'athlete' && u.athlete_profiles) {
          return this.athleteCardFromUser(u);
        }
        if ((u.role === 'coach' || u.role === 'recruiter') && u.recruiter_profiles) {
          return this.recruiterCardFromUser(u);
        }
        return null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return { cards, hasMore: users.length === limit, swipesRemaining };
  }

  private async excludedUserIds(userId: string): Promise<string[]> {
    const [swiped, blocked, blockedBy] = await Promise.all([
      this.prisma.swipes.findMany({
        where: { swiper_id: userId },
        select: { swiped_id: true },
      }),
      this.prisma.blocks.findMany({
        where: { blocker_id: userId },
        select: { blocked_id: true },
      }),
      this.prisma.blocks.findMany({
        where: { blocked_id: userId },
        select: { blocker_id: true },
      }),
    ]);

    return [
      ...swiped.map((s) => s.swiped_id),
      ...blocked.map((b) => b.blocked_id),
      ...blockedBy.map((b) => b.blocker_id),
      userId,
    ];
  }

  async swipe(user: CurrentUserPayload, dto: SwipeDto) {
    if (user.id === dto.targetUserId) {
      throw new BadRequestException('Cannot swipe yourself');
    }

    const existingBlock = await this.prisma.blocks.findFirst({
      where: {
        OR: [
          { blocker_id: user.id, blocked_id: dto.targetUserId },
          { blocker_id: dto.targetUserId, blocked_id: user.id },
        ],
      },
      select: { id: true },
    });

    if (existingBlock) {
      throw new ForbiddenException('Cannot swipe a blocked user');
    }

    const remaining = await this.getSwipesRemaining(user.id);
    if (remaining === 0) {
      throw new ForbiddenException(
        'Daily swipe limit reached. Upgrade your plan for more swipes.',
      );
    }

    try {
      await this.prisma.swipes.create({
        data: {
          swiper_id: user.id,
          swiped_id: dto.targetUserId,
          direction: dto.direction,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Already swiped on this user');
      }
      throw new BadRequestException((e as Error).message);
    }

    await this.prisma.$executeRawUnsafe(
      'select public.increment_swipes_used($1::uuid)',
      user.id,
    );

    let matched = false;
    let matchId: string | null = null;

    if (dto.direction === SwipeDirection.DRAFT) {
      await this.prisma.$executeRawUnsafe(
        'select public.increment_likes_received($1::uuid)',
        dto.targetUserId,
      );

      const mutualSwipe = await this.prisma.swipes.findFirst({
        where: {
          swiper_id: dto.targetUserId,
          swiped_id: user.id,
          direction: SwipeDirection.DRAFT,
        },
        select: { id: true },
      });

      if (mutualSwipe) {
        const [user1, user2] =
          user.id < dto.targetUserId
            ? [user.id, dto.targetUserId]
            : [dto.targetUserId, user.id];

        try {
          const match = await this.prisma.matches.create({
            data: { user_1_id: user1, user_2_id: user2 },
            select: { id: true },
          });
          matched = true;
          matchId = match.id;
        } catch (e) {
          this.logger.warn(
            `Match creation failed for ${user1}/${user2}: ${(e as Error).message}`,
          );
        }
      }
    }

    const swipesRemaining = await this.getSwipesRemaining(user.id);
    return { matched, matchId, swipesRemaining };
  }

  async whoDraftedMe(userId: string) {
    const sub = await this.prisma.subscriptions.findUnique({
      where: { user_id: userId },
      select: { plan_id: true },
    });

    const planId = (sub?.plan_id as PlanId) || PlanId.BASIC;
    if (planId !== PlanId.PRO && planId !== PlanId.PREMIUM) {
      throw new ForbiddenException(
        'Upgrade to Pro or Premium to see who drafted you',
      );
    }

    const rows = await this.prisma.swipes.findMany({
      where: { swiped_id: userId, direction: SwipeDirection.DRAFT },
      select: {
        swiped_id: true,
        created_at: true,
        users_swipes_swiper_idTousers: {
          select: {
            id: true,
            name: true,
            avatar_url: true,
            role: true,
            location: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return rows.map((r) => ({
      swiped_id: r.swiped_id,
      created_at: r.created_at,
      swiper: r.users_swipes_swiper_idTousers,
    }));
  }

  private async getSwipesRemaining(userId: string): Promise<number> {
    const sub = await this.prisma.subscriptions.findUnique({
      where: { user_id: userId },
      select: {
        daily_swipe_limit: true,
        swipes_used_today: true,
        swipes_reset_at: true,
      },
    });

    if (!sub) return 10;

    const todayStr = new Date().toISOString().split('T')[0];
    const resetAtStr = sub.swipes_reset_at
      ? sub.swipes_reset_at.toISOString().split('T')[0]
      : null;

    if (resetAtStr !== todayStr) {
      await this.prisma.subscriptions.update({
        where: { user_id: userId },
        data: { swipes_used_today: 0, swipes_reset_at: new Date(todayStr) },
      });
      return sub.daily_swipe_limit === -1 ? 999 : sub.daily_swipe_limit;
    }

    if (sub.daily_swipe_limit === -1) return 999;
    return Math.max(0, sub.daily_swipe_limit - (sub.swipes_used_today ?? 0));
  }
}
