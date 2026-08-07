-- ============================================
-- Migration 033: Signup role comes from app_metadata
-- ============================================
--
-- Companion to the backend fix for E2/M4 (listed as STILL OPEN at the foot
-- of 032). Restated:
--
--   auth.users.raw_user_meta_data is SELF-WRITABLE by any signed-in user --
--   supabase.auth.updateUser({ data: {...} }) with the anon key that ships
--   inside the APK. Only raw_app_meta_data is service_role-only. So the
--   backend can no longer read role / is_banned / activation_status out of
--   user_metadata; those three claims now live in app_metadata and are
--   written exclusively by this backend.
--
-- That move breaks this trigger. 032 reads the role from
-- NEW.raw_user_meta_data; once the backend stops writing it there, every
-- signup would fall through to the 'athlete' default and coach / recruiter
-- / parent accounts would silently come out as athletes.
--
-- Fix: read NEW.raw_app_meta_data->>'role' instead. Everything else 032
-- established is kept deliberately:
--
--   * the role whitelist -- defence in depth. app_metadata is trustworthy,
--     but a trigger that can mint an 'admin' row is not something to leave
--     lying around one bug away from being reachable.
--   * SECURITY DEFINER + SET search_path = public, pg_temp.
--   * REVOKE EXECUTE (023:39-47 precedent).
--
-- `name` stays in raw_user_meta_data: it is a display value, not an authz
-- claim, and nothing is gated on it.
--
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  requested_role TEXT;
  safe_role      TEXT;
BEGIN
  -- app_metadata only. Never raw_user_meta_data -- see the header.
  requested_role := NEW.raw_app_meta_data->>'role';

  -- Self-signup may only ever yield a non-privileged role. 'admin' is
  -- deliberately absent from this list; see 032.
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

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------
-- Backfill the claims for accounts minted before this change
-- --------------------------------------------
-- JwtAuthGuard falls back to public.users (over service_role) whenever a
-- claim is missing from app_metadata, and repairs the metadata on the way
-- out -- so existing accounts keep working either way. This backfill just
-- saves them that one-off round trip, and makes `SELECT raw_app_meta_data`
-- an honest picture of who is banned.
--
-- public.users is the authoritative source for all three columns.
-- Wrapped so a role without UPDATE on auth.users (self-hosted / restricted
-- setups) skips the backfill instead of aborting the whole migration.
DO $$
BEGIN
  UPDATE auth.users u
  SET raw_app_meta_data =
        COALESCE(u.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'role', p.role,
             'is_banned', COALESCE(p.is_banned, FALSE),
             'activation_status', COALESCE(p.activation_status, 'active')
           )
  FROM public.users p
  WHERE p.id = u.id;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'app_metadata backfill skipped (no UPDATE on auth.users); JwtAuthGuard will repair each account on first request';
END $$;

-- ============================================
-- Closed in the same batch as this migration, in application code:
--
--   P7     Free-tier Draft quota reset DAILY instead of MONTHLY. The
--          duplicate reset in subscriptions.service.ts was removed; the
--          only writer is now DiscoverService.getSwipesRemaining.
--   P10    Lost update when two swipe-pack credits raced; now a
--          compare-and-swap on bonus_swipes.
--   E7     Two IDORs: GET /rankings/user/:id and GET /stats/profile/:userId
--          now narrow the response for non-owners.
--   E2/M4  The claim move itself -- common/utils/authz-claims.ts, with
--          writeAuthzClaims() as the single writer for all three claims.
--
-- Nothing from the audit's launch-blocker set is left open once
-- 031 + 032 + 033 are applied and the backend is redeployed.
--
-- ORDER OF OPERATIONS: DEPLOY THE BACKEND FIRST, then apply 031 -> 032 ->
-- 033 together.
--
-- That direction has no broken window. The new backend calls
-- ensureProfileRole() after every signup (auth.service.ts:126 and :541),
-- which UPDATEs public.users.role explicitly -- so it is correct whether
-- the trigger is still the old raw_user_meta_data one or the new
-- raw_app_meta_data one. The old backend is NOT: it only writes the role
-- into raw_user_meta_data, so applying 033 while it is still running turns
-- every coach / recruiter / parent signup into an athlete until the deploy
-- lands. Backend first, migrations second.
-- ============================================
