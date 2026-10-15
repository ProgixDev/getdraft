import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.config';
import { PlanId, PLAN_SWIPE_LIMITS } from '../../common/types';
import type { AppleNotification } from './receipt-verifier.service';

/** Product ids as created in App Store Connect and Play Console. */
export const STORE_PLAN_PRODUCTS: Record<string, PlanId> = {
  starter_monthly: PlanId.STARTER,
  pro_monthly: PlanId.PRO,
  elite_monthly: PlanId.ELITE,
};

/** Consumable Draft packs, and how many Drafts each grants. */
export const STORE_PACK_PRODUCTS: Record<string, number> = {
  drafts_10: 10,
  drafts_50: 50,
  drafts_100: 100,
};

type Store = 'apple' | 'google';

/**
 * Notifications that say nothing about entitlement. CONSUMPTION_REQUEST and
 * REFUND_DECLINED carry the transaction of a period someone asked to refund,
 * not the subscription's current state, so applying them would rewrite a
 * paying user's plan from a stale period.
 */
const IGNORED_NOTIFICATIONS = new Set([
  'CONSUMPTION_REQUEST',
  'REFUND_DECLINED',
  'TEST',
]);

type SubscriptionRow = {
  plan_id: string | null;
  status: string | null;
  store: string | null;
  store_transaction_id: string | null;
  stripe_subscription_id: string | null;
  store_signed_at: string | null;
  current_period_end: string | null;
};

export type StoreSubscriptionResult = {
  /** The plan the account is on after this call. */
  plan_id: string;
  /** False when nothing was written; `reason` says why. */
  applied: boolean;
  reason?: 'stale' | 'not_current' | 'older_period' | 'stripe' | 'other_store';
  /** True when the account's current store subscription is this one. */
  current: boolean;
};

/**
 * Purchases made through StoreKit and Play Billing.
 *
 * Apple requires StoreKit for digital goods and rejects third-party payment
 * sheets outright; Google's Payments policy says the same about Play Billing.
 * Stripe stays for web, where neither rule applies.
 *
 * Entitlement is written to the same `subscriptions` row the Stripe path uses,
 * so every consumer of it -- swipe limits, Super Draft caps, the rankings view
 * -- keeps reading one place and needed no changes.
 *
 * Trust model: nothing here is called on a client's say-so. Entitlement is
 * only granted after ReceiptVerifierService has confirmed the receipt with
 * Apple or Google. A device claiming "I bought Pro" is a claim, and on a
 * jailbroken phone a forgeable one; the store is the only authority.
 */
@Injectable()
export class StoreBillingService {
  private readonly logger = new Logger(StoreBillingService.name);

  constructor(private supabaseService: SupabaseService) {}

  /** The account a store subscription is already recorded against, if any. */
  async ownerOfStoreSubscription(
    transactionId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('subscriptions')
      .select('user_id')
      .eq('store_transaction_id', transactionId)
      .maybeSingle();
    // A failed read is not "nobody owns it". Treating it that way would drop
    // an Apple notification with a 200 (never retried) and let /validate
    // skip the ownership check, so fail and let the caller retry.
    if (error) {
      this.logger.error(
        `owner lookup failed for store transaction ${transactionId}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'Could not check who owns this purchase; try again',
      );
    }
    return data?.user_id ?? null;
  }

  /**
   * Whether a GetDraft account exists. A purchase stamped with a deleted
   * account's id has no owner left, so the account now signed in on that
   * Apple ID may claim it.
   */
  async userExists(userId: string): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('users')
      .select('id')
      .eq('id', userId.toLowerCase())
      .maybeSingle();
    if (error) {
      this.logger.error(`user lookup failed for ${userId}: ${error.message}`);
      throw new ServiceUnavailableException(
        'Could not check this purchase; try again',
      );
    }
    return !!data;
  }

  /**
   * Apply an App Store Server Notification to the account that owns it.
   *
   * Every notification carries the subscription's latest transaction, and
   * that transaction already says whether it is in force (expiry, grace
   * period, revocation). So renewals, expiries, refunds and plan changes all
   * reduce to "write what the latest transaction says", and one code path
   * covers them all. Late and repeated deliveries are dropped by
   * applyStoreSubscription's ordering checks.
   */
  async applyAppleNotification(notification: AppleNotification): Promise<void> {
    const { notificationType, subtype, purchase, signedAt } = notification;
    const label = `${notificationType}${subtype ? `/${subtype}` : ''}`;

    if (IGNORED_NOTIFICATIONS.has(notificationType)) {
      this.logger.log(`[apple] ${label}: not about entitlement, ignored`);
      return;
    }
    if (!purchase?.ok || !purchase.productId || !purchase.transactionId) {
      this.logger.log(`[apple] ${label}: no transaction, nothing to apply`);
      return;
    }

    if (STORE_PACK_PRODUCTS[purchase.productId]) {
      // Refunded Drafts are usually spent already, so they are not clawed back.
      this.logger.log(
        `[apple] ${label} for pack ${purchase.productId} (${purchase.transactionId}), no action`,
      );
      return;
    }
    if (!STORE_PLAN_PRODUCTS[purchase.productId]) {
      this.logger.error(
        `[apple] ${label}: unknown product "${purchase.productId}"`,
      );
      return;
    }

    // Only the account that validated the purchase through /billing/validate
    // owns it. The appAccountToken is NOT used as a fallback: the buyer's
    // device chooses it, so a purchase stamped with someone else's user id
    // would let the buyer grant, and later downgrade, a victim's plan. A
    // notification that beats validation loses nothing: the app re-sends
    // unfinished transactions on launch, and the next notification applies.
    const userId = await this.ownerOfStoreSubscription(purchase.transactionId);
    if (!userId) {
      this.logger.warn(
        `[apple] ${label}: no account has validated transaction ${purchase.transactionId}, not applied`,
      );
      return;
    }

    const result = await this.applyStoreSubscription({
      userId,
      store: 'apple',
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      periodStart: purchase.purchasedAt ?? null,
      periodEnd: purchase.expiresAt ?? null,
      active: purchase.active !== false,
      signedAt: signedAt ?? purchase.signedAt ?? null,
    });
    if (!result.applied) {
      this.logger.log(
        `[apple] ${label} for ${purchase.transactionId}: not applied (${result.reason})`,
      );
    }
  }

  /**
   * Grant, renew or end a subscription bought in a store.
   *
   * Store data arrives late, out of order, repeated, and sometimes replayed
   * by the user, and the Stripe path writes the same row. So a write is
   * skipped when:
   *   - it was signed before the state already stored (`stale`);
   *   - it ends a subscription that is no longer the account's current one
   *     (`not_current`), or describes a period older than the stored one
   *     (`older_period`) -- refunding January must not downgrade someone who
   *     paid for February;
   *   - it grants a plan while another one is in force: a Stripe plan
   *     (`stripe`) or a different store subscription (`other_store`).
   *     Overwriting either would bill the user twice for one plan.
   */
  async applyStoreSubscription(params: {
    userId: string;
    store: Store;
    productId: string;
    transactionId: string;
    periodStart: string | null;
    periodEnd: string | null;
    active: boolean;
    /** When the store signed this state; null for Google, which has none. */
    signedAt?: string | null;
  }): Promise<StoreSubscriptionResult> {
    const { userId, store, productId, transactionId, periodStart, periodEnd } =
      params;
    const signedAt = params.signedAt ?? null;
    const supabase = this.supabaseService.getAdminClient();

    const planId = STORE_PLAN_PRODUCTS[productId];
    if (!planId) {
      // An unknown product means the stores and this map have diverged. Loud,
      // because silently ignoring it means a paying user gets nothing.
      this.logger.error(
        `unknown store product "${productId}" (${store}) for user ${userId}`,
      );
      throw new BadRequestException(`Unknown product: ${productId}`);
    }

    const { data: row, error: readErr } = await supabase
      .from('subscriptions')
      .select(
        'plan_id, status, store, store_transaction_id, stripe_subscription_id, store_signed_at, current_period_end',
      )
      .eq('user_id', userId)
      .maybeSingle<SubscriptionRow>();
    if (readErr || !row) {
      this.logger.error(
        `subscription read failed for ${userId}: ${readErr?.message ?? 'no row'}`,
      );
      throw new ServiceUnavailableException(
        'Could not apply the subscription; try again',
      );
    }

    const paid = !!row.plan_id && row.plan_id !== String(PlanId.BASIC);
    const current =
      row.store !== 'stripe' && row.store_transaction_id === transactionId;
    const unchanged = (
      reason: StoreSubscriptionResult['reason'],
    ): StoreSubscriptionResult => ({
      plan_id: row.plan_id ?? PlanId.BASIC,
      applied: false,
      reason,
      current,
    });

    if (params.active) {
      const stripeInForce =
        paid &&
        row.store === 'stripe' &&
        !!row.stripe_subscription_id &&
        ['active', 'trialing', 'past_due'].includes(row.status ?? '');
      if (stripeInForce) return unchanged('stripe');
      const otherStoreInForce =
        paid &&
        row.status === 'active' &&
        (row.store === 'apple' || row.store === 'google') &&
        !!row.store_transaction_id &&
        row.store_transaction_id !== transactionId;
      if (otherStoreInForce) return unchanged('other_store');
    } else if (!current) {
      return unchanged('not_current');
    }

    if (
      current &&
      periodEnd &&
      row.current_period_end &&
      new Date(periodEnd).getTime() < new Date(row.current_period_end).getTime()
    ) {
      return unchanged('older_period');
    }

    // Expiry, cancellation or refund: drop to the free tier rather than
    // deleting the row, so history and bonus_swipes survive.
    const effectivePlan = params.active ? planId : PlanId.BASIC;
    const swipeLimit = PLAN_SWIPE_LIMITS[effectivePlan] ?? 20;

    const update: Record<string, unknown> = {
      plan_id: effectivePlan,
      status: params.active ? 'active' : 'canceled',
      store,
      store_product_id: productId,
      store_transaction_id: transactionId,
      daily_swipe_limit: swipeLimit,
      current_period_start: periodStart,
      current_period_end: periodEnd,
    };
    if (signedAt) update.store_signed_at = signedAt;
    if (params.active) {
      // No Stripe plan is in force (checked above), so drop the link to any
      // lapsed one: its later customer.subscription.deleted must not find
      // this row and reset a store subscriber to Basic.
      update.stripe_subscription_id = null;
      update.stripe_price_id = null;
    }

    // The ordering check sits in the UPDATE itself, so two deliveries racing
    // cannot both pass it.
    let query = supabase
      .from('subscriptions')
      .update(update)
      .eq('user_id', userId);
    if (signedAt) {
      query = query.or(
        `store_signed_at.is.null,store_signed_at.lt."${signedAt}"`,
      );
    }
    const { data: written, error } = await query.select('user_id');
    if (error) {
      this.logger.error(
        `subscription update failed for ${userId}: ${error.message}`,
      );
      throw new ServiceUnavailableException(
        'Could not apply the subscription; try again',
      );
    }
    if (!written?.length) return unchanged('stale');

    const userUpdate: Record<string, unknown> = { plan_id: effectivePlan };
    if (params.active) userUpdate.stripe_subscription_id = null;
    await supabase.from('users').update(userUpdate).eq('id', userId);

    this.logger.log(
      `[${store}] user ${userId} -> plan ${effectivePlan} (${productId})`,
    );
    return { plan_id: effectivePlan, applied: true, current: true };
  }

  /**
   * Credit a Draft pack bought in a store.
   *
   * credit_store_pack (migration 049) records the purchase and adds the
   * Drafts in one transaction, keyed on the store transaction id, so a retry
   * is a no-op and two packs credited at once both count. Any failure throws
   * a 5xx: the app then leaves the transaction unfinished and the store
   * offers it again, instead of the user paying for Drafts never credited.
   */
  async creditStorePack(params: {
    userId: string;
    store: Store;
    productId: string;
    transactionId: string;
    amountCents?: number;
  }): Promise<{ credited: boolean; duplicate: boolean; bonus_swipes: number }> {
    const { userId, store, productId, transactionId } = params;

    const swipes = STORE_PACK_PRODUCTS[productId];
    if (!swipes) {
      this.logger.error(
        `unknown store pack "${productId}" (${store}) for user ${userId}`,
      );
      throw new BadRequestException(`Unknown product: ${productId}`);
    }

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('credit_store_pack', {
        p_user_id: userId,
        p_store: store,
        p_transaction_id: transactionId,
        p_pack_id: productId,
        p_swipes: swipes,
        p_amount_cents: params.amountCents ?? 0,
      });
    if (error || !data) {
      this.logger.error(
        `pack credit failed for ${userId} (${transactionId}): ${error?.message ?? 'no result'}`,
      );
      throw new ServiceUnavailableException(
        'Could not record the purchase; try again',
      );
    }

    const result = data as { credited: boolean; bonus_swipes: number };
    this.logger.log(
      result.credited
        ? `[${store}] user ${userId} +${swipes} Drafts (${productId}) -> ${result.bonus_swipes}`
        : `[${store}] pack ${transactionId} already credited, ignored`,
    );
    return {
      credited: result.credited,
      duplicate: !result.credited,
      bonus_swipes: result.bonus_swipes,
    };
  }
}
