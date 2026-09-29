import { Platform } from "react-native";
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  deepLinkToSubscriptions,
  ErrorCode,
  type EventSubscription,
  type ProductOrSubscription,
  type Purchase,
  type PurchaseError,
} from "react-native-iap";
import api from "./api";

/**
 * In-app purchases through StoreKit (iOS) and Play Billing (Android).
 *
 * No third party sits in the payment path. Apple requires StoreKit for digital
 * goods and rejects third-party payment sheets outright; Google's Payments
 * policy says the same about Play Billing. Stripe stays on web, where neither
 * rule applies.
 *
 * THE CLIENT NEVER GRANTS ITSELF ANYTHING. A purchase produces a receipt, the
 * receipt goes to our backend, and the backend asks Apple or Google whether it
 * is real before touching the user's plan. A device claiming "I bought Pro" is
 * a claim, and on a jailbroken phone a forgeable one.
 *
 * A purchase is only finished (consumed / acknowledged) AFTER our server has
 * validated it. Finishing first would mean a network failure at the wrong
 * moment loses the purchase permanently, with the user charged.
 */

/** Product ids, matching App Store Connect and Play Console exactly. */
export const STORE_PRODUCTS = {
  starter: "starter_monthly",
  pro: "pro_monthly",
  elite: "elite_monthly",
  drafts10: "drafts_10",
  drafts50: "drafts_50",
  drafts100: "drafts_100",
} as const;

export const SUBSCRIPTION_IDS = [
  STORE_PRODUCTS.starter,
  STORE_PRODUCTS.pro,
  STORE_PRODUCTS.elite,
];

/** Store product for a plan id; undefined for the free tier. */
export function storeProductForPlan(planId: string): string | undefined {
  switch (planId) {
    case "starter":
      return STORE_PRODUCTS.starter;
    case "pro":
      return STORE_PRODUCTS.pro;
    case "elite":
      return STORE_PRODUCTS.elite;
    default:
      return undefined;
  }
}
export const CONSUMABLE_IDS = [
  STORE_PRODUCTS.drafts10,
  STORE_PRODUCTS.drafts50,
  STORE_PRODUCTS.drafts100,
];

/**
 * Whether in-app purchasing is available on this build.
 *
 * Off on web (Stripe handles that) and gated behind a flag per store, so a
 * build can ship with purchasing disabled while the products are still being
 * set up. The flags are separate because turning on StoreKit must not move
 * Android off Stripe before Play Billing is configured.
 */
export const BILLING_CONFIGURED =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_IAP_IOS === "1"
    : Platform.OS === "android"
      ? process.env.EXPO_PUBLIC_IAP_ENABLED === "1"
      : false;

let connected = false;
let subscriptions: EventSubscription[] = [];

/**
 * The signed-in user, attached to every App Store purchase as its
 * appAccountToken. The server refuses a receipt carrying another account's
 * id, so one Apple ID cannot unlock several GetDraft accounts.
 */
let billingUserId: string | null = null;

export function setBillingUser(userId: string | null) {
  billingUserId = userId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Outcome = { purchase?: Purchase; error?: PurchaseError };

/** The purchase sheet currently open, waiting for the store's answer. */
let waiting: { productId: string; resolve: (o: Outcome) => void } | null =
  null;

/**
 * Idempotent; safe to call from several screens.
 *
 * The store reports purchases through listeners, not through the return value
 * of requestPurchase -- on iOS that value is always an empty list. The same
 * listener also receives purchases nobody is waiting for: a renewal, an
 * Ask to Buy approval, one interrupted by the app being killed. Those are
 * settled in the background.
 */
export async function initBilling(): Promise<boolean> {
  if (!BILLING_CONFIGURED) return false;
  if (connected) return true;
  try {
    await initConnection();
    connected = true;
    subscriptions = [
      purchaseUpdatedListener((purchase) => {
        if (waiting?.productId === purchase.productId) {
          const w = waiting;
          waiting = null;
          w.resolve({ purchase });
          return;
        }
        // Signed out: leave it unfinished for the next sign-in to pick up.
        if (!billingUserId) return;
        settle(purchase).catch(() => {});
      }),
      purchaseErrorListener((error) => {
        if (!waiting) return;
        if (error.productId && error.productId !== waiting.productId) return;
        const w = waiting;
        waiting = null;
        w.resolve({ error });
      }),
    ];
    return true;
  } catch {
    return false;
  }
}

export async function closeBilling() {
  if (!connected) return;
  subscriptions.forEach((s) => s.remove());
  subscriptions = [];
  try {
    await endConnection();
  } catch {
    // ignore
  }
  connected = false;
}

/** Apple's own screen for changing or cancelling an App Store subscription. */
export async function openManageSubscriptions() {
  await deepLinkToSubscriptions();
}

/** Store-localised subscription details — real prices, not hard-coded ones. */
export async function fetchSubscriptionProducts(): Promise<ProductOrSubscription[]> {
  if (!(await initBilling())) return [];
  try {
    return (await fetchProducts({ skus: SUBSCRIPTION_IDS, type: "subs" })) ?? [];
  } catch {
    return [];
  }
}

/** Store-localised Draft pack details. */
export async function fetchPacks(): Promise<ProductOrSubscription[]> {
  if (!(await initBilling())) return [];
  try {
    return (await fetchProducts({ skus: CONSUMABLE_IDS, type: "in-app" })) ?? [];
  } catch {
    return [];
  }
}

export type PurchaseResult =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

type Validation = { granted: boolean; ownedElsewhere: boolean; reason?: string };

/**
 * Send a receipt to our backend for validation.
 *
 * `granted` is true only if the server confirmed the purchase with
 * Apple/Google and applied it. The caller uses that to decide whether it is
 * safe to finish the transaction.
 */
async function validateWithServer(purchase: Purchase): Promise<Validation> {
  // purchaseToken is the unified receipt in v16: the StoreKit 2 JWS on iOS,
  // the Play purchase token on Android. The server knows which to verify from
  // the platform field.
  const payload = {
    platform: Platform.OS === "ios" ? ("ios" as const) : ("android" as const),
    productId: purchase.productId,
    transactionId: purchase.id ?? purchase.transactionId ?? "",
    purchaseToken: purchase.purchaseToken ?? "",
  };
  const { data } = await api.post("/billing/validate", payload);
  const body = data?.data ?? data ?? {};
  return {
    granted: !!body.granted,
    ownedElsewhere: !!body.ownedElsewhere,
    reason: body.reason,
  };
}

/**
 * Validate a purchase, then finish it.
 *
 * Finished only once the server has applied it, or when it already belongs to
 * another account (it is accounted for there, and leaving it open would
 * replay it on every launch). Anything else stays unfinished so the store
 * hands it back later and the user does not lose what they paid for.
 */
async function settle(purchase: Purchase): Promise<Validation> {
  const result = await validateWithServer(purchase);
  if (result.granted || result.ownedElsewhere) {
    const isSubscription = SUBSCRIPTION_IDS.includes(purchase.productId as any);
    // Consumables are consumed so they can be bought again; subscriptions are
    // acknowledged, which Google requires within 3 days or it auto-refunds.
    await finishTransaction({ purchase, isConsumable: !isSubscription });
  }
  return result;
}

function failure(error: { code?: string; message?: string }): PurchaseResult {
  if (
    error.code === ErrorCode.UserCancelled ||
    error.code === ErrorCode.DeferredPayment
  ) {
    return { status: "cancelled" };
  }
  return {
    status: "error",
    message: error.message || "The purchase could not be completed.",
  };
}

/**
 * Buy a product and have the server verify it.
 *
 * The order matters: purchase, validate, then finish. Finishing before the
 * server has confirmed would consume the transaction and leave no way to
 * recover it if validation failed.
 */
export async function purchaseProduct(
  productId: string,
): Promise<PurchaseResult> {
  if (!(await initBilling())) {
    return { status: "error", message: "Purchases are not available yet." };
  }
  if (waiting) {
    return { status: "error", message: "Another purchase is in progress." };
  }

  const isSubscription = SUBSCRIPTION_IDS.includes(productId as any);
  const outcome = new Promise<Outcome>((resolve) => {
    waiting = { productId, resolve };
  });

  try {
    await requestPurchase({
      request: {
        apple: {
          sku: productId,
          ...(billingUserId && UUID.test(billingUserId)
            ? { appAccountToken: billingUserId }
            : {}),
        },
        google: { skus: [productId] },
      },
      type: isSubscription ? "subs" : "in-app",
    } as any);
  } catch (err: any) {
    waiting = null;
    return failure(err ?? {});
  }

  const { purchase, error } = await outcome;
  if (error || !purchase) return failure(error ?? {});

  try {
    const result = await settle(purchase);
    if (result.granted) return { status: "purchased" };
    if (result.ownedElsewhere) {
      return {
        status: "error",
        message:
          result.reason ??
          "This purchase belongs to another GetDraft account on this Apple ID.",
      };
    }
  } catch {
    // Falls through: the purchase stays unfinished and is retried on launch.
  }
  return {
    status: "error",
    message:
      "Payment received, but we could not confirm it yet. It will be applied shortly.",
  };
}

export type RestoreResult = { restored: number; ownedElsewhere: number };

/**
 * Validate everything the store says this Apple ID owns or has left
 * unfinished, and finish what the server accepts.
 *
 * This is both the "Restore Purchases" button Apple requires in any app
 * selling subscriptions, and the recovery path for a purchase that was paid
 * for but never validated -- the app was killed, the network dropped, the
 * server was briefly down. Those transactions stay in the store's queue
 * precisely so they can be picked up later, which only works because
 * purchaseProduct deliberately does not finish an unvalidated purchase.
 */
export async function restorePurchases(): Promise<RestoreResult> {
  const result: RestoreResult = { restored: 0, ownedElsewhere: 0 };
  if (!(await initBilling())) return result;
  try {
    const purchases = await getAvailablePurchases();
    for (const purchase of purchases) {
      try {
        const r = await settle(purchase);
        if (r.granted) result.restored += 1;
        else if (r.ownedElsewhere) result.ownedElsewhere += 1;
      } catch {
        // Keep going: one bad receipt must not abandon the rest, and anything
        // left unfinished will simply be offered again next launch.
      }
    }
  } catch {
    // The store could not be reached; nothing was changed.
  }
  return result;
}
