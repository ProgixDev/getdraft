-- ============================================
-- Migration 034: RLS authorization helpers
-- ============================================
--
-- First building block of the Supabase-only migration (audit Phase 2).
-- Every policy written from here on calls these instead of open-coding
-- the same subquery, so there is ONE place to reason about "who is the
-- caller and what are they allowed to be".
--
-- Apply AFTER 031 -> 032 -> 033. These functions are additive and change
-- no existing behaviour: nothing calls them yet, and the backend runs as
-- service_role, which bypasses RLS entirely. They are inert until the
-- first policy references them.
--
-- ------------------------------------------------------------------
-- WHY THESE READ public.users AND NOT THE JWT
-- ------------------------------------------------------------------
-- 033 puts role / is_banned / activation_status into app_metadata, and
-- GoTrue copies app_metadata into the access token -- so
-- auth.jwt()->'app_metadata'->>'role' works and costs no round trip.
-- It is also STALE BY UP TO ONE HOUR.
--
-- Supabase does not check access tokens against a revocation list. When
-- AdminService.banUser flips the flag and calls signOut(global), it kills
-- the REFRESH token; the access token already in the attacker's hands
-- stays cryptographically valid until it expires. The current backend is
-- not exposed to this because JwtAuthGuard calls getUser() and hits
-- GoTrue live on every request. A policy reading the JWT would not.
--
-- For a product whose users are minors, "banned user keeps full access
-- for up to an hour" and "minor's account reads as activated for up to
-- an hour after guardian consent is revoked" are not acceptable trades
-- for saving a subquery. So the gates read the authoritative columns.
--
-- The cost is bounded: STABLE means Postgres evaluates each one at most
-- once per query, not once per row, and every lookup is a primary-key
-- hit on public.users.
--
-- SECURITY DEFINER because 032 revoked client SELECT on public.users --
-- the caller cannot read the table directly, and must not be able to.
-- Each function is scoped to auth.uid(), so it can only ever answer a
-- question about the caller themselves. search_path is pinned per the
-- 023 precedent.
--
-- Idempotent: safe to re-run.

-- --------------------------------------------
-- actor_id() -- the calling user, or NULL when unauthenticated
-- --------------------------------------------
-- Thin alias for auth.uid(). Exists so policies read declaratively and
-- so there is a single seam if the identity source ever changes.
CREATE OR REPLACE FUNCTION public.actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid()
$$;

-- --------------------------------------------
-- is_admin()
-- --------------------------------------------
-- Admin is provisioned out of band (DB only) and is never self-assignable
-- -- 032/033 whitelist it out of the signup trigger and
-- UsersService.updateMe rejects it. Reading the live column means a
-- revoked admin loses access on the next statement, not on the next hour.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
$$;

-- --------------------------------------------
-- not_banned()
-- --------------------------------------------
-- Deliberately phrased as the positive assertion a policy wants to make,
-- so a policy reads `USING (public.not_banned() AND ...)` and a forgotten
-- NOT cannot silently invert the gate.
--
-- NULL is_banned counts as banned -- an unreadable ban state is never
-- safe to treat as clear.
CREATE OR REPLACE FUNCTION public.not_banned()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND COALESCE(u.is_banned, TRUE) = FALSE
  )
$$;

-- --------------------------------------------
-- is_activated()
-- --------------------------------------------
-- The COPPA/guardian gate, mirroring ActivationGuard. 'pending_guardian'
-- = under-18 athlete whose guardian has not consented yet; they may read
-- their own account and complete the guardian flow, nothing else.
--
-- A missing row reads as NOT activated. The backend's ActivationGuard
-- defaults the other way (absent => 'active') because it is covering
-- accounts minted before migration 022, but a policy has no such history
-- to protect and must fail closed.
CREATE OR REPLACE FUNCTION public.is_activated()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND COALESCE(u.activation_status, 'pending_guardian') = 'active'
  )
$$;

-- --------------------------------------------
-- can_act()
-- --------------------------------------------
-- The composite every feature-table policy should use: signed in, not
-- banned, past the guardian gate. Admins are NOT auto-included -- an
-- admin acting on their own rows is still a normal actor, and admin
-- override is an explicit `OR public.is_admin()` at each call site so it
-- is visible in the policy text rather than hidden in a helper.
CREATE OR REPLACE FUNCTION public.can_act()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.not_banned()
     AND public.is_activated()
$$;

-- --------------------------------------------
-- Grants
-- --------------------------------------------
-- Policies evaluate as the calling role, so anon/authenticated need
-- EXECUTE. Safe: each function answers only about auth.uid() and returns
-- a boolean or the caller's own id -- none of them can be used to read
-- another user's row.
GRANT EXECUTE ON FUNCTION public.actor_id()     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.not_banned()   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_activated() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_act()      TO anon, authenticated;

-- ============================================
-- NEXT (audit Phase 2, still open):
--   * Postgres token-bucket rate limiter -- must exist before ANY auth
--     or money endpoint moves off NestJS (audit 2.5: there is no
--     Supabase equivalent for per-route throttling).
--   * pgTAP harness + the 8 attack tests.
--   * The three latent escalations 007 left behind -- users_update_own
--     with no WITH CHECK, swipes_own FOR ALL, athlete_profiles_own FOR
--     ALL. They are unreachable today only because service_role is the
--     only writer and 031 revoked client DML. Both of those stop being
--     true the moment a client writes directly, so they must be rewritten
--     BEFORE the first write path moves.
-- ============================================
