import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.config';
import { StripeService } from '../../config/stripe.config';
import { PlanId, PLAN_SWIPE_LIMITS } from '../../common/types';

@Injectable()
export class SubscriptionsService {
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
      .single();

    if (!data) {
      return {
        plan_id: PlanId.BASIC,
        status: 'active',
        daily_swipe_limit: 10,
        swipes_used_today: 0,
      };
    }

    // Reset daily counter if new day
    const today = new Date().toISOString().split('T')[0];
    if (data.swipes_reset_at !== today) {
      await supabase
        .from('subscriptions')
        .update({ swipes_used_today: 0, swipes_reset_at: today })
        .eq('user_id', userId);
      data.swipes_used_today = 0;
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

    // Get or create Stripe customer
    let { data: user } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

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
      .single();

    if (!user?.stripe_customer_id) {
      throw new NotFoundException('No subscription found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${this.configService.get('FRONTEND_URL') || 'getdraft://'}subscription`,
    });

    return { portalUrl: session.url };
  }

  async handleWebhook(event: any) {
    const supabase = this.supabaseService.getAdminClient();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, planId } = session.metadata;
        const swipeLimit = PLAN_SWIPE_LIMITS[planId as PlanId] || 10;

        await supabase
          .from('subscriptions')
          .update({
            plan_id: planId,
            stripe_subscription_id: session.subscription,
            status: 'active',
            daily_swipe_limit: swipeLimit,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);

        await supabase
          .from('users')
          .update({ plan_id: planId })
          .eq('id', userId);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await supabase
          .from('subscriptions')
          .update({
            status: subscription.status === 'active' ? 'active' : 'past_due',
            current_period_start: new Date(
              subscription.current_period_start * 1000,
            ).toISOString(),
            current_period_end: new Date(
              subscription.current_period_end * 1000,
            ).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await supabase
          .from('subscriptions')
          .update({
            plan_id: PlanId.BASIC,
            status: 'canceled',
            daily_swipe_limit: PLAN_SWIPE_LIMITS[PlanId.BASIC],
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', invoice.subscription);
        }
        break;
      }
    }
  }
}
