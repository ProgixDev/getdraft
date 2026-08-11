import { Platform } from 'react-native';

/**
 * Whether this build may sell digital goods inside the app.
 *
 * FALSE on Android, deliberately.
 *
 * Google Play's Payments policy requires digital goods -- subscription plans
 * and Draft packs both qualify -- to be sold through Google Play Billing.
 * This app charges with Stripe's native PaymentSheet, which is a fully
 * in-app third-party purchase flow, not a link-out. That is the case the
 * policy is aimed squarely at: grounds for rejection at review, and grounds
 * for removal if it slips through, which is considerably worse than being
 * rejected.
 *
 * The alternative was integrating Play Billing before launch: one to two
 * weeks of work plus roughly 15% of subscription revenue, and a second
 * source of truth for entitlements to keep in sync with Stripe. Shipping
 * Android without a purchase surface costs neither, and the web upgrade path
 * already exists.
 *
 * What the Android build still does:
 *   - shows every plan and its features, so users know what is on offer
 *   - shows the current plan, renewal date and status
 *   - lets an existing subscriber cancel or resume -- MANAGING a
 *     subscription is not SELLING one, and Play does not restrict it
 *
 * What it does not do: any button that starts a purchase.
 *
 * Note there is deliberately no "upgrade on our website" link either. The
 * policy restricts STEERING users toward an external payment flow, not just
 * processing the payment in-app, so a helpful link here would reintroduce
 * the exact problem this flag exists to avoid.
 *
 * Revisit when: Play Billing is integrated, or the policy position on
 * external payments changes in the markets this ships to.
 */
export const PURCHASES_ENABLED = Platform.OS !== 'android';
