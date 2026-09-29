# In-app purchases: fixes before switching them on

**For:** Arselene (iOS lead), and your Claude Code.
**Status (2026-09-29):** iPhone purchases are still OFF: `EXPO_PUBLIC_IAP_ENABLED` / `EXPO_PUBLIC_IAP_IOS` are not set in any build. So nothing below can hurt a user today. **Every item in Part A must be fixed before any build ships with purchases switched on.**

These come from a multi-agent review of the billing commits `92905dc..28595b6`. Each finding was checked by a second agent that tried to disprove it, and most were reproduced against the real code.

---

## Part 0: what changed today (do not undo)

The review found that the hand-written Apple receipt check could be **forged by anyone, without an Apple account**. The attacker's text was parsed as PEM, so the signature was checked against the attacker's own key while the chain check saw Apple's real root. It was reachable through `/api/billing/validate` (any signed-in user could get Elite or unlimited Drafts) and through the public `/api/billing/apple/notifications` (anyone could grant or downgrade **any** user, Stripe subscribers included). The database showed it was not abused. It is fixed and live in `deaf9f7` + `29c9393`:

- **Apple's official library does all verification now.** `receipt-verifier.service.ts` uses `SignedDataVerifier` from `@apple/app-store-server-library` (3.1.0, exact version pinned). It pins Apple Root CA - G3 and checks the App Store OIDs on the leaf and intermediate, the dates, OCSP, the bundle id, the app id (`6802070784`) and the environment. **Never go back to parsing x5c by hand.**
- **Environments:** production is tried first, then sandbox. Sandbox has to be accepted because App Review buys in the sandbox against our production server. The side effect is that TestFlight testers get plans for free. `APPLE_ALLOW_SANDBOX=false` turns sandbox off.
- **Notifications no longer fall back to `appAccountToken`.** The buyer's device chooses that token, so a purchase stamped with a victim's id let the buyer rewrite the victim's plan. A notification now applies only to an account that validated that transaction through `/billing/validate`.
- **The notification route stays `@SkipThrottle()`.** Behind Railway's proxy, every caller shares one throttle bucket (see Part C), so a limit there would let anyone get Apple's real notifications refused. A `@MaxLength` cap bounds the work instead.
- **`ownerOfStoreSubscription` fails with a 503 on a database error** instead of returning "nobody owns it", so Apple and the app retry.
- **Tests:** `receipt-verifier.service.spec.ts` signs data under a throwaway Apple-like chain (`apple-test-chain.fixture.ts`). It proves real-shaped data passes, and that the forgery, developer-held certificates, foreign keys, wrong chain lengths, other apps and environment mismatches are refused.

**App Store Connect:** set **App Store Server Notifications, Version 2**, for both Production and Sandbox, to
`https://api.getdraft.net/api/billing/apple/notifications`

---

## Part A: must fix before purchases go on

### A1. Every Draft pack purchase fails to save (blocker)
- **Where:** `backend/src/modules/store-billing/store-billing.service.ts` (`creditStorePack`, the insert with `status: 'granted'`).
- **Problem:** migration `017_swipe_packs.sql:24` allows only `'pending' | 'succeeded' | 'failed'`. The insert violates the CHECK, so every App Store or Play pack returns "Could not record the purchase" and the buyer never gets the Drafts.
- **Fix:** write `'succeeded'`, the value the Stripe path already uses. If a separate value is really needed, add a migration that widens the CHECK. First confirm the live constraint in Supabase (project `icczjnsevyczfllsiamu`).

### A2. Pack crediting can lose Drafts (race, ignored errors)
- **Where:** `store-billing.service.ts` `creditStorePack` (ledger insert, then SELECT, then UPDATE of `bonus_swipes`).
- **Problem:**
  - (a) Two packs credited at once (two unfinished transactions replayed at launch, since `services/billing.ts` does not await `settle()`) both read the old balance, and one pack is lost.
  - (b) The ledger row is inserted as done before the credit, and the SELECT and UPDATE errors are ignored. A failed credit still returns `granted:true`, the app finishes the transaction, and every retry is treated as a duplicate: paid, got nothing. A failed SELECT even overwrites the balance downwards.
- **Fix:** do the ledger insert and `bonus_swipes = coalesce(bonus_swipes,0) + n` in **one Postgres function** called with `supabase.rpc` (atomic; raise if the user has no subscriptions row). On any error, throw a 5xx so the app leaves the transaction unfinished. Optionally also queue `settle()` calls one at a time in `services/billing.ts`.

### A3. A pack paid by one account is lost when another account signs in on the same Apple ID
- **Where:** `store-billing.controller.ts` (the appAccountToken mismatch branch) and `services/billing.ts` `settle()`.
- **Problem:** account A buys a pack, but validation fails (network or app killed). Account B signs in on the same iPad, StoreKit replays A's transaction, and the server answers `ownedElsewhere` without crediting anyone. `settle()` then **finishes** the consumable, so A's Drafts are gone for good.
- **Fix, both sides:**
  - **Server:** for packs only, when the token names another **existing** user, credit that user (`creditStorePack({ userId: token })`, idempotent on `store_transaction_id`), then return `ownedElsewhere`. Lowercase the token, and check for a refund first.
  - **Client:** in `settle()`, finish on `ownedElsewhere` only for subscriptions, never for consumables that were not credited.

### A4. "Restore Purchases" never finds an unfinished Draft pack on iOS
- **Where:** `services/billing.ts` `restorePurchases()` / `initBilling()`.
- **Problem:** `getAvailablePurchases()` reads `Transaction.currentEntitlements`, which never includes consumables. A pack that was paid for but not validated is not recovered by Restore, or by the restore at login. The launch-time replay can also arrive before `purchaseUpdatedListener` is registered (it is registered only after `await initConnection()`) and be dropped.
- **Fix:**
  - On iOS, also settle each transaction from `getPendingTransactionsIOS()` (that's `Transaction.unfinished`). Skip ids already returned by `getAvailablePurchases`.
  - Keep `onlyIncludeActiveItemsIOS` at its default. `Transaction.all` would bring back expired subscriptions and downgrade users.
  - Register the purchase listeners **before** `await initConnection()`.

### A5. A refunded user can get the plan back; late notifications overwrite newer state
- **Where:** `store-billing.controller.ts` `validate()`, `store-billing.service.ts` `applyAppleNotification` / `applyStoreSubscription`.
- **Problem:** a signed transaction is a snapshot.
  - (a) A user saves the JWS their app sends (proxy on their own phone), asks Apple for a refund, then re-sends the saved JWS to `/validate` and gets the plan back until the old expiry date, every month.
  - (b) Apple delivers notifications late and out of order, and retries after a deploy or an error. An old DID_RENEW after a REFUND restores access. An old EXPIRED after a resubscribe downgrades a paying user.
  - (c) REFUND, REFUND_DECLINED and CONSUMPTION_REQUEST carry the transaction of the period being refunded, not the latest one. Refunding January downgrades someone who paid for February.
- **Fix:**
  - Return `signedDate` (and `revocationDate`) from `ReceiptVerifierService.toPurchase`, and carry the envelope `signedDate` in `AppleNotification`.
  - Add a `store_signed_at` column (plus `store_revoked_at` if useful) to `subscriptions`. Have `applyStoreSubscription` update **only when the incoming signedDate is newer**, inside the UPDATE's WHERE (`store_signed_at is null or store_signed_at < $new`), on both paths.
  - Ignore CONSUMPTION_REQUEST and REFUND_DECLINED for entitlement. Skip any notification whose `expiresAt` is earlier than the stored `current_period_end`; use `>=` so a refund of the current period still downgrades.
  - Do **not** simply refuse `/validate` for canceled rows: a resubscribe keeps the same originalTransactionId.

### A6. Stripe and Apple overwrite each other on the same row
- **Where:** `store-billing.service.ts` `applyStoreSubscription`, `subscriptions.service.ts` `applyActiveSubscription` + checkout webhook, `app/subscription.tsx` `canBuy` (around line 305) and `boughtInStore` (around line 293).
- **Problem:**
  - A user with Apple Pro can buy Stripe Elite on Android or the web and gets billed twice. Apple notifications then overwrite, or drop to Basic, the Stripe plan.
  - `store` is never reset. An ex-Apple user who pays by Stripe sees "Manage in App Store" and cannot cancel Stripe in the app.
  - The reverse also happens: Stripe's `customer.subscription.deleted` sets an Apple subscriber to Basic.
- **Fix:**
  - `applyStoreSubscription` refuses to write when the row's current paid plan comes from somewhere else: an active `stripe_subscription_id`, or an active row with a different `store_transaction_id`. An inactive notification only downgrades if its transaction is the row's current one.
  - Set `store: 'stripe'` in the Stripe apply paths.
  - `createPaymentSheet` refuses when an active store subscription exists.
  - `canBuy` becomes symmetric, and `boughtInStore` is derived from an active non-Stripe entitlement, not from the sticky `store` column.

### A7. Cancelling the App Store sheet at signup shows an error
- **Where:** `components/auth/AuthScreen.tsx` (around lines 567 and 603).
- **Problem:** `purchaseProduct` returns `cancelled`, the code throws `Error("cancelled")`, and the catch only ignores Stripe's spelling `"Canceled"`. The user sees "Could not complete payment: cancelled", on the exact flow App Review records.
- **Fix:** treat `status === 'cancelled'` as a silent return (no throw), or match both spellings.

### A8. A deleted account's Apple subscription can never be claimed; Apple keeps charging
- **Where:** `store-billing.controller.ts` (token-mismatch branch), `users.service.ts` `deleteAccount`, `hooks/use-delete-account.ts`.
- **Problem:** A deletes their account and signs up again as B. Restore then says "belongs to another account" forever, while Apple renews monthly.
- **Fix:**
  - When the token names a user that **no longer exists**, fall through to the existing `ownerOfStoreSubscription` check and let B claim it.
  - When an Apple subscription is active, the delete-account flow must tell the user that Apple billing continues until they cancel it, with a button that calls `openManageSubscriptions()`. Apple's account-deletion rules ask for this.

---

## Part B: before Google Play Billing goes on (Android)

### B1. One Play subscription unlocks several accounts
- **Where:** `receipt-verifier.service.ts` `verifyGoogle` (`transactionId: data.latestOrderId`), `services/billing.ts` `requestPurchase`.
- **Problem:** `latestOrderId` changes on every renewal, so the ownership check misses the second account. Android purchases also carry no account binding.
- **Fix:**
  - Key Google subscriptions on the **purchase token**, following `linkedPurchaseToken` on upgrade or resubscribe. Do not use `latestSuccessfulOrderId`: it also changes on every renewal.
  - Send `google: { skus, obfuscatedAccountId: userId }` in the request (react-native-iap 16.4).
  - Read `externalAccountIdentifiers.obfuscatedExternalAccountId` (subscriptions) or `obfuscatedExternalAccountId` (products) on the server and return it as `appAccountToken`, so the same ownership check covers both stores.

### B2. Android plans never downgrade
- **Problem:** there is no Google RTDN (Pub/Sub) handler, and nothing expires store rows by `current_period_end`.
- **Fix:** add an RTDN endpoint, or at least a scheduled job (see C1).

---

## Part C: smaller, whenever convenient

- **C1. Expire stale store rows.** A daily job, or the plan readers, should treat an apple or google row whose `current_period_end` has passed as Basic. That way a missed notification never leaves a plan stuck.
- **C2. Tests that test the real thing.** `store-billing.controller.spec.ts` mocks `StoreBillingService`, so none of the crediting, idempotency or ownership logic is exercised. The pack bugs above reproduce against the real service with a fake database. Add service-level tests (a fake Supabase client is enough).
- **C3. CI deploy (`.github/workflows/deploy-backend.yml`):**
  - Run `npm --prefix backend ci && npm --prefix backend test` before `railway up`.
  - Health-check `/api/health/ready`, or assert `db: "up"` in the body. `/api/health` returns 200 even with the database down.
  - Restrict `workflow_dispatch` to `master`, so a feature branch cannot be deployed to production from the Actions tab.
- **C4. For your information (Achraf is handling it):** behind Railway's proxy the server sees every client as the same IP (Fastify has no `trustProxy`). So **every `@Throttle` limit is shared by all users**, including the 3-5 per minute OTP limits.

---

## How to verify when done
1. `node backend/node_modules/typescript/bin/tsc --noEmit -p backend/tsconfig.json` (the backend's own TS 5.9; the root TS 6 reports a bogus `baseUrl` deprecation).
2. `npm --prefix backend test`: all green, including new service-level tests for A1-A6.
3. TestFlight with a sandbox tester:
   - buy `starter_monthly`, then upgrade to `pro_monthly`;
   - buy `drafts_10` twice quickly;
   - kill the app mid-purchase, relaunch, and tap Restore;
   - sign in as a second account on the same device;
   - ask for a sandbox refund.

   Each time, check the `subscriptions` and `swipe_pack_purchases` rows in Supabase.
4. Only then set `EXPO_PUBLIC_IAP_ENABLED=1` (and `EXPO_PUBLIC_IAP_IOS=1`) in the production build profile.
