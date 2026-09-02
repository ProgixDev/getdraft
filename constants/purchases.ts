/**
 * Whether the app may sell digital goods, and through what.
 *
 *   web     Stripe. Neither store's payment rules apply there.
 *   mobile  the store's own billing -- StoreKit on iOS, Play Billing on
 *           Android, integrated directly. No third party sits in the
 *           payment path.
 *
 * Stripe's Payment Sheet is no longer used on mobile at all. Apple requires
 * StoreKit for digital goods and rejects third-party payment sheets outright;
 * Google's Payments policy says the same about Play Billing. Shipping Stripe
 * on Android was a known, accepted risk -- it is no longer taken.
 *
 * WHILE THE KEYS ARE MISSING both mobile platforms sell nothing. That is
 * deliberate and is the safe state: an app with no purchase flow passes both
 * reviews, whereas an app with the wrong purchase flow fails them. Adding the
 * EXPO_PUBLIC_IAP_ENABLED=1 turns purchasing on with no code change.
 *
 * Every screen that can start a purchase checks this:
 *   - app/subscription.tsx          plan upgrades, "Buy more Drafts"
 *   - app/buy-swipes.tsx            redirects out, so a deep link cannot
 *                                   reach a purchase screen
 *   - components/auth/AuthScreen    the plan step at the end of signup, which
 *                                   previously bypassed this flag entirely
 *                                   and could open Stripe on iOS
 */
import { Platform } from "react-native";
import { BILLING_CONFIGURED } from "@/services/billing";

export const PURCHASES_ENABLED =
  Platform.OS === "web" || BILLING_CONFIGURED;

/** True where a purchase goes through the store rather than Stripe. */
export const USES_STORE_BILLING = Platform.OS !== "web" && BILLING_CONFIGURED;
