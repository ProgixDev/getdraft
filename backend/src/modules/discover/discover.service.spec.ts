import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DiscoverService } from './discover.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserRole,
  SwipeDirection,
  CurrentUserPayload,
} from '../../common/types';

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

  // A subscription dated in the CURRENT month so getSwipesRemaining doesn't
  // trigger the monthly reset.
  const sub = (
    plan_id = 'basic',
    swipes_used_today = 0,
    bonus_swipes = 0,
  ) => ({ plan_id, swipes_used_today, swipes_reset_at: new Date(), bonus_swipes });

  beforeEach(async () => {
    prisma = {
      public_users: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ is_banned: false }),
      },
      swipes: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      blocks: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
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
    it('throws ForbiddenException for parent users', async () => {
      await expect(service.getFeed(parentUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns the feed with the monthly Draft allowance remaining', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 3)); // 20 - 3
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
      expect(result.swipesRemaining).toBe(17);
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

    it('allows a PASS even when out of Drafts (passes are free)', async () => {
      prisma.subscriptions.findUnique.mockResolvedValue(sub('basic', 20)); // 0 left
      const result = await service.swipe(athleteUser, {
        targetUserId: 'rec-1',
        direction: SwipeDirection.PASS,
      });
      expect(result.matched).toBe(false);
      expect(prisma.swipes.create).toHaveBeenCalled();
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

      const result = await service.whoDraftedMe('user-1');
      expect(result).toHaveLength(1);
    });
  });
});
