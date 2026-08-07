-- ============================================
-- Migration 037: public_users view (closes E3 properly)
-- ============================================
--
-- `users_read_public` was `FOR SELECT USING (is_banned = false)` granted to
-- PUBLIC -- every column of every non-banned account: email, phone,
-- date-of-birth-adjacent fields, stripe_customer_id, stripe_subscription_id,
-- kyc_status, and latitude/longitude.
--
-- 032 revoked the table grant, so it is unreachable today. But the
-- Supabase-only migration exists precisely to give clients direct read
-- access again, and restoring a grant against that policy would reopen the
-- hole in one line. Replace the policy with a projection that CANNOT
-- express those columns.
--
-- latitude / longitude are the ones worth being explicit about. This
-- product's users include minors, and precise coordinates are not a
-- privacy problem, they are a physical safety problem. Discover already
-- works from `location` and `country` (coarse, human-entered); the exact
-- pair exists for distance sorting, which is a server-side concern and
-- stays server-side.
--
-- Idempotent.

-- --------------------------------------------
-- 1. Drop the over-broad policy
-- --------------------------------------------
-- Nothing in the app depends on it: the backend runs as service_role and
-- bypasses RLS entirely, so this is invisible to current behaviour.
DROP POLICY IF EXISTS users_read_public ON public.users;

-- users_read_own stays -- a signed-in user reading their OWN full row is
-- correct, and it is already scoped to auth.uid() = id.

-- --------------------------------------------
-- 2. The public projection
-- --------------------------------------------
-- Deliberately NOT security_invoker: the view runs as its owner so it can
-- read public.users without the caller holding any grant on the base
-- table. That is the point -- the view becomes the only door, and it is a
-- door exactly eight columns wide.
--
-- Banned accounts are filtered here rather than left to a policy, so a
-- ban takes effect on read without depending on anything downstream.
CREATE OR REPLACE VIEW public.public_users AS
SELECT
  id,
  name,
  role,
  avatar_url,
  location,      -- coarse, user-entered ("Montreal, QC")
  country,
  is_onboarded,
  created_at
FROM public.users
WHERE is_banned = FALSE;

COMMENT ON VIEW public.public_users IS
  'Publicly readable projection of users. NEVER add email, phone, '
  'stripe_*, kyc_*, activation_status, preferences, plan_id, is_banned or '
  'latitude/longitude here -- see migration 037. Precise coordinates are a '
  'safety issue for minor accounts, not merely a privacy one.';

-- --------------------------------------------
-- 3. Grants
-- --------------------------------------------
-- authenticated only. anon is deliberately excluded: a signed-out visitor
-- has no reason to enumerate athlete profiles, and the anon key ships
-- inside the APK where anyone can extract it.
REVOKE ALL ON public.public_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_users TO authenticated;

-- ============================================
-- NOT DONE HERE, on purpose: the swipe-quota RPC.
--
-- A policy cannot count rows-per-month, so client-direct swipes will need
-- a SECURITY DEFINER insert that checks the allowance atomically. That
-- function must NOT be written yet: the allowance rules live in
-- DiscoverService.getSwipesRemaining today, and a second implementation
-- sitting dormant in SQL is a divergence waiting to happen -- exactly the
-- bug fixed earlier in this batch, where subscriptions.service.ts and
-- DiscoverService each ran their own reset and the free tier ended up ~30x
-- too generous.
--
-- Write it as part of the port that actually moves swipes off NestJS, so
-- there is never a moment with two live definitions of the quota.
-- ============================================
