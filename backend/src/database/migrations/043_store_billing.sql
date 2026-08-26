-- 043_store_billing.sql
--
-- Makes room for purchases made through the App Store and Google Play
-- alongside the existing Stripe ones.
--
-- Both billing tables were shaped around Stripe: subscriptions keys off
-- stripe_subscription_id, and swipe_pack_purchases uses
-- stripe_payment_intent_id as its NOT NULL unique idempotency key. A purchase
-- made through StoreKit or Play Billing has neither, so it could not be
-- recorded at all.
--
-- Why store purchases are needed: Apple requires StoreKit for digital goods
-- and rejects third-party payment sheets outright, and Google's Payments
-- policy says the same about Play Billing. Stripe stays for web, where both
-- rules are irrelevant.
--
-- The design keeps one row per user in `subscriptions` regardless of where the
-- purchase happened, so every entitlement check (PLAN_SWIPE_LIMITS, Super
-- Draft caps, the rankings view) keeps reading exactly one place and needs no
-- changes.

-- ---------------------------------------------------------------- subscriptions

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS store TEXT NOT NULL DEFAULT 'stripe'
    CHECK (store IN ('stripe', 'apple', 'google')),
  -- RevenueCat's app_user_id / original transaction id. Null for Stripe rows,
  -- which continue to use stripe_subscription_id.
  ADD COLUMN IF NOT EXISTS store_transaction_id TEXT,
  -- Product id as the store knows it (starter_monthly, pro_monthly). Kept so a
  -- support question can be answered without calling the store's API.
  ADD COLUMN IF NOT EXISTS store_product_id TEXT;

-- A store subscription must be unique, the same way stripe_subscription_id is.
-- Partial, because Stripe rows leave it null and NULLs would otherwise collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_store_txn
  ON public.subscriptions (store_transaction_id)
  WHERE store_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.store IS
  'Where the subscription was bought: stripe (web), apple (StoreKit) or '
  'google (Play Billing). See migration 043.';

-- --------------------------------------------------------- swipe_pack_purchases

-- The Stripe payment intent is no longer the only possible idempotency key, so
-- it can be null for a store purchase. Existing rows are unaffected: they all
-- have one, and the UNIQUE constraint on it stays.
ALTER TABLE public.swipe_pack_purchases
  ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;

ALTER TABLE public.swipe_pack_purchases
  ADD COLUMN IF NOT EXISTS store TEXT NOT NULL DEFAULT 'stripe'
    CHECK (store IN ('stripe', 'apple', 'google')),
  ADD COLUMN IF NOT EXISTS store_transaction_id TEXT;

-- Same idempotency guarantee the Stripe path has. A store can and does deliver
-- the same purchase notification more than once; without this, a retry would
-- credit the Drafts twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_swipe_pack_store_txn
  ON public.swipe_pack_purchases (store_transaction_id)
  WHERE store_transaction_id IS NOT NULL;

-- A row must be identifiable by exactly one of the two keys, so neither path
-- can write an unidentifiable purchase.
ALTER TABLE public.swipe_pack_purchases
  DROP CONSTRAINT IF EXISTS swipe_pack_purchases_has_a_key;
ALTER TABLE public.swipe_pack_purchases
  ADD CONSTRAINT swipe_pack_purchases_has_a_key
  CHECK (
    (stripe_payment_intent_id IS NOT NULL AND store = 'stripe')
    OR (store_transaction_id IS NOT NULL AND store IN ('apple', 'google'))
  );

COMMENT ON TABLE public.swipe_pack_purchases IS
  'Ledger of Draft-pack purchases, from Stripe (web) or the App Store / Play '
  'Billing. One of stripe_payment_intent_id or store_transaction_id is always '
  'set, and both are unique -- that is what makes crediting idempotent when a '
  'payment provider retries a notification. See migrations 017 and 043.';
