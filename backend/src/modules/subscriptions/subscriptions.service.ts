import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';
import { StripeService } from '../../config/stripe.config';
import { PlanId, PLAN_SWIPE_LIMITS } from '../../common/types';

type StripeWebhookEvent = {
  type: string;
  data: { object: any };
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private priceMap: Record<string, string>;

  constructor(
    private supabaseService: SupabaseService,
    private stripeService: StripeService,
    private configService: ConfigService,
  ) {
    this.priceMap = {
      [PlanId.STARTER]: this.configService.get('STRIPE_PRICE_STARTER') || '',
      [PlanId.PRO]: this.configService.get('STRIPE_PRICE_PRO') || '',
      [PlanId.PREMIUM]: this.configService.get('STRIPE_PRICE_PREMIUM') || '',
    };
  }

  async getMySubscription(userId: string) {
    const supabase = this.supabaseService.getAdminClient();

    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data) {
      return {
        plan_id: PlanId.BASIC,
        status: 'active',
        daily_swipe_limit: 10,
        swipes_used_today: 0,
      };
    }

    const today = new Date().toISOString().split('T')[0];
    if (data.swipes_reset_at !== today) {
      await supabase
        .from('subscriptions')
        .update({ swipes_used_today: 0, swipes_reset_at: today })
        .eq('user_id', userId);
      data.swipes_used_today = 0;
      data.swipes_reset_at = today;
    }

    return data;
  }

  async createCheckout(userId: string, email: string, planId: PlanId) {
    if (planId === PlanId.BASIC) {
      throw new BadRequestException('Basic plan is free, no checkout needed');
    }

    const stripe = this.stripeService.getClient();
    const priceId = this.priceMap[planId];
    if (!priceId) {
      throw new BadRequestException('Invalid plan');
    }

    const supabase = this.supabaseService.getAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();

    let customerId = user?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.configService.get('FRONTEND_URL') || 'getdraft://'}subscription-success`,
      cancel_url: `${this.configService.get('FRONTEND_URL') || 'getdraft://'}subscription-cancel`,
      metadata: { userId, planId },
    });

    return { checkoutUrl: session.url };
  }

  async createPortalSession(userId: string) {
    const stripe = this.stripeService.getClient();
    const supabase = this.supabaseService.getAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();

    if (!user?.stripe_customer_id) {
      throw new NotFoundException('No subscription found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${this.configService.get('FRONTEND_URL') || 'getdraft://'}subscription`,
    });

    return { portalUrl: session.url };
  }

  async handleWebhook(event: StripeWebhookEvent) {
    const supabase = this.supabaseService.getAdminClient();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = session.metadata || {};
        const userId = metadata.userId;
        const planId = metadata.planId as PlanId;
        if (!userId || !planId) {
          this.logger.warn('checkout.session.completed missing metadata');
          break;
        }

        const swipeLimit = PLAN_SWIPE_LIMITS[planId] ?? 10;

        // Fetch the subscription so we can persist period/price fields.
        let priceId: string | null = null;
        let periodStart: string | null = null;
        let periodEnd: string | null = null;

        if (session.subscription) {
          try {
            const stripe = this.stripeService.getClient();
            const sub = (await stripe.subscriptions.retrieve(
              session.subscription,
            )) as any;
            const item = sub.items?.data?.[0];
            priceId = item?.price?.id ?? null;
            periodStart = this.toIso(item?.current_period_start);
            periodEnd = this.toIso(item?.current_period_end);
          } catch (err: any) {
            this.logger.warn(
              `Could not fetch Stripe subscription ${session.subscription}: ${err?.message}`,
            );
          }
        }

        const { error: subErr } = await supabase
          .from('subscriptions')
          .update({
            plan_id: planId,
            stripe_subscription_id: session.subscription ?? null,
            stripe_price_id: priceId,
            status: 'active',
            daily_swipe_limit: swipeLimit,
            current_period_start: periodStart,
            current_period_end: periodEnd,
          })
          .eq('user_id', userId);
        if (subErr) {
          this.logger.error(`subscriptions update failed: ${subErr.message}`);
          break;
        }

        const { error: userErr } = await supabase
          .from('users')
          .update({
            plan_id: planId,
            stripe_subscription_id: session.subscription ?? null,
          })
          .eq('id', userId);
        if (userErr) {
          this.logger.error(`users update failed: ${userErr.message}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const item = sub.items?.data?.[0];
        const priceId = item?.price?.id ?? null;
        const periodStart = this.toIso(item?.current_period_start);
        const periodEnd = this.toIso(item?.current_period_end);

        await supabase
          .from('subscriptions')
          .update({
            status: sub.status === 'active' ? 'active' : sub.status,
            stripe_price_id: priceId,
            current_period_start: periodStart,
            current_period_end: periodEnd,
          })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabase
          .from('subscriptions')
          .update({
            plan_id: PlanId.BASIC,
            status: 'canceled',
            daily_swipe_limit: PLAN_SWIPE_LIMITS[PlanId.BASIC],
            stripe_subscription_id: null,
            stripe_price_id: null,
          })
          .eq('stripe_subscription_id', sub.id);

        await supabase
          .from('users')
          .update({ plan_id: PlanId.BASIC, stripe_subscription_id: null })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (subId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      default:
        // Other events are intentionally ignored.
        break;
    }
  }

  private toIso(unixSeconds: number | null | undefined): string | null {
    if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) {
      return null;
    }
    return new Date(unixSeconds * 1000).toISOString();
  }
}
