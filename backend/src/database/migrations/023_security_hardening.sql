-- 023: Security hardening (RLS + SECURITY DEFINER lockdown)
--
-- Closes holes flagged by the Supabase database linter. The backend talks to
-- Postgres with the SERVICE-ROLE key (bypasses RLS and keeps EXECUTE), so
-- every change below is invisible to the app and only removes access from the
-- public `anon` / `authenticated` roles that should never have had it.
-- Verified: NO frontend code calls these RPCs / view / table directly — all
-- access is server-side via the admin client.
--
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS before CREATE; REVOKE/GRANT
-- and ALTER ... SET are naturally idempotent).

-- ─────────────────────────────────────────────────────────────────────────
-- 1) swipe_pack_purchases — RLS was never enabled (migration 017). The table
--    holds Stripe purchase records; with default grants the anon key could
--    read/write every row. Enable RLS, let a user read only their OWN rows,
--    and keep ALL writes server-side (service-role bypasses RLS).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.swipe_pack_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spp_select_own ON public.swipe_pack_purchases;
CREATE POLICY spp_select_own
  ON public.swipe_pack_purchases
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.swipe_pack_purchases FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) increment_* RPCs (migration 002) — SECURITY DEFINER, no caller check,
--    take an attacker-supplied target_user_id. They were executable by anon /
--    authenticated, so anyone could inflate a rival's likes/views (which feed
--    the Draft Score leaderboard) or burn someone's swipe quota. Lock to
--    service-role only and pin search_path.
-- ─────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.increment_profile_views(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_likes_received(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_swipes_used(uuid)   SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.increment_profile_views(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_likes_received(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_swipes_used(uuid)   FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_profile_views(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_likes_received(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_swipes_used(uuid)   TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) athlete_ranking_scores view (migration 019) — created without
--    security_invoker, so it ran with the (postgres) owner's privileges and
--    exposed aggregate engagement metrics (drafts/matches/outreach) to anon,
--    bypassing the RLS on the underlying tables. Make it honour the caller's
--    RLS and drop anon access. Backend reads it via service-role.
-- ─────────────────────────────────────────────────────────────────────────
ALTER VIEW public.athlete_ranking_scores SET (security_invoker = true);
REVOKE ALL ON public.athlete_ranking_scores FROM anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Trigger / helper functions — pin search_path (mutable-search_path WARN)
--    and revoke direct EXECUTE from the public roles. These fire from triggers
--    regardless of EXECUTE grants, so revoking is safe hygiene.
-- ─────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.handle_new_user()    SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_conversation() SET search_path = public, pg_temp;
ALTER FUNCTION public.bump_post_likes()    SET search_path = public, pg_temp;
ALTER FUNCTION public.bump_post_comments() SET search_path = public, pg_temp;
ALTER FUNCTION public.bump_comment_likes() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at()  SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.handle_new_user()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_conversation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_post_likes()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_post_comments() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_comment_likes() FROM PUBLIC, anon, authenticated;
