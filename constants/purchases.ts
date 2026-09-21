/**
 * Whether the app may sell digital goods, and through what.
 *
 *   web     Stripe. Neither store's payment rules apply there.
 *   mobile  the store's own billing -- StoreKit on iOS, Play Billing on
 *           Android, integrated directly. No third party sits in the
 *           payment path.
 *
 * Apple requires StoreKit for digital goods and rejects third-party payment
 * sheets outright (guideline 3.1.1), so iOS sells NOTHING until store
 * billing is configured. That is the safe state for review: an app with no
 * purchase flow passes, an app with the wrong one fails.
 *
 * Android is the exception, knowingly. Until Play Billing is configured it
 * keeps Stripe's Payment Sheet -- the flow in the build Google reviewed and
 * accepted. Turning purchases off there would have shipped an update where
 * nobody on Android could upgrade, a revenue regression the client did not
 * ask for (2026-09-21). It is a known risk against Play's payments policy,
 * taken only until Play Billing is live; the store path replaces it
 * automatically the moment EXPO_PUBLIC_IAP_ENABLED=1 is set.
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
  Platform.OS === "web" || Platform.OS === "android" || BILLING_CONFIGURED;

/** True where a purchase goes through the store rather than Stripe. */
export const USES_STORE_BILLING = Platform.OS !== "web" && BILLING_CONFIGURED;
