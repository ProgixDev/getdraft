import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DiscoverService,
  SUPER_DRAFT_RECRUIT_ONLY_MESSAGE,
  UNLIMITED_DRAFTS,
} from './discover.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserRole,
  SwipeDirection,
  DiscoverMode,
  CurrentUserPayload,
} from '../../common/types';
import { dobBoundsForAgeGroup } from '../../common/utils/age';
import {
  COMMUNITY_BLOCKED_MESSAGES,
  COMMUNITY_MISMATCH_MESSAGE,
} from './community';

// The Discover module runs on Prisma (not the Supabase client), so the spec
// mocks PrismaService + NotificationsService. Swipe limits are now MONTHLY
// Drafts: only Drafts (right-swipes) count; passes are free; the allowance
// comes from PLAN_SWIPE_LIMITS (basic = 20, paid = unlimited).
describe('DiscoverService', () => {
  let service: DiscoverService;
  let prisma: any;

  const athleteUser: CurrentUserPayload = {
    id: 'athlete-1',
    email: 'athlete@test.com',
    role: UserRole.ATHLETE,
  };
  const recruiterUser: CurrentUserPayload = {
    id: 'recruiter-1',
    email: 'recruiter@test.com',
    role: UserRole.RECRUITER,
  };
  const parentUser: CurrentUserPayload = {
    id: 'parent-1',
    email: 'parent@test.com',
    role: UserRole.PARENT,
  };

  // A subscription dated TODAY so getSwipesRemaining doesn't trigger the
  // daily reset (which would zero the counter and report a full allowance).
  const sub = (
    plan_id = 'basic',
    swipes_used_today = 0,
    bonus_swipes = 0,
  ) => ({ plan_id, swipes_used_today, swipes_reset_at: new Date(), bonus_swipes });

  // ---- Community fixtures ---------------------------------------------

  // A date of birth `years` years and `days` days ago, the way Prisma returns
  // a DATE column (UTC midnight). The day offset keeps it off the birthday.
  const dobYearsAgo = (years: number, days = 30) => {
    const t = new Date();
    return new Date(
      Date.UTC(
        t.getUTCFullYear() - years,
        t.getUTCMonth(),
        t.getUTCDate() - days,
      ),
    );
  };

  // A public_users row as the swipe / community queries select it.
  const athleteRow = (
    sport: string | null = 'Soccer',
    dob: Date | null = dobYearsAgo(15),
    activation = 'active',
  ) => ({
    is_banned: false,
    role: 'athlete',
    activation_status: activation,
    athlete_profiles: { sport, date_of_birth: dob },
  });

  // Route public_users.findUnique by id, so the swiper and the target each
  // get their own row. Unknown ids fall back to the default coach target.
  const usersById = (rows: Record<string, unknown>) =>
    prisma.public_users.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(rows[where.id] ?? { is_banned: false, role: 'coach' }),
    );

  // A feed/map row: an athlete with a card-worthy profile.
  const feedAthlete = (id: string, sport: string, dob: Date | null) => ({
    id,
    name: id,
    role: 'athlete',
    avatar_url: null,
    location: 'Montreal, QC',
    country: 'Canada',
    latitude: 45.508888,
    longitude: -73.561668,
    created_at: new Date(),
    kyc_status: 'none',
    activation_status: 'active',
    preferences: {},
    email: `${id}@example.com`,
    athlete_profiles: {
      sport,
      position: null,
      level: null,
      bio: null,
      class_year: null,
      gpa: null,
      height: null,
      weight: null,
      photos: [],
      videos: [],
      forty_yard_dash: null,
      awards: [],
      date_of_birth: dob,
    },
    recruiter_profiles: null,
  });

  const likesCall = (id: string) => [
    'select public.increment_likes_received($1::uuid)',
    id,
  ];

  const originalPeerFlag = process.env.PEER_ATHLETES_ENABLED;
  afterEach(() => {
    if (originalPeerFlag === undefined) {
      delete process.env.PEER_ATHLETES_ENABLED;
    } else {
      process.env.PEER_ATHLETES_ENABLED = originalPeerFlag;
    }
  });

  beforeEach(async () => {
    prisma = {
      public_users: {
        findMany: jest.fn().mockResolvedValue([]),
        // Default target is a coach so the athlete↔recruiter matrix guard
        // passes; individual tests override the role where needed.
        findUnique: jest
          .fn()
          .mockResolvedValue({ is_banned: false, role: 'coach' }),
      },
      swipes: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        // Super Draft monthly usage counter (getSuperDraftsRemaining).
        count: jest.fn().mockResolvedValue(0),
      },
      blocks: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      guardian_links: {
        // Default: the parent has an approved link to athlete 'athlete-9'.
        findFirst: jest
          .fn()
          .mockResolvedValue({ athlete_user_id: 'athlete-9' }),
      },
      // Only read for the org_type of team cards (teamOrgTypes).
      recruiter_profiles: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      subscriptions: {
        findUnique: jest.fn().mockResolvedValue(sub()),
        update: jest.fn().mockResolvedValue({}),
      },
      matches: {
        create: jest.fn().mockResolvedValue({ id: 'match-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscoverService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationsService,
          useValue: { sendPushToUser: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<DiscoverService>(DiscoverService);
  });

  describe('getFeed', () => {
    it('serves parents a coach/agent feed (guardian proxy)', async () => {
      prisma.public_users.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          name: 'Coach Mike',
          role: 'coach',
          avatar_url: null,
          location: 'LA, CA',
          country: 'US',
          created_at: new Date(),
          recruiter_profiles: {
            organization: 'UCLA',
            sport: 'football',
            role_type: 'coach',
            verified: true,
            tags: [],
            bio: '',
            photos: [],
            videos: [],
          },
        },
      ]);
      const result = await service.getFeed(parentUser, {});
      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].name).toBe('Coach Mike');
    });

    it('peer mode: a coach gets a coach-only pool, and a parent browses as themselves', async () => {
      await service.getFeed(
        { id: 'coach-1', email: 'c@test.com', role: UserRole.COACH },
        { mode: DiscoverMode.PEER } as any,
      );
      const where = prisma.public_users.findMany.mock.calls.at(-1)[0].where;
      expect(where.OR).toEqual([{ role: 'coach' }]);

      prisma.public_users.findMany.mockClear();
      prisma.guardian_links.findFirst.mockClear();
      await service.getFeed(parentUser, { mode: DiscoverMode.PEER } as any);
      const where2 = prisma.public_users.findMany.mock.calls.at(-1)[0].where;
      expect(where2.OR).toEqual([{ role: 'parent' }]);
      expect(prisma.guardian_links.findFirst).not.toHaveBeenCalled();
    });

    it('returns the feed with the daily Draft allowance remaining', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 3)); // 10 - 3
      prisma.public_users.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          name: 'Coach Mike',
          role: 'coach',
          avatar_url: null,
          location: 'LA, CA',
          country: 'US',
          created_at: new Date(),
          recruiter_profiles: {
            organization: 'UCLA',
            sport: 'football',
            role_type: 'coach',
            verified: true,
            tags: ['NCAA'],
            bio: '',
            photos: [],
            videos: [],
          },
        },
      ]);

      const result = await service.getFeed(athleteUser, { sport: 'football' });

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].name).toBe('Coach Mike');
      expect(result.swipesRemaining).toBe(7);
    });

    it('gives unlimited Drafts on a paid plan', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('pro', 500));
      const result = await service.getFeed(recruiterUser, {});
      // -1 (unlimited) resolves to the 9999 sentinel.
      expect(result.swipesRemaining).toBeGreaterThan(9000);
    });
  });

  describe('swipe', () => {
    it('throws BadRequestException on self-swipe', async () => {
      await expect(
        service.swipe(athleteUser, {
          targetUserId: athleteUser.id,
          direction: SwipeDirection.DRAFT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 429 when the monthly Draft limit is reached', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 20)); // 0 left
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
        }),
      ).rejects.toThrow(HttpException);
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });

    it('records a Super Draft with is_super and returns a super count', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('pro', 0)); // unlimited normal
      prisma.swipes.count.mockResolvedValue(0); // no Super Drafts used yet
      const result = await service.swipe(athleteUser, {
        targetUserId: 'rec-1',
        direction: SwipeDirection.DRAFT,
        isSuper: true,
      });
      expect(prisma.swipes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_super: true }),
        }),
      );
      expect(typeof result.superDraftsRemaining).toBe('number');
    });

    it('throws 429 when the monthly Super Draft limit is reached', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 0)); // normal Drafts fine
      prisma.swipes.count.mockResolvedValue(1); // basic Super limit is 1 → none left
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
          isSuper: true,
        }),
      ).rejects.toThrow(HttpException);
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });

    it('allows a PASS even when out of Drafts (passes are free)', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 20)); // 0 left
      const result = await service.swipe(athleteUser, {
        targetUserId: 'rec-1',
        direction: SwipeDirection.PASS,
      });
      expect(result.matched).toBe(false);
      expect(prisma.swipes.create).toHaveBeenCalled();
    });

    it('blocks an illegal role pair (athlete cannot recruit-draft another athlete)', async () => {
      usersById({ 'athlete-1': athleteRow(), 'ath-2': athleteRow() });
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'ath-2',
          direction: SwipeDirection.DRAFT,
          mode: DiscoverMode.RECRUIT,
        }),
      ).rejects.toThrow('You cannot match with this user');
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });

    it('proxies a parent Draft to their linked athlete and matches', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('pro', 0)); // unlimited
      // The coach already drafted the athlete, so this completes the match.
      prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
      const result = await service.swipe(parentUser, {
        targetUserId: 'rec-1',
        direction: SwipeDirection.DRAFT,
      });
      // Recorded as the LINKED ATHLETE, not the parent.
      expect(prisma.swipes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ swiper_id: 'athlete-9' }),
        }),
      );
      expect(result.matched).toBe(true);
    });

    it('rejects a parent Draft when they have no approved athlete link', async () => {
      prisma.guardian_links.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.swipe(parentUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });

    // ---- Community (peer mode), migration 044 ---------------------------

    it('peer mode: an athlete can draft another athlete, and the match is kind=peer', async () => {
      // Both eligible: same sport (any case / spaces), both 13-17, active.
      usersById({
        'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
        'ath-2': athleteRow('  soccer ', dobYearsAgo(16)),
      });
      prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
      const result = await service.swipe(athleteUser, {
        targetUserId: 'ath-2',
        direction: SwipeDirection.DRAFT,
        mode: DiscoverMode.PEER,
      });
      expect(result.matched).toBe(true);
      expect(prisma.matches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'peer' }),
        }),
      );
      // A peer Draft is a friend request, not a scout's interest: it must not
      // bump the athlete's likes_received talent counter.
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
        'select public.increment_likes_received($1::uuid)',
        'ath-2',
      );
    });

    it('peer mode: rejects a cross-role pair (athlete cannot peer-draft a coach)', async () => {
      // default findUnique target is a coach
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
          mode: DiscoverMode.PEER,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });

    it('explicit recruit mode still rejects a same-role pair', async () => {
      prisma.public_users.findUnique.mockResolvedValue({
        is_banned: false,
        role: 'recruiter',
      });
      await expect(
        service.swipe(recruiterUser, {
          targetUserId: 'rec-2',
          direction: SwipeDirection.DRAFT,
          mode: DiscoverMode.RECRUIT,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });

    it('no mode + same role is inferred as peer (old builds: Globe, Draft Board, Draft back)', async () => {
      prisma.public_users.findUnique.mockResolvedValue({
        is_banned: false,
        role: 'recruiter',
      });
      prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
      const result = await service.swipe(recruiterUser, {
        targetUserId: 'rec-2',
        direction: SwipeDirection.DRAFT,
      });
      expect(result.matched).toBe(true);
      expect(prisma.matches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'peer' }),
        }),
      );
      // Peer Drafts never feed the talent counter, inferred or not.
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
        ...likesCall('rec-2'),
      );
    });

    it('no mode + parent → parent is peer: the parent acts as themselves', async () => {
      prisma.public_users.findUnique.mockResolvedValue({
        is_banned: false,
        role: 'parent',
      });
      await service.swipe(parentUser, {
        targetUserId: 'parent-2',
        direction: SwipeDirection.DRAFT,
      });
      expect(prisma.swipes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ swiper_id: 'parent-1' }),
        }),
      );
      expect(prisma.guardian_links.findFirst).not.toHaveBeenCalled();
    });

    it('no mode + different roles stays recruit: likes count, match is kind=recruit', async () => {
      prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
      const result = await service.swipe(athleteUser, {
        targetUserId: 'rec-1', // default target: a coach
        direction: SwipeDirection.DRAFT,
      });
      expect(result.matched).toBe(true);
      expect(prisma.matches.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: 'recruit' }),
        }),
      );
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        ...likesCall('rec-1'),
      );
    });

    it('peer mode: a parent acts as themselves, not as their athlete', async () => {
      prisma.public_users.findUnique.mockResolvedValueOnce({
        is_banned: false,
        role: 'parent',
      });
      await service.swipe(parentUser, {
        targetUserId: 'parent-2',
        direction: SwipeDirection.DRAFT,
        mode: DiscoverMode.PEER,
      });
      expect(prisma.swipes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ swiper_id: 'parent-1' }),
        }),
      );
      // No guardian-link lookup: the proxy is a recruit-mode concept.
      expect(prisma.guardian_links.findFirst).not.toHaveBeenCalled();
    });

    it('recruit mode: a normal Draft still counts toward likes_received', async () => {
      await service.swipe(athleteUser, {
        targetUserId: 'rec-1',
        direction: SwipeDirection.DRAFT,
      });
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'select public.increment_likes_received($1::uuid)',
        'rec-1',
      );
    });

    it('throws ConflictException on duplicate swipe', async () => {
      prisma.swipes.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.PASS,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ---- Athlete Community: same sport, same age group, both active --------

  describe('Community (athlete ↔ athlete)', () => {
    const peerDraft = (targetUserId = 'ath-2') =>
      service.swipe(athleteUser, {
        targetUserId,
        direction: SwipeDirection.DRAFT,
        mode: DiscoverMode.PEER,
      });

    describe('swipe', () => {
      it('same sport + same age group (adults too) is allowed and matches', async () => {
        usersById({
          'athlete-1': athleteRow('Hockey', dobYearsAgo(24)),
          'ath-2': athleteRow('HOCKEY', dobYearsAgo(31)),
        });
        prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
        const result = await peerDraft();
        expect(result.matched).toBe(true);
        expect(prisma.matches.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ kind: 'peer' }),
          }),
        );
      });

      it('a different sport is refused with 403, nothing recorded', async () => {
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Basketball', dobYearsAgo(15)),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_MISMATCH_MESSAGE),
        );
        expect(prisma.swipes.create).not.toHaveBeenCalled();
        expect(prisma.matches.create).not.toHaveBeenCalled();
      });

      it('youth vs adult is refused with 403, both ways', async () => {
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(25)),
        });
        await expect(peerDraft()).rejects.toThrow(ForbiddenException);

        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(25)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(15)),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_MISMATCH_MESSAGE),
        );
        expect(prisma.swipes.create).not.toHaveBeenCalled();
      });

      it('the 18th birthday is the line: 17 and 364 days is still youth', async () => {
        // Fixed clock (only Date is faked), so this never lands on a 29 Feb.
        jest.useFakeTimers({
          now: new Date(Date.UTC(2026, 8, 30, 12)),
          doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout',
            'queueMicrotask',
            'hrtime',
            'performance',
          ],
        });
        try {
          usersById({
            'athlete-1': athleteRow('Soccer', dobYearsAgo(16)),
            // 18 tomorrow: youth today.
            'ath-2': athleteRow('Soccer', dobYearsAgo(18, -1)),
          });
          await expect(peerDraft()).resolves.toMatchObject({ matched: false });

          prisma.swipes.create.mockClear();
          usersById({
            'athlete-1': athleteRow('Soccer', dobYearsAgo(16)),
            // 18 today: adult.
            'ath-2': athleteRow('Soccer', dobYearsAgo(18, 0)),
          });
          await expect(peerDraft()).rejects.toThrow(ForbiddenException);
          expect(prisma.swipes.create).not.toHaveBeenCalled();
        } finally {
          jest.useRealTimers();
        }
      });

      it('an under-13 swiper is refused with the under-13 message', async () => {
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(12)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(12)),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_BLOCKED_MESSAGES.under_13),
        );
        expect(prisma.swipes.create).not.toHaveBeenCalled();
      });

      it("an under-13 target is refused without saying why (no age leak)", async () => {
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(12)),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_MISMATCH_MESSAGE),
        );
      });

      it('a missing date of birth, on either side, is refused', async () => {
        usersById({
          'athlete-1': athleteRow('Soccer', null),
          'ath-2': athleteRow('Soccer', dobYearsAgo(15)),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_BLOCKED_MESSAGES.missing_dob),
        );

        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Soccer', null),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_MISMATCH_MESSAGE),
        );
        expect(prisma.swipes.create).not.toHaveBeenCalled();
      });

      it('a swiper with no sport is refused', async () => {
        usersById({
          'athlete-1': athleteRow('  ', dobYearsAgo(15)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(15)),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_BLOCKED_MESSAGES.missing_sport),
        );
      });

      it('a target still waiting on a guardian is refused with 403', async () => {
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(15), 'pending_guardian'),
        });
        await expect(peerDraft()).rejects.toThrow(
          new ForbiddenException(COMMUNITY_MISMATCH_MESSAGE),
        );
        expect(prisma.swipes.create).not.toHaveBeenCalled();
      });

      it('a banned target is still a 404', async () => {
        usersById({
          'athlete-1': athleteRow(),
          'ath-2': { ...athleteRow(), is_banned: true },
        });
        await expect(peerDraft()).rejects.toThrow('User not found');
      });

      it('no mode between two athletes is Community: full rules, kind=peer, no likes', async () => {
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(14)),
        });
        prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
        const result = await service.swipe(athleteUser, {
          targetUserId: 'ath-2',
          direction: SwipeDirection.DRAFT,
        });
        expect(result.matched).toBe(true);
        expect(prisma.matches.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ kind: 'peer' }),
          }),
        );
        expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
          ...likesCall('ath-2'),
        );

        // ...and an old build cannot use the missing mode to skip the rules.
        prisma.swipes.create.mockClear();
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Soccer', dobYearsAgo(30)),
        });
        await expect(
          service.swipe(athleteUser, {
            targetUserId: 'ath-2',
            direction: SwipeDirection.DRAFT,
          }),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.swipes.create).not.toHaveBeenCalled();
      });

      it('a Pass always works between athletes, so any peer Draft can be refused', async () => {
        // Youth refusing an adult's Draft sent before the rules existed.
        usersById({
          'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
          'ath-2': athleteRow('Basketball', dobYearsAgo(30)),
        });
        const result = await service.swipe(athleteUser, {
          targetUserId: 'ath-2',
          direction: SwipeDirection.PASS,
        });
        expect(result.matched).toBe(false);
        expect(prisma.swipes.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ direction: 'pass' }),
          }),
        );
      });

      it.each(['false', 'off', '0', 'No'])(
        'PEER_ATHLETES_ENABLED=%p turns athlete Drafts off',
        async (flag) => {
          process.env.PEER_ATHLETES_ENABLED = flag;
          usersById({
            'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
            'ath-2': athleteRow('Soccer', dobYearsAgo(15)),
          });
          await expect(peerDraft()).rejects.toThrow(
            new ForbiddenException(COMMUNITY_BLOCKED_MESSAGES.disabled),
          );
        },
      );
    });

    describe('feed (mode=peer)', () => {
      it('an eligible athlete gets their own sport and age group; the sport param is ignored', async () => {
        usersById({ 'athlete-1': athleteRow(' Soccer ', dobYearsAgo(15)) });
        const result = await service.getFeed(athleteUser, {
          mode: DiscoverMode.PEER,
          sport: 'Basketball',
        });

        expect(result.community).toEqual({
          eligible: true,
          reason: null,
          sport: 'Soccer',
          ageGroup: 'youth',
        });
        const where = prisma.public_users.findMany.mock.calls.at(-1)[0].where;
        expect(where.OR).toHaveLength(1);
        const branch = where.OR[0];
        expect(branch.role).toBe('athlete');
        expect(branch.activation_status).toBe('active');
        expect(branch.athlete_profiles.is.sport).toEqual({
          equals: 'Soccer',
          mode: 'insensitive',
        });
        const bounds = dobBoundsForAgeGroup('youth', new Date());
        const dobFilter = branch.athlete_profiles.is.date_of_birth;
        expect(dobFilter.not).toBeNull();
        expect(dobFilter.lte.toISOString()).toBe(bounds.lte.toISOString());
        expect(dobFilter.gt.toISOString()).toBe(bounds.gt!.toISOString());
      });

      it('adults get the adult bound only (no upper age)', async () => {
        usersById({ 'athlete-1': athleteRow('Soccer', dobYearsAgo(30)) });
        const result = await service.getFeed(athleteUser, {
          mode: DiscoverMode.PEER,
        });
        expect(result.community?.ageGroup).toBe('adult');
        const dobFilter =
          prisma.public_users.findMany.mock.calls.at(-1)[0].where.OR[0]
            .athlete_profiles.is.date_of_birth;
        expect(dobFilter.gt).toBeUndefined();
        expect(dobFilter.lte.toISOString()).toBe(
          dobBoundsForAgeGroup('adult', new Date()).lte.toISOString(),
        );
      });

      it('rows that break the rules are dropped even if the query returned them', async () => {
        usersById({ 'athlete-1': athleteRow('Soccer', dobYearsAgo(15)) });
        prisma.public_users.findMany.mockResolvedValue([
          feedAthlete('ok-youth', 'soccer', dobYearsAgo(16)),
          feedAthlete('other-sport', 'Basketball', dobYearsAgo(16)),
          feedAthlete('adult', 'Soccer', dobYearsAgo(22)),
          feedAthlete('no-dob', 'Soccer', null),
        ]);
        const result = await service.getFeed(athleteUser, {
          mode: DiscoverMode.PEER,
        });
        expect(result.cards.map((c) => c.id)).toEqual(['ok-youth']);
        // The card never carries the date of birth.
        expect(JSON.stringify(result.cards)).not.toContain('date_of_birth');
      });

      it('escapes LIKE wildcards in the sport, so "%" does not match every sport', async () => {
        usersById({ 'athlete-1': athleteRow('100%_Fit', dobYearsAgo(15)) });
        await service.getFeed(athleteUser, { mode: DiscoverMode.PEER });
        const sport =
          prisma.public_users.findMany.mock.calls.at(-1)[0].where.OR[0]
            .athlete_profiles.is.sport;
        expect(sport.equals).toBe('100\\%\\_Fit');
      });

      it.each([
        ['under_13', athleteRow('Soccer', dobYearsAgo(12))],
        ['missing_dob', athleteRow('Soccer', null)],
        ['missing_sport', athleteRow('', dobYearsAgo(15))],
        ['pending_guardian', athleteRow('Soccer', dobYearsAgo(15), 'pending_guardian')],
      ])('not eligible (%s): empty page, reason reported, no query', async (reason, row) => {
        usersById({ 'athlete-1': row });
        const result = await service.getFeed(athleteUser, {
          mode: DiscoverMode.PEER,
        });
        expect(result.cards).toEqual([]);
        expect(result.hasMore).toBe(false);
        expect(result.nextCursor).toBeNull();
        expect(result.community).toMatchObject({ eligible: false, reason });
        expect(prisma.public_users.findMany).not.toHaveBeenCalled();
      });

      it("PEER_ATHLETES_ENABLED=off: reason 'disabled'", async () => {
        process.env.PEER_ATHLETES_ENABLED = 'OFF';
        usersById({ 'athlete-1': athleteRow('Soccer', dobYearsAgo(15)) });
        const result = await service.getFeed(athleteUser, {
          mode: DiscoverMode.PEER,
        });
        expect(result.community).toMatchObject({
          eligible: false,
          reason: 'disabled',
        });
        expect(result.cards).toEqual([]);
      });

      it('coaches, agents and parents get an open community', async () => {
        const result = await service.getFeed(recruiterUser, {
          mode: DiscoverMode.PEER,
        });
        expect(result.community).toEqual({
          eligible: true,
          reason: null,
          sport: null,
          ageGroup: null,
        });
        const where = prisma.public_users.findMany.mock.calls.at(-1)[0].where;
        expect(where.OR).toEqual([{ role: 'recruiter' }]);
      });

      it('recruit mode is unchanged and carries no community field', async () => {
        const result = await service.getFeed(athleteUser, {});
        expect(result.community).toBeUndefined();
        expect(JSON.parse(JSON.stringify(result))).not.toHaveProperty(
          'community',
        );
        const where = prisma.public_users.findMany.mock.calls.at(-1)[0].where;
        // Coaches, agents and -- since migration 047 -- teams.
        expect(where.OR).toEqual([
          { role: { in: ['coach', 'recruiter', 'team'] } },
        ]);
      });
    });

    describe('globe (map)', () => {
      it('rounds every pin to 2 decimals (~1 km), in every mode', async () => {
        prisma.public_users.findMany.mockResolvedValue([
          {
            ...feedAthlete('rec-1', 'Soccer', null),
            role: 'coach',
            athlete_profiles: null,
            recruiter_profiles: {
              organization: 'McGill',
              sport: 'Soccer',
              role_type: 'coach',
              verified: true,
              photos: [],
            },
          },
        ]);
        const pins = await service.getMapPoints(athleteUser, {});
        expect(pins).toHaveLength(1);
        expect(pins[0].lat).toBe(45.51);
        expect(pins[0].lng).toBe(-73.56);
      });

      it('an ineligible athlete gets no pins and no query', async () => {
        usersById({ 'athlete-1': athleteRow('Soccer', dobYearsAgo(12)) });
        const pins = await service.getMapPoints(athleteUser, {
          mode: DiscoverMode.PEER,
        });
        expect(pins).toEqual([]);
        expect(prisma.public_users.findMany).not.toHaveBeenCalled();
      });

      it('an eligible athlete sees only same-sport, same-age-group pins', async () => {
        usersById({ 'athlete-1': athleteRow('Soccer', dobYearsAgo(15)) });
        prisma.public_users.findMany.mockResolvedValue([
          feedAthlete('ok-youth', 'Soccer', dobYearsAgo(14)),
          feedAthlete('adult', 'Soccer', dobYearsAgo(40)),
          feedAthlete('other-sport', 'Tennis', dobYearsAgo(14)),
        ]);
        const pins = await service.getMapPoints(athleteUser, {
          mode: DiscoverMode.PEER,
        });
        expect(pins.map((p) => p.id)).toEqual(['ok-youth']);
        expect(JSON.stringify(pins)).not.toContain('date_of_birth');
        const where = prisma.public_users.findMany.mock.calls.at(-1)[0].where;
        expect(where.role).toBe('athlete');
        expect(where.activation_status).toBe('active');
        expect(where.athlete_profiles.is.sport).toEqual({
          equals: 'Soccer',
          mode: 'insensitive',
        });
        expect(where.athlete_profiles.is.date_of_birth.gt).toBeInstanceOf(Date);
      });
    });

    describe('who drafted me', () => {
      const swiperFilter = () =>
        prisma.swipes.findMany.mock.calls
          .map((c: any[]) => c[0]?.where)
          .find((w: any) => w?.swiped_id)?.users_swipes_swiper_idTousers;

      it("an athlete only sees athlete Drafts from their own Community", async () => {
        usersById({ 'athlete-1': athleteRow('Soccer', dobYearsAgo(15)) });
        await service.whoDraftedMe(athleteUser);
        const filter = swiperFilter();
        expect(filter.is_banned).toBe(false);
        expect(filter.OR[0]).toEqual({ role: { not: 'athlete' } });
        expect(filter.OR[1].athlete_profiles.is.sport).toEqual({
          equals: 'Soccer',
          mode: 'insensitive',
        });
        expect(filter.OR[1].activation_status).toBe('active');
      });

      it('an athlete outside Community sees no athlete Drafts at all', async () => {
        usersById({ 'athlete-1': athleteRow('Soccer', null) });
        await service.whoDraftedMe(athleteUser);
        expect(swiperFilter().OR).toEqual([{ role: { not: 'athlete' } }]);
      });

      it("a coach's list is unchanged", async () => {
        await service.whoDraftedMe(recruiterUser);
        expect(swiperFilter()).toEqual({ is_banned: false });
      });
    });
  });

  // ---- Team accounts (migration 047) -------------------------------------

  describe('Team accounts', () => {
    const teamUser: CurrentUserPayload = {
      id: 'team-1',
      email: 'team@test.com',
      role: UserRole.TEAM,
    };
    const coachUser: CurrentUserPayload = {
      id: 'coach-1',
      email: 'coach@test.com',
      role: UserRole.COACH,
    };

    // A feed / map row for a coach, an agent or a team.
    const feedRecruiter = (id: string, role: string, roleType: string) => ({
      ...feedAthlete(id, 'Soccer', null),
      role,
      athlete_profiles: null,
      recruiter_profiles: {
        organization: `${id} org`,
        sport: 'Soccer',
        role_type: roleType,
        verified: true,
        tags: [],
        bio: null,
        photos: [],
        videos: [],
      },
    });

    const targetIs = (role: string) =>
      prisma.public_users.findUnique.mockResolvedValue({
        is_banned: false,
        role,
      });

    const lastWhere = () =>
      prisma.public_users.findMany.mock.calls.at(-1)[0].where;

    describe('feed', () => {
      it('recruiting: a parent acting for their athlete sees coaches, agents and teams', async () => {
        await service.getFeed(parentUser, {});
        expect(lastWhere().OR).toEqual([
          { role: { in: ['coach', 'recruiter', 'team'] } },
        ]);
      });

      it('recruiting: a team sees active athletes, and nobody else', async () => {
        await service.getFeed(teamUser, {});
        expect(lastWhere().OR).toEqual([
          { role: 'athlete', activation_status: 'active' },
        ]);
      });

      it("recruiterType 'team' narrows an athlete's deck to teams", async () => {
        await service.getFeed(athleteUser, { recruiterType: 'team' });
        expect(lastWhere().OR).toEqual([
          {
            role: { in: ['coach', 'recruiter', 'team'] },
            recruiter_profiles: { is: { role_type: 'team' } },
          },
        ]);
      });

      it('Community: a team gets a team-only pool; recruiterType is ignored, sport still narrows', async () => {
        const result = await service.getFeed(teamUser, {
          mode: DiscoverMode.PEER,
          recruiterType: 'coach',
        });
        expect(lastWhere().OR).toEqual([{ role: 'team' }]);
        expect(result.community).toEqual({
          eligible: true,
          reason: null,
          sport: null,
          ageGroup: null,
        });

        await service.getFeed(teamUser, {
          mode: DiscoverMode.PEER,
          sport: 'Soccer',
        });
        expect(lastWhere().OR).toEqual([
          { role: 'team', recruiter_profiles: { is: { sport: 'Soccer' } } },
        ]);
      });

      it("a team is dealt as a recruiter card with role 'team', roleType 'team' and its orgType", async () => {
        prisma.public_users.findMany.mockResolvedValue([
          feedRecruiter('team-9', 'team', 'team'),
          feedRecruiter('coach-9', 'coach', 'coach'),
          feedRecruiter('agent-9', 'recruiter', 'agent'),
        ]);
        prisma.recruiter_profiles.findMany.mockResolvedValue([
          { user_id: 'team-9', org_type: 'club' },
        ]);

        const result = await service.getFeed(athleteUser, {});
        const card = (id: string): any =>
          result.cards.find((c) => c.id === id);

        expect(card('team-9')).toMatchObject({
          cardType: 'recruiter',
          role: 'team',
          roleType: 'team',
          orgType: 'club',
          organization: 'team-9 org',
          verified: true,
        });
        // Coach and agent cards keep their shape; the two new fields are there
        // for them too, so the app reads one card type.
        expect(card('coach-9')).toMatchObject({
          cardType: 'recruiter',
          role: 'coach',
          roleType: 'coach',
          orgType: null,
        });
        expect(card('agent-9')).toMatchObject({
          role: 'agent',
          roleType: 'agent',
          orgType: null,
        });
        // org_type is asked for the team rows only, in one query.
        expect(prisma.recruiter_profiles.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.recruiter_profiles.findMany).toHaveBeenCalledWith({
          where: { user_id: { in: ['team-9'] } },
          select: { user_id: true, org_type: true },
        });
      });

      it('a team account is a team card even when its profile row still says coach', async () => {
        prisma.public_users.findMany.mockResolvedValue([
          feedRecruiter('team-9', 'team', 'coach'),
        ]);
        const result = await service.getFeed(athleteUser, {});
        expect(result.cards[0]).toMatchObject({
          role: 'team',
          roleType: 'team',
          orgType: null,
        });
      });

      it('with no team on the page the org_type column is never read (safe before migration 047)', async () => {
        prisma.public_users.findMany.mockResolvedValue([
          feedRecruiter('coach-9', 'coach', 'coach'),
        ]);
        const result = await service.getFeed(athleteUser, {});
        expect(result.cards).toHaveLength(1);
        expect(prisma.recruiter_profiles.findMany).not.toHaveBeenCalled();
        // ...and the page query itself never names the new columns.
        const select = prisma.public_users.findMany.mock.calls.at(-1)[0].select;
        expect(select.recruiter_profiles.select).not.toHaveProperty('org_type');
        expect(select.recruiter_profiles.select).not.toHaveProperty('website');
      });

      it('a failing org_type lookup does not take the feed down', async () => {
        prisma.public_users.findMany.mockResolvedValue([
          feedRecruiter('team-9', 'team', 'team'),
        ]);
        prisma.recruiter_profiles.findMany.mockRejectedValue(
          new Error('column recruiter_profiles.org_type does not exist'),
        );
        const result = await service.getFeed(athleteUser, {});
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0]).toMatchObject({ role: 'team', orgType: null });
      });
    });

    describe('swipe', () => {
      it('recruiting: a team drafts an athlete and they match (kind=recruit, counts as a Draft received)', async () => {
        usersById({ 'ath-2': athleteRow() });
        prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
        const result = await service.swipe(teamUser, {
          targetUserId: 'ath-2',
          direction: SwipeDirection.DRAFT,
        });
        expect(result.matched).toBe(true);
        expect(prisma.swipes.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              swiper_id: 'team-1',
              swiped_id: 'ath-2',
            }),
          }),
        );
        expect(prisma.matches.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ kind: 'recruit' }),
          }),
        );
        expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
          ...likesCall('ath-2'),
        );
      });

      it('recruiting: an athlete drafts a team and they match (kind=recruit)', async () => {
        targetIs('team');
        prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
        for (const mode of [undefined, DiscoverMode.RECRUIT]) {
          prisma.matches.create.mockClear();
          const result = await service.swipe(athleteUser, {
            targetUserId: 'team-9',
            direction: SwipeDirection.DRAFT,
            mode,
          });
          expect(result.matched).toBe(true);
          expect(prisma.matches.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({ kind: 'recruit' }),
            }),
          );
        }
      });

      it('recruiting: a parent drafts a team on behalf of their athlete', async () => {
        targetIs('team');
        await service.swipe(parentUser, {
          targetUserId: 'team-9',
          direction: SwipeDirection.DRAFT,
        });
        expect(prisma.swipes.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ swiper_id: 'athlete-9' }),
          }),
        );
      });

      it('Community: two teams connect (kind=peer), with or without a mode', async () => {
        targetIs('team');
        prisma.swipes.findFirst.mockResolvedValue({ id: 'mutual-1' });
        for (const mode of [undefined, DiscoverMode.PEER]) {
          prisma.matches.create.mockClear();
          const result = await service.swipe(teamUser, {
            targetUserId: 'team-2',
            direction: SwipeDirection.DRAFT,
            mode,
          });
          expect(result.matched).toBe(true);
          expect(prisma.matches.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({ kind: 'peer' }),
            }),
          );
        }
        // A Community Draft never feeds the talent counter.
        expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
          ...likesCall('team-2'),
        );
      });

      it.each([
        ['coach', undefined],
        ['coach', DiscoverMode.PEER],
        ['coach', DiscoverMode.RECRUIT],
        ['recruiter', undefined],
        ['recruiter', DiscoverMode.PEER],
        ['recruiter', DiscoverMode.RECRUIT],
      ])(
        'a team can never match a %s (mode %p)',
        async (role, mode) => {
          targetIs(role);
          await expect(
            service.swipe(teamUser, {
              targetUserId: 'other-1',
              direction: SwipeDirection.DRAFT,
              mode,
            }),
          ).rejects.toThrow(
            new ForbiddenException('You cannot match with this user'),
          );
          expect(prisma.swipes.create).not.toHaveBeenCalled();
          expect(prisma.matches.create).not.toHaveBeenCalled();
        },
      );

      it('...and a coach can never match a team, in any mode', async () => {
        targetIs('team');
        for (const mode of [
          undefined,
          DiscoverMode.PEER,
          DiscoverMode.RECRUIT,
        ]) {
          await expect(
            service.swipe(coachUser, {
              targetUserId: 'team-9',
              direction: SwipeDirection.DRAFT,
              mode,
            }),
          ).rejects.toThrow(ForbiddenException);
        }
        expect(prisma.swipes.create).not.toHaveBeenCalled();
      });

      it('two teams cannot match from the recruit deck, and a team cannot peer-draft an athlete', async () => {
        targetIs('team');
        await expect(
          service.swipe(teamUser, {
            targetUserId: 'team-2',
            direction: SwipeDirection.DRAFT,
            mode: DiscoverMode.RECRUIT,
          }),
        ).rejects.toThrow(ForbiddenException);

        usersById({ 'ath-2': athleteRow() });
        await expect(
          service.swipe(teamUser, {
            targetUserId: 'ath-2',
            direction: SwipeDirection.DRAFT,
            mode: DiscoverMode.PEER,
          }),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.swipes.create).not.toHaveBeenCalled();
      });
    });

    describe('globe (map)', () => {
      it("an athlete's map shows coaches, agents and teams; role stays 'recruiter', accountType tells them apart", async () => {
        prisma.public_users.findMany.mockResolvedValue([
          feedRecruiter('coach-9', 'coach', 'coach'),
          feedRecruiter('agent-9', 'recruiter', 'agent'),
          feedRecruiter('team-9', 'team', 'team'),
        ]);
        const pins = await service.getMapPoints(athleteUser, {});
        expect(lastWhere().role).toEqual({
          in: ['coach', 'recruiter', 'team'],
        });
        // The query has to ask for the role, or every pin would be an 'agent'.
        expect(
          prisma.public_users.findMany.mock.calls.at(-1)[0].select.role,
        ).toBe(true);
        expect(
          pins.map((p) => [p.id, p.role, p.accountType, p.organization]),
        ).toEqual([
          ['coach-9', 'recruiter', 'coach', 'coach-9 org'],
          ['agent-9', 'recruiter', 'agent', 'agent-9 org'],
          ['team-9', 'recruiter', 'team', 'team-9 org'],
        ]);
      });

      it("a team's map shows active athletes, as accountType 'athlete'", async () => {
        prisma.public_users.findMany.mockResolvedValue([
          feedAthlete('ath-9', 'Soccer', dobYearsAgo(16)),
        ]);
        const pins = await service.getMapPoints(teamUser, {});
        expect(lastWhere()).toMatchObject({
          role: 'athlete',
          activation_status: 'active',
        });
        expect(pins[0]).toMatchObject({
          id: 'ath-9',
          role: 'athlete',
          accountType: 'athlete',
        });
      });

      it("a team's Community map shows other teams only", async () => {
        prisma.public_users.findMany.mockResolvedValue([
          feedRecruiter('team-9', 'team', 'team'),
        ]);
        const pins = await service.getMapPoints(teamUser, {
          mode: DiscoverMode.PEER,
        });
        expect(lastWhere().role).toBe('team');
        expect(pins[0]).toMatchObject({
          role: 'recruiter',
          accountType: 'team',
        });
      });
    });
  });

  // ---- Community Drafts are unlimited; only recruiting is metered ---------

  describe('Community Drafts are unlimited', () => {
    const increment = 'select public.increment_swipes_used($1::uuid)';
    const peerTarget = (role: string) =>
      prisma.public_users.findUnique.mockResolvedValue({
        is_banned: false,
        role,
      });

    it('the Community feed reports no limit, even with the daily allowance used up', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 10)); // 0 left
      const result = await service.getFeed(recruiterUser, {
        mode: DiscoverMode.PEER,
      });
      expect(result.swipesRemaining).toBe(UNLIMITED_DRAFTS);

      // Same for an athlete, eligible or not (the early "not eligible" page).
      usersById({ 'athlete-1': athleteRow('Soccer', dobYearsAgo(15)) });
      const eligible = await service.getFeed(athleteUser, {
        mode: DiscoverMode.PEER,
      });
      expect(eligible.swipesRemaining).toBe(UNLIMITED_DRAFTS);
      usersById({ 'athlete-1': athleteRow('Soccer', null) });
      const notEligible = await service.getFeed(athleteUser, {
        mode: DiscoverMode.PEER,
      });
      expect(notEligible.swipesRemaining).toBe(UNLIMITED_DRAFTS);
    });

    it('"no limit" is a positive number: every released build locks Drafts at swipesRemaining <= 0', () => {
      // Do not change this to 0 or -1. The apps in users' hands show "Out of
      // Drafts for today -- upgrade" and block the Draft whenever the number
      // is <= 0, so either value would shut every one of them out of
      // Community. It is also the number unlimited plans have always got.
      expect(UNLIMITED_DRAFTS).toBeGreaterThan(0);
      expect(UNLIMITED_DRAFTS).toBe(9999);
    });

    it('recruiting still reports the real allowance', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 10));
      const result = await service.getFeed(recruiterUser, {});
      expect(result.swipesRemaining).toBe(0);
    });

    it('a Community Draft is never a 429 and spends neither the allowance nor a bonus pack', async () => {
      // 0 of the daily 10 left, 5 bought Drafts in reserve.
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 10, 5));
      peerTarget('recruiter');
      const result = await service.swipe(recruiterUser, {
        targetUserId: 'rec-2',
        direction: SwipeDirection.DRAFT,
        mode: DiscoverMode.PEER,
      });
      expect(prisma.swipes.create).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
        increment,
        expect.anything(),
      );
      expect(prisma.subscriptions.update).not.toHaveBeenCalled();
      expect(result.swipesRemaining).toBe(UNLIMITED_DRAFTS);
    });

    it('...including when the mode is inferred (old builds), and between athletes', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 10));
      peerTarget('recruiter');
      await expect(
        service.swipe(recruiterUser, {
          targetUserId: 'rec-2',
          direction: SwipeDirection.DRAFT,
        }),
      ).resolves.toMatchObject({ swipesRemaining: UNLIMITED_DRAFTS });

      usersById({
        'athlete-1': athleteRow('Soccer', dobYearsAgo(15)),
        'ath-2': athleteRow('Soccer', dobYearsAgo(16)),
      });
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'ath-2',
          direction: SwipeDirection.DRAFT,
          mode: DiscoverMode.PEER,
        }),
      ).resolves.toMatchObject({ swipesRemaining: UNLIMITED_DRAFTS });
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
        increment,
        expect.anything(),
      );
    });

    it('a recruiting Draft still spends the daily allowance, then the bonus pack', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 3));
      await service.swipe(athleteUser, {
        targetUserId: 'rec-1',
        direction: SwipeDirection.DRAFT,
      });
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        increment,
        'athlete-1',
      );

      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 10, 2));
      await service.swipe(athleteUser, {
        targetUserId: 'rec-3',
        direction: SwipeDirection.DRAFT,
      });
      expect(prisma.subscriptions.update).toHaveBeenCalledWith({
        where: { user_id: 'athlete-1' },
        data: { bonus_swipes: { decrement: 1 } },
      });
    });

    it('a Super Draft in Community is a 400, and nothing is recorded', async () => {
      peerTarget('recruiter');
      for (const mode of [DiscoverMode.PEER, undefined]) {
        await expect(
          service.swipe(recruiterUser, {
            targetUserId: 'rec-2',
            direction: SwipeDirection.DRAFT,
            isSuper: true,
            mode,
          }),
        ).rejects.toThrow(
          new BadRequestException(SUPER_DRAFT_RECRUIT_ONLY_MESSAGE),
        );
      }
      expect(SUPER_DRAFT_RECRUIT_ONLY_MESSAGE).toBe(
        'Super Drafts are for recruiting.',
      );
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });

    it('mode=peer is not a way to Draft a coach for free: 403, even when out of Drafts', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 10)); // 0 left
      // Default target: a coach.
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
          mode: DiscoverMode.PEER,
        }),
      ).rejects.toThrow(
        new ForbiddenException('You cannot match with this user'),
      );
      // A parent in peer mode acts as themselves, so no free Draft for their
      // athlete either.
      await expect(
        service.swipe(parentUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
          mode: DiscoverMode.PEER,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.swipes.create).not.toHaveBeenCalled();

      // The same Draft sent as recruiting is metered: out of Drafts = 429.
      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
        }),
      ).rejects.toMatchObject({ status: 429 });
      expect(prisma.swipes.create).not.toHaveBeenCalled();
    });
  });

  describe('whoDraftedMe', () => {
    it('returns the list of drafters (free — no plan gate)', async () => {
      prisma.swipes.findMany.mockImplementation((args: any) => {
        // The "who drafted me" query filters by swiped_id; the exclude queries
        // filter by swiper_id and return nothing.
        if (args?.where?.swiped_id) {
          return Promise.resolve([
            {
              swiped_id: 'user-1',
              created_at: new Date(),
              users_swipes_swiper_idTousers: {
                id: 'rec-1',
                name: 'Coach A',
                avatar_url: null,
                role: 'coach',
                location: 'LA',
              },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.whoDraftedMe(athleteUser);
      expect(result).toHaveLength(1);
    });

    it('shows a parent who drafted their linked athlete (guardian proxy)', async () => {
      prisma.swipes.findMany.mockImplementation((args: any) => {
        // The parent resolves to athlete-9, so THAT is the swiped_id queried.
        if (args?.where?.swiped_id === 'athlete-9') {
          return Promise.resolve([
            {
              swiped_id: 'athlete-9',
              created_at: new Date(),
              users_swipes_swiper_idTousers: {
                id: 'rec-1',
                name: 'Coach A',
                avatar_url: null,
                role: 'coach',
                location: 'LA',
              },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.whoDraftedMe(parentUser);
      expect(result).toHaveLength(1);
    });
  });
});
