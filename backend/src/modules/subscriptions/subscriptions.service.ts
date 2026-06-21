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

/**
 * One-off swipe top-ups. Sized so a swipe averages out cheaper as
 * the pack gets bigger — gives users a nudge to buy the larger pack.
 * Amount is in the smallest unit (cents) since that's what Stripe wants.
 */
export const SWIPE_PACKS: Record<
  string,
  { swipes: number; amountCents: number; label: string }
> = {
  small: { swipes: 10, amountCents: 100, label: '10 swipes' },
  medium: { swipes: 50, amountCents: 400, label: '50 swipes' },
  large: { swipes: 100, amountCents: 700, label: '100 swipes' },
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
    };
  }

  /**
   * Mobile Payment Sheet flow. Creates (or reuses) the Stripe customer,
   * starts a Subscription with `payment_behavior: 'default_incomplete'`
   * so the first payment is owed via the returned PaymentIntent, and
   * returns the client secret along with an ephemeral key the mobile
   * SDK needs to display saved payment methods.
   *
   * The mobile client takes the returned bundle, calls
   * initPaymentSheet(...) and then presentPaymentSheet() — Stripe's
   * native UI collects the card, confirms the PaymentIntent, and the
   * customer.subscription.created webhook flips our subscriptions row
   * to active.
   */
  async createPaymentSheet(userId: string, email: string, planId: PlanId) {
    if (planId === PlanId.BASIC) {
      throw new BadRequestException('Basic plan is free, no payment needed.');
    }
    const stripe = this.stripeService.getClient();
    const priceId = this.priceMap[planId];
    if (!priceId) {
      throw new BadRequestException(`Stripe price not configured for plan ${planId}.`);
    }

    const supabase = this.supabaseService.getAdminClient();
    const { data: userRow } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();

    let customerId = userRow?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // A retry (crashed app, dismissed sheet, back-button) must not stack
    // a second subscription on the customer — in production both first
    // invoices can settle and the user is billed twice. One plan per
    // user: cancel any prior attempt that never finished checkout before
    // creating the new one.
    const priorSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'incomplete',
      limit: 20,
    });
    for (const stale of priorSubs.data) {
      try {
        await stripe.subscriptions.cancel(stale.id);
        this.logger.log(
          `[payment-sheet] cancelled stale incomplete sub ${stale.id} for user ${userId}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `[payment-sheet] could not cancel stale sub ${stale.id}: ${err?.message}`,
        );
      }
    }

    // Ephemeral key is required by the mobile SDK so the device can
    // talk to Stripe on the customer's behalf without exposing the
    // secret key. Tie its API version to the latest stable.
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2026-04-22.dahlia' as any },
    );

    const subscription = (await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      // Stripe API 2026-04-22.dahlia replaced `latest_invoice.payment_intent`
      // with `latest_invoice.confirmation_secret`. Expand both so the
      // service tolerates either response shape across API versions.
      expand: [
        'latest_invoice.confirmation_secret',
        'latest_invoice.payment_intent',
      ],
      metadata: { user_id: userId, plan_id: planId },
    })) as any;

    const invoice = subscription.latest_invoice;
    // New API path (dahlia+): confirmation_secret.client_secret
    // Legacy path:            payment_intent.client_secret
    const clientSecret: string | undefined =
      invoice?.confirmation_secret?.client_secret ??
      invoice?.payment_intent?.client_secret;

    if (!clientSecret) {
      this.logger.error(
        `Subscription created but no client_secret on latest_invoice (sub=${subscription.id})`,
      );
      throw new BadRequestException('Could not initialize payment.');
    }

    // Persist just the link to Stripe's subscription id. We DO NOT
    // pre-flip plan_id or status — payment may still fail/cancel.
    // The webhook (or the second leg of getMySubscription) does the
    // final source-of-truth update once Stripe confirms the charge.
    await supabase
      .from('subscriptions')
      .update({
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
      })
      .eq('user_id', userId);

    return {
      paymentIntentClientSecret: clientSecret,
      ephemeralKeySecret: ephemeralKey.secret as string,
      customerId,
      publishableKey: this.configService.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
      subscriptionId: subscription.id as string,
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

    // We don't store cancel_at_period_end in the DB (no column for it),
    // so for paid subs we ask Stripe for the live value. Cheap enough to
    // do on demand — the subscription screen isn't a hot path.
    if (data.stripe_subscription_id) {
      try {
        const stripe = this.stripeService.getClient();
        const sub = (await stripe.subscriptions.retrieve(
          data.stripe_subscription_id,
        )) as any;
        data.cancel_at_period_end = !!sub.cancel_at_period_end;
        data.cancel_at = this.toIso(sub.cancel_at);
        // If Stripe's period_end is newer than our cached one (e.g. the
        // webhook hasn't fired yet) prefer the live value so the UI's
        // "Cancels on {date}" line is accurate.
        const item = sub.items?.data?.[0];
        const livePeriodEnd = this.toIso(
          sub.current_period_end ?? item?.current_period_end,
        );
        if (livePeriodEnd) data.current_period_end = livePeriodEnd;

        // Self-heal: if Stripe says this sub is paid but our row is still
        // stale (the webhook never arrived), apply the plan now so the
        // screen AND the swipe-limit reads are correct without depending on
        // webhook delivery.
        const livePlan = sub.metadata?.plan_id as PlanId | undefined;
        if (
          (sub.status === 'active' || sub.status === 'trialing') &&
          livePlan &&
          (data.plan_id !== livePlan || data.status !== 'active')
        ) {
          const applied = await this.applyActiveSubscription(sub.id);
          if (applied) {
            const { data: fresh } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();
            if (fresh) Object.assign(data, fresh);
          }
        }
      } catch (err: any) {
        this.logger.warn(
          `Could not fetch Stripe sub ${data.stripe_subscription_id}: ${err?.message}`,
        );
      }
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

  /**
   * Cancel the user's active Stripe subscription. By default Stripe
   * marks it cancel_at_period_end so the user keeps the plan until
   * their next renewal date; pass `immediate=true` to terminate now.
   * On the next webhook (customer.subscription.deleted or updated)
   * our public.subscriptions row flips back to Basic.
   */
  async cancelSubscription(userId: string, immediate = false) {
    const stripe = this.stripeService.getClient();
    const supabase = this.supabaseService.getAdminClient();

    const { data: row } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status, plan_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!row?.stripe_subscription_id) {
      // Already on Basic / nothing to cancel.
      return { canceled: false, message: 'No active subscription.' };
    }

    if (immediate) {
      const sub = (await stripe.subscriptions.cancel(
        row.stripe_subscription_id,
      )) as any;
      // Optimistically reflect immediately so the UI updates without
      // waiting for the webhook.
      await supabase
        .from('subscriptions')
        .update({
          plan_id: PlanId.BASIC,
          status: 'canceled',
          daily_swipe_limit: PLAN_SWIPE_LIMITS[PlanId.BASIC],
          stripe_subscription_id: null,
          stripe_price_id: null,
        })
        .eq('user_id', userId);
      await supabase
        .from('users')
        .update({ plan_id: PlanId.BASIC, stripe_subscription_id: null })
        .eq('id', userId);
      return { canceled: true, status: sub.status, atPeriodEnd: false };
    }

    const sub = (await stripe.subscriptions.update(
      row.stripe_subscription_id,
      { cancel_at_period_end: true },
    )) as any;
    return {
      canceled: true,
      status: sub.status,
      atPeriodEnd: true,
      cancelAt: this.toIso(sub.cancel_at),
    };
  }

  /**
   * Reactivate a subscription that was set to cancel_at_period_end.
   * No-op if the subscription is already active and not scheduled to
   * cancel.
   */
  async resumeSubscription(userId: string) {
    const stripe = this.stripeService.getClient();
    const supabase = this.supabaseService.getAdminClient();
    const { data: row } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!row?.stripe_subscription_id) {
      throw new BadRequestException('No subscription to resume.');
    }
    const sub = (await stripe.subscriptions.update(
      row.stripe_subscription_id,
      { cancel_at_period_end: false },
    )) as any;
    return { resumed: true, status: sub.status };
  }

  /**
   * One-off swipe-pack purchase via a PaymentIntent (NOT a Subscription).
   * Mirrors the Payment Sheet bundle shape so the mobile client can
   * reuse the same initPaymentSheet flow. On success the
   * payment_intent.succeeded webhook credits bonus_swipes.
   */
  async createSwipePackSheet(userId: string, email: string, packId: string) {
    const pack = SWIPE_PACKS[packId];
    if (!pack) {
      throw new BadRequestException(`Unknown swipe pack "${packId}".`);
    }
    const stripe = this.stripeService.getClient();
    const supabase = this.supabaseService.getAdminClient();

    const { data: userRow } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();

    let customerId = userRow?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2026-04-22.dahlia' as any },
    );

    const intent = await stripe.paymentIntents.create({
      amount: pack.amountCents,
      currency: 'usd',
      customer: customerId,
      // Don't auto-attach as default — this is a one-off, not a card on file.
      setup_future_usage: undefined,
      // Lets PaymentSheet pick the best method (card, Apple Pay, etc.)
      automatic_payment_methods: { enabled: true },
      description: `GetDraft ${pack.label} pack`,
      metadata: {
        user_id: userId,
        pack_id: packId,
        type: 'swipe_pack',
        swipes: String(pack.swipes),
      },
    });

    // Audit row — `status: pending` until the webhook lands. We use
    // payment_intent.id as the idempotency key so duplicate webhook
    // fires don't double-credit. If THIS insert fails, the
    // creditSwipePackFromIntent webhook handler has nothing to claim
    // (it filters on status='pending'), so the user pays but never gets
    // the swipes. Surface the failure BEFORE returning a client secret.
    const { error: auditErr } = await supabase
      .from('swipe_pack_purchases')
      .insert({
        user_id: userId,
        stripe_payment_intent_id: intent.id,
        pack_id: packId,
        swipes_granted: pack.swipes,
        amount_cents: pack.amountCents,
        currency: 'usd',
        status: 'pending',
      });
    if (auditErr) {
      this.logger.error(
        `swipe_pack audit insert failed for ${intent.id}: ${auditErr.message}`,
      );
      throw new BadRequestException('Could not initialize swipe pack payment.');
    }

    if (!intent.client_secret) {
      throw new BadRequestException('Could not initialize swipe pack payment.');
    }

    return {
      paymentIntentClientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      ephemeralKeySecret: ephemeralKey.secret as string,
      customerId,
      publishableKey: this.configService.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
      pack: { id: packId, ...pack },
    };
  }

  /** Public list of available packs so the mobile screen stays in sync. */
  getSwipePacks() {
    return Object.entries(SWIPE_PACKS).map(([id, p]) => ({ id, ...p }));
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

      // `customer.subscription.updated` is folded into the paid-status
      // branch below — that branch gates on active|trialing and writes
      // plan_id/period/price atomically. past_due is owned by
      // invoice.payment_failed; canceled by customer.subscription.deleted.

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
        // Same dual-location read as the payment_succeeded branch — the
        // dahlia API moved invoice.subscription to
        // invoice.parent.subscription_details.subscription. Without this
        // a failed renewal silently didn't flip status to past_due,
        // leaving the user on their old paid limits.
        const subId =
          invoice.subscription ??
          invoice.parent?.subscription_details?.subscription ??
          null;
        if (subId) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subId);
        }
        break;
      }

      case 'invoice.payment_succeeded':
      case 'invoice.paid':
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        // First payment of the PaymentSheet flow lands here. Pull the
        // subscription, persist period + price + plan, mark active.
        //
        // GATE: Stripe fires `customer.subscription.created` the instant
        // our `default_incomplete` subscription is created — BEFORE the
        // card is charged. If we activated the paid plan on `incomplete`,
        // any user could open the plan screen, dismiss the Payment Sheet,
        // and walk away with Pro. Only the paid statuses below are
        // allowed to flip plan_id + daily_swipe_limit. `incomplete`,
        // `incomplete_expired`, `unpaid`, `canceled` are no-ops here;
        // the dedicated branches in this switch handle them separately.
        const obj = event.data.object;
        const subId =
          event.type === 'customer.subscription.created' ||
          event.type === 'customer.subscription.updated'
            ? obj.id
            : // Stripe API 2026-04-22.dahlia moved Invoice.subscription
              // off the top-level into invoice.parent.subscription_details.
              // Read both so the handler works on either API version the
              // endpoint is configured for.
              obj.subscription ??
              obj.parent?.subscription_details?.subscription ??
              null;
        if (!subId) break;
        await this.applyActiveSubscription(subId);
        break;
      }

      case 'payment_intent.succeeded': {
        // One-off purchases land here. We only care about swipe-pack
        // intents (subscription payments come in via invoice.* events).
        await this.creditSwipePackFromIntent(event.data.object);
        break;
      }

      default:
        // Other events are intentionally ignored.
        break;
    }
  }

  /**
   * Source-of-truth apply: pull a subscription straight from Stripe and, IF
   * it is actually paid (active|trialing), flip our subscriptions + users rows
   * to the paid plan and supersede any other active sub on the customer.
   *
   * Shared by the Stripe webhook AND the confirm-on-return endpoint /
   * getMySubscription self-heal, so the plan updates even when webhook
   * delivery is delayed or not configured (local dev, mis-set prod endpoint).
   * Returns true if a paid plan was applied. Never throws.
   */
  private async applyActiveSubscription(subId: string): Promise<boolean> {
    const supabase = this.supabaseService.getAdminClient();
    try {
      const stripe = this.stripeService.getClient();
      const sub = (await stripe.subscriptions.retrieve(subId, {
        expand: ['items.data.price'],
      })) as any;

      // GATE: Stripe creates the default_incomplete sub BEFORE the card is
      // charged. Only paid statuses may flip the plan — otherwise a user
      // could open the sheet, dismiss it, and keep Pro.
      if (sub.status !== 'active' && sub.status !== 'trialing') {
        this.logger.log(
          `[stripe] ${subId} not paid yet (status=${sub.status}) — no plan change`,
        );
        return false;
      }

      const item = sub.items?.data?.[0];
      const priceId = item?.price?.id ?? null;
      const userId = sub.metadata?.user_id as string | undefined;
      const planId = sub.metadata?.plan_id as PlanId | undefined;
      if (!userId || !planId) {
        this.logger.warn(
          `[stripe] ${subId} missing metadata (user_id=${userId} plan_id=${planId})`,
        );
        return false;
      }
      const swipeLimit = PLAN_SWIPE_LIMITS[planId] ?? 10;
      const periodStart = this.toIso(
        sub.current_period_start ?? item?.current_period_start,
      );
      const periodEnd = this.toIso(
        sub.current_period_end ?? item?.current_period_end,
      );

      await supabase
        .from('subscriptions')
        .update({
          plan_id: planId,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId,
          status: 'active',
          daily_swipe_limit: swipeLimit,
          current_period_start: periodStart,
          current_period_end: periodEnd,
        })
        .eq('user_id', userId);

      await supabase
        .from('users')
        .update({ plan_id: planId, stripe_subscription_id: sub.id })
        .eq('id', userId);

      this.logger.log(`[stripe] user ${userId} → plan ${planId} (sub ${sub.id})`);

      // One plan per user: cancel any other active sub on this customer so a
      // retry / upgrade doesn't double-bill next cycle.
      const others = await stripe.subscriptions.list({
        customer: sub.customer as string,
        status: 'active',
        limit: 20,
      });
      for (const other of others.data) {
        if (other.id === sub.id) continue;
        try {
          await stripe.subscriptions.cancel(other.id);
          this.logger.log(
            `[stripe] cancelled superseded sub ${other.id} (kept ${sub.id})`,
          );
        } catch (err: any) {
          this.logger.warn(
            `[stripe] could not cancel superseded sub ${other.id}: ${err?.message}`,
          );
        }
      }
      return true;
    } catch (err: any) {
      this.logger.warn(
        `applyActiveSubscription failed for ${subId}: ${err?.message}`,
      );
      return false;
    }
  }

  /**
   * Idempotently credit a one-off swipe-pack from its PaymentIntent. Claims
   * the pending audit row (so duplicate webhook + confirm calls can't
   * double-credit) and adds to bonus_swipes. Shared by the webhook and the
   * confirm-on-return endpoint. Caller is responsible for confirming the
   * intent actually succeeded. Returns true if it credited this call.
   */
  private async creditSwipePackFromIntent(intent: any): Promise<boolean> {
    const supabase = this.supabaseService.getAdminClient();
    // Belt-and-braces — the webhook switch only invokes us for
    // `payment_intent.succeeded`, but a caller (e.g. confirm-on-return)
    // could re-use this helper with a not-yet-paid intent and silently
    // credit free swipes. Hard-gate on intent.status before any work.
    if (intent?.status !== 'succeeded') return false;
    const meta = intent?.metadata ?? {};
    if (meta.type !== 'swipe_pack') return false;

    const userId = meta.user_id as string | undefined;
    const packId = meta.pack_id as string | undefined;
    const swipes = Number(meta.swipes ?? 0);
    if (!userId || !packId || !Number.isFinite(swipes) || swipes <= 0) {
      this.logger.warn(
        `swipe_pack intent ${intent?.id} missing metadata (user=${userId} pack=${packId} swipes=${swipes})`,
      );
      return false;
    }

    // Idempotency: only the writer that flips pending → succeeded credits.
    const { data: claimed, error: claimErr } = await supabase
      .from('swipe_pack_purchases')
      .update({ status: 'succeeded', granted_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', intent.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (claimErr) {
      this.logger.error(
        `swipe_pack audit update failed for ${intent.id}: ${claimErr.message}`,
      );
      return false;
    }
    if (!claimed) {
      this.logger.log(
        `swipe_pack intent ${intent.id} already credited — skipping.`,
      );
      return false;
    }

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('bonus_swipes')
      .eq('user_id', userId)
      .maybeSingle();

    if (!sub) {
      await supabase.from('subscriptions').insert({
        user_id: userId,
        plan_id: PlanId.BASIC,
        status: 'active',
        daily_swipe_limit: PLAN_SWIPE_LIMITS[PlanId.BASIC],
        bonus_swipes: swipes,
      });
    } else {
      await supabase
        .from('subscriptions')
        .update({ bonus_swipes: (sub.bonus_swipes ?? 0) + swipes })
        .eq('user_id', userId);
    }

    this.logger.log(
      `[stripe] user ${userId} bought ${swipes}-swipe pack (${intent.id})`,
    );
    return true;
  }

  /**
   * Confirm-on-return (subscriptions): called by the client right after the
   * Payment Sheet reports success. Reconciles the user's subscription straight
   * from Stripe so the plan flips immediately, independent of webhook
   * delivery. The webhook remains the backstop. Returns the fresh row.
   */
  async confirmSubscription(userId: string) {
    const supabase = this.supabaseService.getAdminClient();
    const { data: row } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (row?.stripe_subscription_id) {
      await this.applyActiveSubscription(row.stripe_subscription_id);
    }
    return this.getMySubscription(userId);
  }

  /**
   * Confirm-on-return (swipe packs): verify the PaymentIntent with Stripe,
   * ensure it belongs to the caller and actually succeeded, then credit
   * idempotently. Independent of the webhook.
   */
  async confirmSwipePack(userId: string, paymentIntentId: string) {
    if (!paymentIntentId) {
      throw new BadRequestException('Missing paymentIntentId.');
    }
    const stripe = this.stripeService.getClient();
    const intent = (await stripe.paymentIntents.retrieve(paymentIntentId)) as any;
    if (intent?.metadata?.user_id !== userId) {
      throw new BadRequestException('This payment does not belong to you.');
    }
    if (intent.status === 'succeeded') {
      await this.creditSwipePackFromIntent(intent);
    }
    const sub = await this.getMySubscription(userId);
    return { bonus_swipes: sub?.bonus_swipes ?? 0, status: intent.status };
  }

  private toIso(unixSeconds: number | null | undefined): string | null {
    if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds)) {
      return null;
    }
    return new Date(unixSeconds * 1000).toISOString();
  }
}
