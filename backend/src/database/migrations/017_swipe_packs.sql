-- ============================================
-- Migration 017: Swipe packs (one-off top-ups)
-- (ported from reference 014_swipe_packs.sql)
-- ============================================
-- bonus_swipes is a non-resetting pool that the user buys via
-- one-off Stripe PaymentIntents (see /api/subscriptions/swipe-pack).
-- The daily reset job leaves it alone — it carries over between
-- days and is only decremented when the user runs out of their
-- daily_swipe_limit and starts dipping into the pool.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS bonus_swipes INTEGER NOT NULL DEFAULT 0;

-- Audit table so we can show purchase history and recover from
-- duplicate webhook fires (we treat payment_intent.id as idempotent).
CREATE TABLE IF NOT EXISTS public.swipe_pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  pack_id TEXT NOT NULL,
  swipes_granted INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  granted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS swipe_pack_purchases_user_idx
  ON public.swipe_pack_purchases (user_id, created_at DESC);
