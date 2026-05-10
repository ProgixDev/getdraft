import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DiscoverService } from './discover.service';
import { SupabaseService } from '../../config/supabase.config';
import { NotificationsService } from '../notifications/notifications.service';
import {
  UserRole,
  SwipeDirection,
  CurrentUserPayload,
  PlanId,
} from '../../common/types';

// Helper: build a chainable Supabase query mock
const mockQueryBuilder = (finalResult: any = { data: [], error: null }) => {
  const builder: any = {};
  const methods = [
    'select', 'eq', 'neq', 'not', 'in', 'or', 'order', 'range',
    'limit', 'single', 'maybeSingle', 'insert', 'update', 'lt',
  ];
  methods.forEach((m) => {
    builder[m] = jest.fn().mockReturnValue(builder);
  });
  // Terminal methods return the result; chainable methods rely on `then`.
  builder.single.mockResolvedValue(finalResult);
  builder.maybeSingle.mockResolvedValue(finalResult);
  builder.then = (resolve: any) => resolve(finalResult);
  return builder;
};

describe('DiscoverService', () => {
  let service: DiscoverService;

  const mockAdminClient: any = { from: jest.fn(), rpc: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscoverService,
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: () => mockAdminClient,
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendPushToUser: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<DiscoverService>(DiscoverService);
  });

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

  describe('getFeed', () => {
    it('should throw ForbiddenException for parent users', async () => {
      await expect(service.getFeed(parentUser, {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return recruiter feed for athlete users', async () => {
      // Mock subscriptions query (getSwipesRemaining)
      const subBuilder = mockQueryBuilder({
        data: { daily_swipe_limit: 10, swipes_used_today: 3, swipes_reset_at: new Date().toISOString().split('T')[0] },
      });
      // Mock swipes query
      const swipesBuilder = mockQueryBuilder({ data: [] });
      // Mock blocks query
      const blocksBuilder = mockQueryBuilder({ data: [] });
      // Mock users query with recruiter feed
      const usersBuilder = mockQueryBuilder({
        data: [
          {
            id: 'rec-1',
            name: 'Coach Mike',
            avatar_url: null,
            location: 'LA, CA',
            country: 'US',
            recruiter_profiles: {
              role_type: 'coach',
              organization: 'UCLA',
              sport: 'football',
              verified: true,
              tags: ['NCAA'],
              photos: [],
            },
          },
        ],
        error: null,
      });

      let callCount = 0;
      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') return subBuilder;
        if (table === 'swipes') return swipesBuilder;
        if (table === 'blocks') return blocksBuilder;
        if (table === 'users') return usersBuilder;
        return mockQueryBuilder();
      });

      const result = await service.getFeed(athleteUser, { sport: 'football' });

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].name).toBe('Coach Mike');
      expect(result.cards[0].verified).toBe(true);
      expect(result.swipesRemaining).toBe(7);
    });

    it('should return athlete feed for recruiter users', async () => {
      const subBuilder = mockQueryBuilder({
        data: { daily_swipe_limit: 30, swipes_used_today: 0, swipes_reset_at: new Date().toISOString().split('T')[0] },
      });
      const swipesBuilder = mockQueryBuilder({ data: [] });
      const blocksBuilder = mockQueryBuilder({ data: [] });
      const usersBuilder = mockQueryBuilder({
        data: [
          {
            id: 'ath-1',
            name: 'Marcus Johnson',
            avatar_url: null,
            location: 'Austin, TX',
            country: 'US',
            athlete_profiles: {
              sport: 'football',
              position: 'QB',
              level: 'D1',
              bio: 'Star QB',
              class_year: '2025',
              gpa: 3.7,
              height: "6'2\"",
              weight: '215 lbs',
              photos: [],
              videos: [],
              forty_yard_dash: '4.65s',
              awards: ['MVP'],
            },
          },
        ],
        error: null,
      });

      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') return subBuilder;
        if (table === 'swipes') return swipesBuilder;
        if (table === 'blocks') return blocksBuilder;
        if (table === 'users') return usersBuilder;
        return mockQueryBuilder();
      });

      const result = await service.getFeed(recruiterUser, {});

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0].position).toBe('QB');
      expect(result.swipesRemaining).toBe(30);
    });
  });

  describe('swipe', () => {
    it('should throw ForbiddenException when swipe limit reached', async () => {
      const subBuilder = mockQueryBuilder({
        data: { daily_swipe_limit: 10, swipes_used_today: 10, swipes_reset_at: new Date().toISOString().split('T')[0] },
      });
      const blocksBuilder = mockQueryBuilder({ data: null });

      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'blocks') return blocksBuilder;
        if (table === 'subscriptions') return subBuilder;
        return mockQueryBuilder();
      });

      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException on self-swipe', async () => {
      await expect(
        service.swipe(athleteUser, {
          targetUserId: athleteUser.id,
          direction: SwipeDirection.DRAFT,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on duplicate swipe', async () => {
      const subBuilder = mockQueryBuilder({
        data: { daily_swipe_limit: 10, swipes_used_today: 5, swipes_reset_at: new Date().toISOString().split('T')[0] },
      });
      const blocksBuilder = mockQueryBuilder({ data: null });
      const insertBuilder = mockQueryBuilder({
        data: null,
        error: { code: '23505', message: 'duplicate' },
      });

      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'blocks') return blocksBuilder;
        if (table === 'subscriptions') return subBuilder;
        if (table === 'swipes') return insertBuilder;
        return mockQueryBuilder();
      });

      await expect(
        service.swipe(athleteUser, {
          targetUserId: 'rec-1',
          direction: SwipeDirection.DRAFT,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('whoDraftedMe', () => {
    it('should throw ForbiddenException for basic plan', async () => {
      const subBuilder = mockQueryBuilder({ data: { plan_id: PlanId.BASIC } });
      mockAdminClient.from.mockReturnValue(subBuilder);

      await expect(service.whoDraftedMe('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException for starter plan', async () => {
      const subBuilder = mockQueryBuilder({
        data: { plan_id: PlanId.STARTER },
      });
      mockAdminClient.from.mockReturnValue(subBuilder);

      await expect(service.whoDraftedMe('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return drafts for pro plan', async () => {
      const subBuilder = mockQueryBuilder({ data: { plan_id: PlanId.PRO } });
      const swipesBuilder = mockQueryBuilder({
        data: [
          {
            swiped_id: 'user-1',
            created_at: '2026-04-20T10:00:00Z',
            swiper: { id: 'rec-1', name: 'Coach A', role: 'coach' },
          },
        ],
      });

      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === 'subscriptions') return subBuilder;
        if (table === 'swipes') return swipesBuilder;
        return mockQueryBuilder();
      });

      const result = await service.whoDraftedMe('user-1');
      expect(result).toHaveLength(1);
    });
  });
});
