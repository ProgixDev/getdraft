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
   * Apply an App Store Server Notification to the account that owns it.
   *
   * Every notification carries the subscription's latest transaction, and
   * that transaction already says whether it is in force (expiry, grace
   * period, revocation). So renewals, expiries, refunds and plan changes all
   * reduce to "write what the latest transaction says", and one code path
   * covers them all.
   */
  async applyAppleNotification(notification: AppleNotification): Promise<void> {
    const { notificationType, subtype, purchase } = notification;
    const label = `${notificationType}${subtype ? `/${subtype}` : ''}`;

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

    await this.applyStoreSubscription({
      userId,
      store: 'apple',
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      periodStart: purchase.purchasedAt ?? null,
      periodEnd: purchase.expiresAt ?? null,
      active: purchase.active !== false,
    });
  }

  /**
   * Grant or renew a subscription bought in a store.
   *
   * Idempotent by store_transaction_id: stores retry notifications, and a
   * retry must not double-apply anything.
   */
  async applyStoreSubscription(params: {
    userId: string;
    store: Store;
    productId: string;
    transactionId: string;
    periodStart: string | null;
    periodEnd: string | null;
    active: boolean;
  }) {
    const { userId, store, productId, transactionId, periodStart, periodEnd } =
      params;
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

    // Expiry, cancellation or refund: drop to the free tier rather than
    // deleting the row, so history and bonus_swipes survive.
    const effectivePlan = params.active ? planId : PlanId.BASIC;
    const swipeLimit = PLAN_SWIPE_LIMITS[effectivePlan] ?? 20;

    const { error } = await supabase
      .from('subscriptions')
      .update({
        plan_id: effectivePlan,
        status: params.active ? 'active' : 'canceled',
        store,
        store_product_id: productId,
        store_transaction_id: transactionId,
        daily_swipe_limit: swipeLimit,
        current_period_start: periodStart,
        current_period_end: periodEnd,
      })
      .eq('user_id', userId);
    if (error) {
      this.logger.error(
        `subscription update failed for ${userId}: ${error.message}`,
      );
      throw new BadRequestException('Could not apply the subscription.');
    }

    await supabase
      .from('users')
      .update({ plan_id: effectivePlan })
      .eq('id', userId);

    this.logger.log(
      `[${store}] user ${userId} -> plan ${effectivePlan} (${productId})`,
    );
    return { plan_id: effectivePlan };
  }

  /**
   * Credit a Draft pack bought in a store.
   *
   * The ledger insert carries the idempotency: store_transaction_id is unique
   * (migration 043), so a duplicate notification hits 23505 and is ignored
   * BEFORE any Drafts are added. Crediting first and recording afterwards
   * would double-credit on a retry.
   */
  async creditStorePack(params: {
    userId: string;
    store: Store;
    productId: string;
    transactionId: string;
    amountCents?: number;
  }) {
    const { userId, store, productId, transactionId } = params;
    const supabase = this.supabaseService.getAdminClient();

    const swipes = STORE_PACK_PRODUCTS[productId];
    if (!swipes) {
      this.logger.error(
        `unknown store pack "${productId}" (${store}) for user ${userId}`,
      );
      throw new BadRequestException(`Unknown product: ${productId}`);
    }

    const { error: ledgerErr } = await supabase
      .from('swipe_pack_purchases')
      .insert({
        user_id: userId,
        store,
        store_transaction_id: transactionId,
        pack_id: productId,
        swipes_granted: swipes,
        amount_cents: params.amountCents ?? 0,
        status: 'granted',
        granted_at: new Date().toISOString(),
      });

    if (ledgerErr) {
      if ((ledgerErr as { code?: string }).code === '23505') {
        this.logger.log(
          `[${store}] duplicate pack notification ${transactionId} ignored`,
        );
        return { credited: false, duplicate: true };
      }
      this.logger.error(`pack ledger insert failed: ${ledgerErr.message}`);
      throw new BadRequestException('Could not record the purchase.');
    }

    // Read-modify-write rather than a raw increment: bonus_swipes has no
    // atomic helper, and this runs once per purchase behind the unique index
    // above, so the race window that would normally matter cannot be reached
    // twice for the same transaction.
    const { data: row } = await supabase
      .from('subscriptions')
      .select('bonus_swipes')
      .eq('user_id', userId)
      .maybeSingle();

    const next = (row?.bonus_swipes ?? 0) + swipes;
    await supabase
      .from('subscriptions')
      .update({ bonus_swipes: next })
      .eq('user_id', userId);

    this.logger.log(
      `[${store}] user ${userId} +${swipes} Drafts (${productId}) -> ${next}`,
    );
    return { credited: true, duplicate: false, bonus_swipes: next };
  }
}
