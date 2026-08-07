-- ============================================
-- Migration 031: Lock direct client writes (P0 privilege escalation)
-- ============================================
--
-- THREAT
-- ------
-- The Expo app ships the Supabase URL + anon key in its bundle
-- (services/supabase.ts, baked from app.json.extra). An APK is a zip, so
-- both are effectively public. Any signed-in user can therefore talk to
-- PostgREST directly with their own JWT.
--
-- public.users holds role ('admin'), plan_id ('premium'), is_banned,
-- activation_status and kyc_status. Policy users_update_own
-- (007_rls_policies.sql:27-28) is:
--
--     FOR UPDATE USING (auth.uid() = id)     -- no WITH CHECK
--
-- and no migration ever revoked the default Supabase DML grants on
-- public.users from anon/authenticated. So a user could:
--
--     PATCH /rest/v1/users?id=eq.<self>
--     {"role":"admin","plan_id":"premium","activation_status":"active"}
--
-- ...self-granting admin, self-granting a paid plan, and -- worst -- a
-- minor self-clearing the guardian-consent gate.
--
-- The same shape applies to every other table whose rules live only in
-- the NestJS service layer: athlete_profiles (profile_views /
-- likes_received feed the Draft Score; date_of_birth drives the minor
-- gate), swipes (quota), guardian_links, kyc_sessions, matches, messages.
--
-- FIX
-- ---
-- The app never reads or writes tables directly -- verified: no
-- supabase.from() / supabase.rpc() anywhere outside backend/, and
-- services/supabase.ts is used only for signInWithOAuth +
-- exchangeCodeForSession. Every data path goes through the NestJS
-- backend, which uses the service_role key and BYPASSES RLS entirely.
--
-- So we revoke INSERT/UPDATE/DELETE on every public table from anon and
-- authenticated. This is invisible to the app and to the backend; it only
-- closes the direct-PostgREST door.
--
-- Follows the precedent already set by 023 (swipe_pack_purchases),
-- 024 (subscriptions) and 029 (athlete_ranking_scores) -- this generalises
-- those one-off locks to the whole schema.
--
-- Idempotent: safe to re-run.

-- 1. Revoke write access on every table in public from the two client roles.
--    A loop rather than a hand-written list so no table is missed today and
--    no future table is silently left open.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(tablename)
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE ON %s FROM anon, authenticated', t
    );
  END LOOP;
END $$;

-- 2. Stop future tables from being born writable. Supabase's stock setup
--    grants ALL on new public tables to anon/authenticated; drop the write
--    half of that default so migration 032+ starts locked.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;

-- 3. Belt-and-braces on the highest-value table: even if a grant is
--    reinstated by hand, pin the columns that decide authorisation so an
--    UPDATE cannot change them. WITH CHECK is what 007 omitted.
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role              = (SELECT u.role              FROM public.users u WHERE u.id = auth.uid())
    AND plan_id           IS NOT DISTINCT FROM (SELECT u.plan_id           FROM public.users u WHERE u.id = auth.uid())
    AND is_banned         IS NOT DISTINCT FROM (SELECT u.is_banned         FROM public.users u WHERE u.id = auth.uid())
    AND activation_status = (SELECT u.activation_status FROM public.users u WHERE u.id = auth.uid())
    AND kyc_status        = (SELECT u.kyc_status        FROM public.users u WHERE u.id = auth.uid())
  );

-- 4. service_role must keep full access -- it is what the backend runs as.
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

-- ============================================
-- NOTE: this migration closes the DATABASE half of the escalation only.
-- The other half is that JwtAuthGuard trusts auth.users.user_metadata for
-- role / is_banned / activation_status (jwt-auth.guard.ts:52,59,64 and
-- chat.gateway.ts:55). user_metadata is client-writable by design via
-- supabase.auth.updateUser({ data: ... }) -- Supabase only protects
-- app_metadata. That half is fixed in the backend, not here.
-- ============================================
