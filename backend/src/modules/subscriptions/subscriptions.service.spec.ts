import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { SupabaseService } from '../../config/supabase.config';
import { StripeService } from '../../config/stripe.config';
import { PlanId } from '../../common/types';

const mockQueryBuilder = (finalResult: any = { data: null, error: null }) => {
  const builder: any = {};
  ['select', 'eq', 'single', 'maybeSingle', 'update', 'insert'].forEach((m) => {
    builder[m] = jest.fn().mockReturnValue(builder);
  });
  builder.single.mockResolvedValue(finalResult);
  builder.maybeSingle.mockResolvedValue(finalResult);
  builder.then = (resolve: any) => resolve(finalResult);
  return builder;
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  const mockAdminClient: any = { from: jest.fn() };
  const mockStripeClient: any = {
    customers: { create: jest.fn() },
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => mockAdminClient },
        },
        {
          provide: StripeService,
          useValue: { getClient: () => mockStripeClient },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const map: Record<string, string> = {
                STRIPE_PRICE_STARTER: 'price_starter',
                STRIPE_PRICE_PRO: 'price_pro',
                STRIPE_PRICE_PREMIUM: 'price_premium',
                FRONTEND_URL: 'getdraft://',
              };
              return map[key] || '';
            },
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  describe('getMySubscription', () => {
    it('should return default basic plan when no subscription found', async () => {
      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: null }),
      );

      const result = await service.getMySubscription('user-1');
      expect(result.plan_id).toBe(PlanId.BASIC);
      expect(result.daily_swipe_limit).toBe(10);
    });

    it('should return existing subscription data', async () => {
      const today = new Date().toISOString().split('T')[0];
      const subData = {
        plan_id: PlanId.PRO,
        status: 'active',
        daily_swipe_limit: 100,
        swipes_used_today: 15,
        swipes_reset_at: today,
      };

      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: subData }),
      );

      const result = await service.getMySubscription('user-1');
      expect(result.plan_id).toBe(PlanId.PRO);
      expect(result.swipes_used_today).toBe(15);
    });

    it('should reset swipes when new day', async () => {
      const subData = {
        plan_id: PlanId.PRO,
        status: 'active',
        daily_swipe_limit: 100,
        swipes_used_today: 50,
        swipes_reset_at: '2026-04-20', // old date
      };

      const selectBuilder = mockQueryBuilder({ data: subData });
      const updateBuilder = mockQueryBuilder({ data: null });

      let callCount = 0;
      mockAdminClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectBuilder : updateBuilder;
      });

      const result = await service.getMySubscription('user-1');
      expect(result.swipes_used_today).toBe(0);
    });
  });

  describe('createCheckout', () => {
    it('should throw BadRequestException for basic plan', async () => {
      await expect(
        service.createCheckout('user-1', 'test@test.com', PlanId.BASIC),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create checkout session for paid plan', async () => {
      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: { stripe_customer_id: 'cus_123' } }),
      );

      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-url',
      });

      const result = await service.createCheckout(
        'user-1',
        'test@test.com',
        PlanId.PRO,
      );

      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/session-url');
    });

    it('should create Stripe customer if not exists', async () => {
      const selectBuilder = mockQueryBuilder({
        data: { stripe_customer_id: null },
      });
      const updateBuilder = mockQueryBuilder({ data: null });

      let callCount = 0;
      mockAdminClient.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? selectBuilder : updateBuilder;
      });

      mockStripeClient.customers.create.mockResolvedValue({ id: 'cus_new' });
      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/new',
      });

      const result = await service.createCheckout(
        'user-1',
        'test@test.com',
        PlanId.STARTER,
      );

      expect(mockStripeClient.customers.create).toHaveBeenCalledWith({
        email: 'test@test.com',
      });
      expect(result.checkoutUrl).toBeDefined();
    });
  });

  describe('createPortalSession', () => {
    it('should throw NotFoundException when no subscription', async () => {
      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: null }),
      );

      await expect(service.createPortalSession('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create portal session', async () => {
      mockAdminClient.from.mockReturnValue(
        mockQueryBuilder({ data: { stripe_customer_id: 'cus_123' } }),
      );

      mockStripeClient.billingPortal.sessions.create.mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      });

      const result = await service.createPortalSession('user-1');
      expect(result.portalUrl).toBe('https://billing.stripe.com/portal');
    });
  });

  describe('handleWebhook', () => {
    it('should handle checkout.session.completed', async () => {
      const updateBuilder = mockQueryBuilder({ data: null });
      mockAdminClient.from.mockReturnValue(updateBuilder);

      await service.handleWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { userId: 'user-1', planId: 'pro' },
            subscription: 'sub_123',
          },
        },
      });

      expect(mockAdminClient.from).toHaveBeenCalledWith('subscriptions');
      expect(mockAdminClient.from).toHaveBeenCalledWith('users');
    });

    it('should handle customer.subscription.deleted (downgrade to basic)', async () => {
      const updateBuilder = mockQueryBuilder({ data: null });
      mockAdminClient.from.mockReturnValue(updateBuilder);

      await service.handleWebhook({
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123' } },
      });

      expect(mockAdminClient.from).toHaveBeenCalledWith('subscriptions');
    });

    it('should handle invoice.payment_failed', async () => {
      const updateBuilder = mockQueryBuilder({ data: null });
      mockAdminClient.from.mockReturnValue(updateBuilder);

      await service.handleWebhook({
        type: 'invoice.payment_failed',
        data: { object: { subscription: 'sub_123' } },
      });

      expect(mockAdminClient.from).toHaveBeenCalledWith('subscriptions');
    });
  });
});
