/**
 * Whether the app may sell digital goods in-app.
 *
 * Currently TRUE on every platform: Android ships with the Stripe
 * PaymentSheet exactly as iOS and web do.
 *
 * ------------------------------------------------------------------
 * KNOWN RISK — read before changing this
 * ------------------------------------------------------------------
 * Subscription plans and Draft packs are digital goods, and this app
 * charges for them with Stripe's native PaymentSheet: a complete
 * third-party purchase flow running inside the app, not a link-out.
 * Google Play's Payments policy requires digital goods to go through
 * Google Play Billing, and Apple's equivalent requires StoreKit.
 *
 * So this is a deliberate, informed risk, not an oversight. The possible
 * outcomes are rejection at review, or -- worse -- approval followed by
 * removal later, once the app has real users.
 *
 * Worth noting the ground has been moving: the Epic v. Google injunction
 * and the EU DMA have forced both stores to permit alternative payment in
 * some jurisdictions. Whether that covers this app's markets was not
 * confirmed. If the listing is rejected on payments, check the current
 * policy before assuming this flag is the cause.
 *
 * ------------------------------------------------------------------
 * IF A STORE REJECTS THE APP OVER PAYMENTS
 * ------------------------------------------------------------------
 * Set this to `Platform.OS === 'web'` (or false) and resubmit. That
 * hides every purchase entry point while leaving plans visible and
 * cancel/resume working, which is compliant — managing an existing
 * subscription is not selling one. Users then upgrade on the web.
 *
 * The gating is already wired up and was tested working:
 *   - app/subscription.tsx  — per-plan "Upgrade" buttons, "Buy more Drafts"
 *   - app/buy-swipes.tsx    — redirects out, so a deep link cannot reach
 *                             the Stripe sheet
 *
 * Nothing else needs to change; it is one line here.
 *
 * The other route is integrating Play Billing / StoreKit properly: one to
 * two weeks, ~15% of subscription revenue, and a second source of truth
 * for entitlements to reconcile against Stripe.
 */
export const PURCHASES_ENABLED = true;
