-- ============================================
-- Migration 008: Audit constraints & indexes
-- Created during the Phase 0-6 backend audit.
-- Non-destructive: only adds constraints and indexes.
-- ============================================

-- 1. Defense-in-depth against self-swipe (the service blocks it too).
ALTER TABLE public.swipes
  DROP CONSTRAINT IF EXISTS swipes_no_self_swipe;
ALTER TABLE public.swipes
  ADD CONSTRAINT swipes_no_self_swipe CHECK (swiper_id <> swiped_id);

-- 2. CHECK on subscriptions.plan_id mirrors users.plan_id (consistency).
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_id_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_check
  CHECK (plan_id IN ('basic', 'starter', 'pro', 'premium'));

-- 3. Index for subscription lookup by Stripe subscription id (used in webhooks).
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- 4. Index for unique (viewer, viewed) profile-view dedup queries.
CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_viewed
  ON public.profile_views(viewer_id, viewed_id, created_at DESC);
