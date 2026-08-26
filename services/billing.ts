import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type PurchasesPackage,
} from "react-native-purchases";

/**
 * Store billing — StoreKit on iOS, Play Billing on Android, via RevenueCat.
 *
 * Replaces the Stripe Payment Sheet on mobile. Apple requires StoreKit for
 * digital goods and rejects third-party payment sheets outright; Google's
 * Payments policy says the same about Play Billing. Stripe stays on web, where
 * neither rule applies.
 *
 * Entitlement is NOT granted from here. The app tells the store to charge, and
 * RevenueCat tells our backend server-to-server what was actually paid for. A
 * client claiming "I bought Pro" is a claim; a signed webhook from the party
 * that validated the receipt is evidence. After a purchase the app just
 * refreshes its subscription from our API.
 */

/** Product ids, matching App Store Connect and Play Console exactly. */
export const STORE_PRODUCTS = {
  starter: "starter_monthly",
  pro: "pro_monthly",
  drafts10: "drafts_10",
  drafts50: "drafts_50",
  drafts100: "drafts_100",
} as const;

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

/**
 * True once a key exists for this platform. Everything below no-ops when it is
 * false, so a build without keys behaves exactly like the current one rather
 * than crashing at launch.
 */
export const BILLING_CONFIGURED =
  Platform.OS === "ios" ? !!IOS_KEY : Platform.OS === "android" ? !!ANDROID_KEY : false;

let configured = false;

/** Safe to call more than once; only the first call configures the SDK. */
export function initBilling() {
  if (configured || !BILLING_CONFIGURED) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({
    apiKey: Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY,
  });
  configured = true;
}

/**
 * Tie purchases to our own user id.
 *
 * This is what makes the webhook usable: RevenueCat reports app_user_id back
 * to us, so the backend knows who paid without any mapping table. Call it
 * after sign-in, and on app start for an already-signed-in user.
 */
export async function identifyForBilling(userId: string) {
  if (!BILLING_CONFIGURED || !userId) return;
  initBilling();
  try {
    await Purchases.logIn(userId);
  } catch {
    // Non-fatal: billing being unavailable must never block sign-in.
  }
}

/** Call on sign-out so the next user on this device starts clean. */
export async function resetBilling() {
  if (!BILLING_CONFIGURED) return;
  try {
    await Purchases.logOut();
  } catch {
    // ignore
  }
}

/**
 * Fetch what the store will actually sell, so prices shown are the real
 * localised ones rather than hard-coded dollars.
 */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!BILLING_CONFIGURED) return [];
  initBilling();
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export type PurchaseResult =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Buy a product by its store id.
 *
 * Cancellation is a normal outcome, not an error — the caller shows nothing
 * and simply stops its spinner.
 */
export async function purchaseProduct(
  productId: string,
): Promise<PurchaseResult> {
  if (!BILLING_CONFIGURED) {
    return { status: "error", message: "Purchases are not available yet." };
  }
  initBilling();
  try {
    const packages = await getOfferings();
    const match = packages.find(
      (p) => p.product.identifier === productId,
    );
    if (match) {
      await Purchases.purchasePackage(match);
    } else {
      // Not in the current offering — buy the product directly. Keeps Draft
      // packs working without needing them in an offering.
      const products = await Purchases.getProducts([productId]);
      if (!products.length) {
        return { status: "error", message: "This item is unavailable." };
      }
      await Purchases.purchaseStoreProduct(products[0]);
    }
    return { status: "purchased" };
  } catch (err: any) {
    if (err?.userCancelled) return { status: "cancelled" };
    return {
      status: "error",
      message: err?.message ?? "The purchase could not be completed.",
    };
  }
}

/**
 * Restore previous purchases.
 *
 * Apple requires a visible restore path for any app selling non-consumables or
 * subscriptions, and rejects apps without one.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!BILLING_CONFIGURED) return false;
  initBilling();
  try {
    const info = await Purchases.restorePurchases();
    return Object.keys(info.entitlements.active).length > 0;
  } catch {
    return false;
  }
}
