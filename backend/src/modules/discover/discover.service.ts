import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
  HttpStatus,
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
} from '../../common/types';
import { NotificationsService } from '../notifications/notifications.service';

// ── Globe placement ────────────────────────────────────────────────
// CA/US division mapping for the rankings view + anywhere else that
// asks "is this user in the CA or US ranking pool?" Intentionally narrow
// — adding countries here would silently widen the rankings divisions.
// Globe placement uses the much broader COUNTRY_CENTROIDS map below.
// (Currently unreferenced inside this file after placeByCountry switched
// to COUNTRY_CENTROIDS; kept for parity with the rankings view and for
// future TS callers that need the CA/US/OTHER classification.)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function normalizeCountryToKey(country: string | null): string | null {
  const c = (country ?? '').trim().toLowerCase();
  if (['canada', 'ca', 'can'].includes(c)) return 'CA';
  if (
    [
      'usa',
      'us',
      'united states',
      'united states of america',
      'u.s.a.',
      'u.s.',
      'america',
    ].includes(c)
  ) {
    return 'US';
  }
  return null;
}

// Broad country → approximate centroid map for globe placement. Used ONLY
// by placeByCountry when a user has a country but no precise lat/lng yet.
// Keys are lowercased country name; common aliases share a centroid via
// COUNTRY_ALIASES. Adding a country here just plots its athletes near the
// centroid — it does NOT affect the CA/US division logic above.
const COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  // North America
  canada: { lat: 56.13, lng: -106.35 },
  'united states': { lat: 39.83, lng: -98.58 },
  mexico: { lat: 23.63, lng: -102.55 },
  // Central America + Caribbean
  cuba: { lat: 21.52, lng: -77.78 },
  'dominican republic': { lat: 18.74, lng: -70.16 },
  jamaica: { lat: 18.11, lng: -77.3 },
  'puerto rico': { lat: 18.22, lng: -66.59 },
  panama: { lat: 8.54, lng: -80.78 },
  // South America
  brazil: { lat: -14.24, lng: -51.93 },
  argentina: { lat: -38.42, lng: -63.62 },
  chile: { lat: -35.68, lng: -71.54 },
  colombia: { lat: 4.57, lng: -74.3 },
  peru: { lat: -9.19, lng: -75.02 },
  uruguay: { lat: -32.52, lng: -55.77 },
  venezuela: { lat: 6.42, lng: -66.59 },
  ecuador: { lat: -1.83, lng: -78.18 },
  // Western Europe
  'united kingdom': { lat: 55.38, lng: -3.44 },
  ireland: { lat: 53.41, lng: -8.24 },
  france: { lat: 46.23, lng: 2.21 },
  germany: { lat: 51.17, lng: 10.45 },
  spain: { lat: 40.46, lng: -3.75 },
  portugal: { lat: 39.4, lng: -8.22 },
  italy: { lat: 41.87, lng: 12.57 },
  netherlands: { lat: 52.13, lng: 5.29 },
  belgium: { lat: 50.5, lng: 4.47 },
  switzerland: { lat: 46.82, lng: 8.23 },
  austria: { lat: 47.52, lng: 14.55 },
  // Nordics
  sweden: { lat: 60.13, lng: 18.64 },
  norway: { lat: 60.47, lng: 8.47 },
  finland: { lat: 61.92, lng: 25.75 },
  denmark: { lat: 56.26, lng: 9.5 },
  iceland: { lat: 64.96, lng: -19.02 },
  // Central + Eastern Europe
  poland: { lat: 51.92, lng: 19.15 },
  'czech republic': { lat: 49.82, lng: 15.47 },
  hungary: { lat: 47.16, lng: 19.5 },
  romania: { lat: 45.94, lng: 24.97 },
  bulgaria: { lat: 42.73, lng: 25.49 },
  ukraine: { lat: 48.38, lng: 31.17 },
  greece: { lat: 39.07, lng: 21.82 },
  turkey: { lat: 38.96, lng: 35.24 },
  russia: { lat: 61.52, lng: 105.32 },
  serbia: { lat: 44.02, lng: 21.01 },
  croatia: { lat: 45.1, lng: 15.2 },
  // North Africa
  morocco: { lat: 31.79, lng: -7.09 },
  algeria: { lat: 28.03, lng: 1.66 },
  tunisia: { lat: 33.89, lng: 9.54 },
  libya: { lat: 26.34, lng: 17.23 },
  egypt: { lat: 26.82, lng: 30.8 },
  // Sub-Saharan Africa
  nigeria: { lat: 9.08, lng: 8.68 },
  'south africa': { lat: -30.56, lng: 22.94 },
  kenya: { lat: -0.02, lng: 37.91 },
  ethiopia: { lat: 9.15, lng: 40.49 },
  ghana: { lat: 7.95, lng: -1.03 },
  senegal: { lat: 14.5, lng: -14.45 },
  cameroon: { lat: 7.37, lng: 12.35 },
  uganda: { lat: 1.37, lng: 32.29 },
  tanzania: { lat: -6.37, lng: 34.89 },
  // Middle East
  israel: { lat: 31.05, lng: 34.85 },
  'saudi arabia': { lat: 23.89, lng: 45.08 },
  'united arab emirates': { lat: 23.42, lng: 53.85 },
  qatar: { lat: 25.35, lng: 51.18 },
  jordan: { lat: 30.59, lng: 36.24 },
  lebanon: { lat: 33.85, lng: 35.86 },
  iran: { lat: 32.43, lng: 53.69 },
  iraq: { lat: 33.22, lng: 43.68 },
  // South + Southeast Asia
  india: { lat: 20.59, lng: 78.96 },
  pakistan: { lat: 30.38, lng: 69.35 },
  bangladesh: { lat: 23.68, lng: 90.36 },
  'sri lanka': { lat: 7.87, lng: 80.77 },
  thailand: { lat: 15.87, lng: 100.99 },
  vietnam: { lat: 14.06, lng: 108.28 },
  indonesia: { lat: -0.79, lng: 113.92 },
  philippines: { lat: 12.88, lng: 121.77 },
  malaysia: { lat: 4.21, lng: 101.98 },
  singapore: { lat: 1.35, lng: 103.82 },
  // East Asia
  china: { lat: 35.86, lng: 104.2 },
  japan: { lat: 36.2, lng: 138.25 },
  'south korea': { lat: 35.91, lng: 127.77 },
  taiwan: { lat: 23.7, lng: 120.96 },
  'hong kong': { lat: 22.32, lng: 114.17 },
  // Oceania
  australia: { lat: -25.27, lng: 133.78 },
  'new zealand': { lat: -40.9, lng: 174.89 },
};

// Aliases (variants of the same country) → canonical lowercase key in
// COUNTRY_CENTROIDS. Avoids duplicating centroid coordinates.
const COUNTRY_ALIASES: Record<string, string> = {
  ca: 'canada',
  can: 'canada',
  us: 'united states',
  usa: 'united states',
  'u.s.': 'united states',
  'u.s.a.': 'united states',
  'united states of america': 'united states',
  america: 'united states',
  uk: 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  uae: 'united arab emirates',
  emirates: 'united arab emirates',
  'czech republic': 'czech republic',
  czechia: 'czech republic',
  korea: 'south korea',
  'republic of korea': 'south korea',
  'south korea': 'south korea',
  'south africa': 'south africa',
  rsa: 'south africa',
  'hong kong sar': 'hong kong',
  hk: 'hong kong',
  'new zealand': 'new zealand',
  nz: 'new zealand',
};

function normalizeCountryForCentroid(country: string | null): string | null {
  const raw = (country ?? '').trim().toLowerCase();
  if (!raw) return null;
  // Centroid hit (or alias hit) wins; otherwise null.
  if (COUNTRY_CENTROIDS[raw]) return raw;
  const aliased = COUNTRY_ALIASES[raw];
  if (aliased && COUNTRY_CENTROIDS[aliased]) return aliased;
  return null;
}

// Stable per-user hash so the country offset is deterministic (same spread
// every reload, and two same-country athletes don't stack on one point).
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function placeByCountry(
  country: string | null,
  userId: string,
): { lat: number; lng: number } | null {
  const key = normalizeCountryForCentroid(country);
  if (!key) return null;
  const base = COUNTRY_CENTROIDS[key];
  const h = hashString(userId);
  // Mask to non-negative 10-bit slices so the offsets stay bounded — a raw
  // `h % 1000` can be negative (h is a signed 32-bit int) and would fling a
  // US athlete down to the Caribbean.
  const latOff = ((h & 0x3ff) / 1024 - 0.5) * 12; // ±6°, bits 0-9
  const lngOff = (((h >> 10) & 0x3ff) / 1024 - 0.5) * 18; // ±9°, bits 10-19
  return { lat: base.lat + latOff, lng: base.lng + lngOff };
}

@Injectable()
export class DiscoverService {
  private readonly logger = new Logger(DiscoverService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

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
      is_banned: false,
      id: { notIn: excluded },
    };
    if (query.country && !query.includeInternational) where.country = query.country;

    // Normalise "all"/empty sentinels to "no filter".
    const sport =
      query.sport && query.sport !== 'all' ? query.sport : undefined;
    const position =
      query.athletePosition && query.athletePosition !== 'all'
        ? query.athletePosition
        : undefined;
    const level =
      query.athleteLevel && query.athleteLevel !== 'all'
        ? query.athleteLevel
        : undefined;
    const recruiterType =
      query.recruiterType && query.recruiterType !== 'all'
        ? query.recruiterType
        : undefined;
    const verifiedOnly = query.verifiedRecruitersOnly === true;

    // Apply each filter only to the role it belongs to (athlete filters must
    // not exclude recruiters and vice-versa), then OR the two role branches.
    // distanceKm is intentionally NOT applied — viewer coordinates aren't
    // captured at signup, so there's nothing to measure distance against yet.
    const athleteProfileFilter: any = {};
    if (sport) athleteProfileFilter.sport = sport;
    if (position) athleteProfileFilter.position = position;
    if (level) athleteProfileFilter.level = level;

    const recruiterProfileFilter: any = {};
    if (sport) recruiterProfileFilter.sport = sport;
    if (recruiterType) recruiterProfileFilter.role_type = recruiterType;
    if (verifiedOnly) recruiterProfileFilter.verified = true;

    const athleteBranch: Prisma.public_usersWhereInput = { role: 'athlete' };
    if (Object.keys(athleteProfileFilter).length) {
      athleteBranch.athlete_profiles = { is: athleteProfileFilter };
    }

    const recruiterBranch: Prisma.public_usersWhereInput = {
      role: { in: ['coach', 'recruiter'] },
    };
    if (Object.keys(recruiterProfileFilter).length) {
      recruiterBranch.recruiter_profiles = { is: recruiterProfileFilter };
    }

    where.OR = [athleteBranch, recruiterBranch];

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

  // Globe = talent map of athletes shown to EVERY viewer (recruiters and
  // coaches do the drafting, athletes browse the field too). Same
  // not-yet-swiped, non-blocked filtering as the feed, narrowed to role
  // 'athlete'. Each athlete is placed by precise lat/lng when set, else by
  // their country center — so real athletes appear even before signup
  // captures coordinates. Parents stay 403 — they don't draft.
  async getMapPoints(user: CurrentUserPayload) {
    if (user.role === UserRole.PARENT) {
      throw new ForbiddenException('Parents do not have a discover feed');
    }

    const excluded = await this.excludedUserIds(user.id);

    const users = await this.prisma.public_users.findMany({
      where: {
        role: 'athlete',
        is_banned: false,
        id: { notIn: [...excluded, user.id] },
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar_url: true,
        kyc_status: true,
        country: true,
        latitude: true,
        longitude: true,
        athlete_profiles: {
          select: {
            sport: true,
            position: true,
            level: true,
            class_year: true,
            height: true,
            gpa: true,
            photos: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    let skippedNoCoords = 0;
    const placed = users
      .map((u) => {
        const p = u.athlete_profiles;
        if (!p) return null;
        // Precise coords win; otherwise place by country (+ deterministic
        // per-user offset). Signup saves country only today, so this is what
        // makes REAL athletes show on the globe until lat/lng is captured.
        let lat: number;
        let lng: number;
        if (u.latitude !== null && u.longitude !== null) {
          lat = Number(u.latitude);
          lng = Number(u.longitude);
        } else {
          const fallback = placeByCountry(u.country, u.id);
          if (!fallback) {
            skippedNoCoords += 1;
            return null;
          }
          lat = fallback.lat;
          lng = fallback.lng;
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const photos = Array.isArray(p.photos) ? (p.photos as string[]) : [];
        return {
          id: u.id,
          name: u.name,
          lat,
          lng,
          avatar_url: u.avatar_url,
          role: 'athlete' as const,
          sport: p.sport,
          position: p.position,
          level: p.level,
          class_year: p.class_year,
          height: p.height,
          gpa: p.gpa != null ? Number(p.gpa) : null,
          // First gallery photo, surfaced so the globe card has something
          // to render when the user hasn't set a separate avatar_url.
          photo: photos[0] ?? null,
          verified: u.kyc_status === 'approved',
          // Seeded/demo accounts are created with @getdraft.app emails;
          // manually-created real users sign up with their own email. The
          // globe paints seeded points orange and real users green so they
          // can be told apart at a glance.
          generated: (u.email ?? '').toLowerCase().endsWith('@getdraft.app'),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    // Visibility: how many athletes were dropped because they had neither
    // precise coords NOR a country in COUNTRY_CENTROIDS. If this number
    // grows we'll see it in the backend logs and know to widen the map.
    if (skippedNoCoords > 0) {
      this.logger.warn(
        `getMapPoints: dropped ${skippedNoCoords} athlete(s) with no coords and an unsupported country`,
      );
    }
    return placed;
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
    // Parents have no draft actions (mirrors getFeed/getMapPoints/myDrafts).
    if (user.role === UserRole.PARENT) {
      throw new ForbiddenException('Parents do not have draft actions');
    }
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
      // 429 per spec (work-plan C2 "11th basic swipe -> 429"); distinct from
      // the 403s used for role/block rejections so the client can tell them
      // apart and show the upgrade CTA.
      throw new HttpException(
        'Daily swipe limit reached. Upgrade your plan for more swipes.',
        HttpStatus.TOO_MANY_REQUESTS,
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

    // Spend daily quota first; if it's exhausted, dip into bonus_swipes.
    const subForSpend = await this.prisma.subscriptions.findUnique({
      where: { user_id: user.id },
      select: {
        daily_swipe_limit: true,
        swipes_used_today: true,
        bonus_swipes: true,
      },
    });
    const dailyLeft = subForSpend
      ? subForSpend.daily_swipe_limit === -1
        ? 999
        : Math.max(
            0,
            subForSpend.daily_swipe_limit - (subForSpend.swipes_used_today ?? 0),
          )
      : 0;
    if (dailyLeft > 0) {
      await this.prisma.$executeRawUnsafe(
        'select public.increment_swipes_used($1::uuid)',
        user.id,
      );
    } else if (subForSpend && subForSpend.bonus_swipes > 0) {
      await this.prisma.subscriptions.update({
        where: { user_id: user.id },
        data: { bonus_swipes: { decrement: 1 } },
      });
    }

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
          // Unique violation = an active match already exists for this pair
          // (backfill, race between both sides swiping, or a previous successful
          // insert). Fetch the existing row and treat the swipe as matched.
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            const existing = await this.prisma.matches.findFirst({
              where: { user_1_id: user1, user_2_id: user2 },
              select: { id: true, is_active: true },
            });
            if (existing) {
              if (!existing.is_active) {
                await this.prisma.matches.update({
                  where: { id: existing.id },
                  data: { is_active: true },
                });
              }
              matched = true;
              matchId = existing.id;
            }
          } else {
            // Any other failure (check constraint, FK, RLS, connection) is a
            // genuine bug. Surface it loudly so it can't silently regress.
            this.logger.error(
              `matches.create failed for ${user1}/${user2}`,
              (e as Error).stack,
            );
            throw e;
          }
        }
      }

      if (matched && matchId) {
        // Push "Game On!" to both users (best-effort; sendPushToUser
        // swallows its own errors).
        const names = await this.prisma.public_users.findMany({
          where: { id: { in: [user.id, dto.targetUserId] } },
          select: { id: true, name: true },
        });
        const nameOf = (id: string) =>
          names.find((n) => n.id === id)?.name ?? 'Someone';
        const data = { type: 'new_match', matchId };
        await Promise.all([
          this.notificationsService.sendPushToUser(
            dto.targetUserId,
            'Game On! 🤝',
            `You matched with ${nameOf(user.id)}`,
            data,
            'matchAlerts',
          ),
          this.notificationsService.sendPushToUser(
            user.id,
            'Game On! 🤝',
            `You matched with ${nameOf(dto.targetUserId)}`,
            data,
            'matchAlerts',
          ),
        ]);
      }
    }

    const swipesRemaining = await this.getSwipesRemaining(user.id);
    return { matched, matchId, swipesRemaining };
  }

  async myDrafts(user: CurrentUserPayload) {
    if (user.role === UserRole.PARENT) {
      throw new ForbiddenException('Parents do not have a draft list');
    }

    const userId = user.id;

    const [outgoing, activeMatches] = await Promise.all([
      this.prisma.swipes.findMany({
        where: {
          swiper_id: userId,
          direction: SwipeDirection.DRAFT,
        },
        select: {
          swiped_id: true,
          created_at: true,
          users_swipes_swiped_idTousers: {
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
      }),
      this.prisma.matches.findMany({
        where: {
          is_active: true,
          OR: [{ user_1_id: userId }, { user_2_id: userId }],
        },
        select: { user_1_id: true, user_2_id: true },
      }),
    ]);

    const matchedSet = new Set<string>(
      activeMatches.map((m) =>
        m.user_1_id === userId ? m.user_2_id : m.user_1_id,
      ),
    );

    return outgoing.map((r) => ({
      swiped_id: r.swiped_id,
      created_at: r.created_at,
      swiped: r.users_swipes_swiped_idTousers,
      matched: matchedSet.has(r.swiped_id),
    }));
  }

  async withdrawDraft(userId: string, targetUserId: string) {
    const [u1, u2] =
      userId < targetUserId ? [userId, targetUserId] : [targetUserId, userId];

    const activeMatch = await this.prisma.matches.findFirst({
      where: { user_1_id: u1, user_2_id: u2, is_active: true },
      select: { id: true },
    });
    if (activeMatch) {
      throw new ConflictException('Already matched — cannot withdraw');
    }

    const { count } = await this.prisma.swipes.deleteMany({
      where: {
        swiper_id: userId,
        swiped_id: targetUserId,
        direction: SwipeDirection.DRAFT,
      },
    });
    if (count === 0) {
      throw new NotFoundException('No pending draft to withdraw');
    }

    return { withdrawn: true };
  }

  async whoDraftedMe(userId: string) {
    const [mySwiped, blocked, blockedBy] = await Promise.all([
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

    const excludeSwiperIds = [
      ...mySwiped.map((s) => s.swiped_id),
      ...blocked.map((b) => b.blocked_id),
      ...blockedBy.map((b) => b.blocker_id),
    ];

    const rows = await this.prisma.swipes.findMany({
      where: {
        swiped_id: userId,
        direction: SwipeDirection.DRAFT,
        swiper_id: { notIn: excludeSwiperIds },
      },
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
        bonus_swipes: true,
      },
    });

    if (!sub) return 10;

    const todayStr = new Date().toISOString().split('T')[0];
    const resetAtStr = sub.swipes_reset_at
      ? sub.swipes_reset_at.toISOString().split('T')[0]
      : null;

    const bonus = sub.bonus_swipes ?? 0;
    if (resetAtStr !== todayStr) {
      await this.prisma.subscriptions.update({
        where: { user_id: userId },
        data: { swipes_used_today: 0, swipes_reset_at: new Date(todayStr) },
      });
      const daily = sub.daily_swipe_limit === -1 ? 999 : sub.daily_swipe_limit;
      return daily + bonus;
    }

    if (sub.daily_swipe_limit === -1) return 999 + bonus;
    return (
      Math.max(0, sub.daily_swipe_limit - (sub.swipes_used_today ?? 0)) + bonus
    );
  }
}
