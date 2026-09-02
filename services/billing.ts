import { Platform } from "react-native";
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  finishTransaction,
  getAvailablePurchases,
  type ProductOrSubscription,
  type Purchase,
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
  drafts10: "drafts_10",
  drafts50: "drafts_50",
  drafts100: "drafts_100",
} as const;

export const SUBSCRIPTION_IDS = [
  STORE_PRODUCTS.starter,
  STORE_PRODUCTS.pro,
];
export const CONSUMABLE_IDS = [
  STORE_PRODUCTS.drafts10,
  STORE_PRODUCTS.drafts50,
  STORE_PRODUCTS.drafts100,
];

/**
 * Whether in-app purchasing is available on this build.
 *
 * Off on web (Stripe handles that) and gated behind a flag so a build can ship
 * with purchasing disabled — which is what both stores are happiest reviewing
 * while the products are still being set up.
 */
export const BILLING_CONFIGURED =
  Platform.OS !== "web" &&
  process.env.EXPO_PUBLIC_IAP_ENABLED === "1";

let connected = false;

/** Idempotent; safe to call from several screens. */
export async function initBilling(): Promise<boolean> {
  if (!BILLING_CONFIGURED) return false;
  if (connected) return true;
  try {
    await initConnection();
    connected = true;
    return true;
  } catch {
    return false;
  }
}

export async function closeBilling() {
  if (!connected) return;
  try {
    await endConnection();
  } catch {
    // ignore
  }
  connected = false;
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

/**
 * Send a receipt to our backend for validation.
 *
 * Returns true only if the server confirmed the purchase with Apple/Google and
 * granted the entitlement. The caller uses that to decide whether it is safe
 * to finish the transaction.
 */
async function validateWithServer(purchase: Purchase): Promise<boolean> {
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
  return !!(data?.data?.granted ?? data?.granted);
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

  const isSubscription = SUBSCRIPTION_IDS.includes(productId as any);

  try {
    // v16 takes per-platform request props and an explicit type. Subscriptions
    // and one-off products go through the same call.
    const result: any = await requestPurchase({
      request: {
        apple: { sku: productId },
        google: { skus: [productId] },
      },
      type: isSubscription ? "subs" : "in-app",
    } as any);

    const purchase: Purchase | undefined = Array.isArray(result)
      ? result[0]
      : result;
    if (!purchase) {
      return { status: "error", message: "No receipt was returned." };
    }

    const granted = await validateWithServer(purchase);
    if (!granted) {
      // Deliberately not finished: leaving it pending means the store will
      // hand it back on next launch, so a server outage does not cost the
      // user what they paid for.
      return {
        status: "error",
        message:
          "Payment received, but we could not confirm it yet. It will be applied shortly.",
      };
    }

    // Consumables are consumed so they can be bought again; subscriptions are
    // acknowledged, which Google requires within 3 days or it auto-refunds.
    await finishTransaction({ purchase, isConsumable: !isSubscription });
    return { status: "purchased" };
  } catch (err: any) {
    const code = err?.code ?? "";
    if (code === "E_USER_CANCELLED" || code === "E_DEFERRED_PAYMENT") {
      return { status: "cancelled" };
    }
    return {
      status: "error",
      message: err?.message ?? "The purchase could not be completed.",
    };
  }
}

/**
 * Validate anything the store still considers unfinished, and finish it.
 *
 * This is both the "Restore purchases" button Apple requires in any app
 * selling subscriptions, and the recovery path for a purchase that was paid
 * for but never validated -- the app was killed, the network dropped, the
 * server was briefly down. Those transactions stay in the store's queue
 * precisely so they can be picked up later, which only works because
 * purchaseProduct deliberately does not finish an unvalidated purchase.
 *
 * Returns how many were successfully granted.
 */
export async function restorePurchases(): Promise<number> {
  if (!(await initBilling())) return 0;
  try {
    const purchases = await getAvailablePurchases();
    let restored = 0;
    for (const purchase of purchases) {
      try {
        if (!(await validateWithServer(purchase))) continue;
        restored += 1;
        const isSubscription = SUBSCRIPTION_IDS.includes(
          purchase.productId as any,
        );
        await finishTransaction({ purchase, isConsumable: !isSubscription });
      } catch {
        // Keep going: one bad receipt must not abandon the rest, and anything
        // left unfinished will simply be offered again next launch.
      }
    }
    return restored;
  } catch {
    return 0;
  }
}
