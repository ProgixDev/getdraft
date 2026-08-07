-- ============================================
-- Migration 032: Signup role whitelist + lock direct client reads
-- ============================================
--
-- !! APPLY 033 IN THE SAME SESSION, IMMEDIATELY AFTER THIS FILE. !!
--
-- The handle_new_user() below reads the signup role from
-- raw_user_meta_data. The backend no longer writes it there -- it moved to
-- raw_app_meta_data, because user_metadata is self-writable with the anon
-- key (see the STILL OPEN note at the foot of this file, and 033).
-- Stopping here therefore makes EVERY new signup silently fall through to
-- the 'athlete' default: coaches, recruiters and parents would all be
-- created as athletes, locked out of their own side of the app, and only a
-- manual UPDATE on public.users would fix each one. 033 repoints the
-- trigger at raw_app_meta_data and closes that window.
--
-- Order: deploy the backend first, then 031 -> 032 -> 033 in one session,
-- no gap. See the footer of 033 for why that direction is the safe one.
--
-- Companion to 031 (which closed direct client WRITES). This closes the
-- two remaining doors that 031 does not touch: the signup trigger, and
-- direct client READS.
--
-- Same premise as 031, restated: the anon key ships inside the APK
-- (services/supabase.ts, baked from app.json.extra), so anyone can talk
-- to PostgREST and GoTrue directly. The app itself never does -- verified:
-- no supabase.from() / supabase.rpc() outside backend/, and
-- services/supabase.ts is used only for signInWithOAuth +
-- exchangeCodeForSession. All data flows through the NestJS backend on
-- the service_role key, which bypasses RLS and both grant sets below.
--
-- Idempotent: safe to re-run.

-- --------------------------------------------
-- 1. E1 -- UNAUTHENTICATED PRIVILEGE ESCALATION TO ADMIN (highest severity)
-- --------------------------------------------
-- handle_new_user() copied the role straight out of raw_user_meta_data:
--
--     COALESCE(NEW.raw_user_meta_data->>'role', 'athlete')   -- 015:35
--
-- raw_user_meta_data is entirely caller-controlled at signup, and the CHECK
-- on public.users (001:10) explicitly permits 'admin'. So:
--
--     supabase.auth.signUp({ options: { data: { role: 'admin' } } })
--
-- ...mints a full admin account with nothing but the public anon key. Admin
-- on this app means: ban/unban, decide KYC, APPROVE GUARDIAN LINKS for
-- minors, and dump all user PII.
--
-- This was safe only by accident -- the app never calls signUp (it goes
-- through the backend, and three separate guards reject 'admin':
-- signup.dto.ts:33, auth.service.ts:88, users.service.ts:123). None of
-- those are in the path of a direct GoTrue call.
--
-- Fix: whitelist in SQL. Self-signup can never produce a privileged role;
-- anything unrecognised falls back to 'athlete'. Real admins are promoted
-- afterwards by the backend over service_role, which does not run this path.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT;
  safe_role      TEXT;
BEGIN
  requested_role := NEW.raw_user_meta_data->>'role';

  -- Self-signup may only ever yield a non-privileged role. 'admin' is
  -- deliberately absent from this list; see the header.
  IF requested_role IN ('athlete', 'parent', 'coach', 'recruiter') THEN
    safe_role := requested_role;
  ELSE
    safe_role := 'athlete';
  END IF;

  INSERT INTO public.users (id, email, phone, role, name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    safe_role,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  );

  -- Auto-create subscription (basic/free)
  INSERT INTO public.subscriptions (user_id, plan_id, daily_swipe_limit)
  VALUES (NEW.id, 'basic', 10);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Follow the 023:39-47 precedent for every SECURITY DEFINER function.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------
-- 2. E3 / P6 -- PII AND BILLING-IDENTIFIER DISCLOSURE
-- --------------------------------------------
-- users_read_public (007:24-25) is `USING (is_banned = FALSE)` with no TO
-- clause and no column restriction; athlete_profiles_read (007:34-35) and
-- recruiter_profiles_read (007:41-42) are `USING (TRUE)`. With the shipped
-- anon key that is a bulk export of:
--
--   * every user's email, phone, latitude/longitude and kyc_status
--   * every athlete's date_of_birth  -- i.e. contact details, home
--     coordinates and birthdates OF MINORS
--   * every user's stripe_customer_id
--
-- The stripe_customer_id leak is the live billing hole (P6): read a
-- victim's cus_..., and because 031 now pins the column on write, the
-- remaining exposure is the read itself -- which is what makes targeting
-- possible in the first place.
--
-- Since no client ever reads Postgres directly, revoke SELECT wholesale
-- rather than trying to enumerate safe columns. Mirrors 031's approach.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(tablename)
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE SELECT ON %s FROM anon, authenticated', t);
  END LOOP;

  -- Views too (e.g. athlete_ranking_scores, already revoked by 029 -- this
  -- generalises it so a future view is not born readable).
  FOR t IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(viewname)
    FROM pg_views
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE SELECT ON %s FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Stop future tables/views from being born readable.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon, authenticated;

-- --------------------------------------------
-- 3. service_role keeps everything -- it is what the backend runs as.
-- --------------------------------------------
GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- ============================================
-- STILL OPEN after 031 + 032 (backend-side, not fixable in SQL):
--
--   E2/M4  JwtAuthGuard trusts auth.users.user_metadata for role /
--          is_banned / activation_status (jwt-auth.guard.ts:52,59,64;
--          chat.gateway.ts:55). user_metadata is self-writable via
--          supabase.auth.updateUser({data:...}); only app_metadata is
--          service_role-only. Must move the claims to app_metadata.
--
--   P7     Free-tier Draft quota resets DAILY instead of MONTHLY
--          (subscriptions.service.ts:189-197 vs types/index.ts:44-53).
--
--   E7     Two IDORs: GET /rankings/user/:id (rankings.service.ts:124-133)
--          and GET /stats/profile/:userId (stats.service.ts:106-149).
-- ============================================
