-- ============================================
-- Migration 048: close the public_users view; functions born private
-- ============================================
--
-- 1. public_users (037, recreated in 039) runs as its owner and was granted
--    SELECT to `authenticated`. Anyone can become `authenticated`: the anon
--    key ships in the app and GoTrue signup must stay open. So with a token
--    of their own, anyone could call
--      GET /rest/v1/public_users?select=*
--    and list every non-banned account -- name, role, avatar, city,
--    country, region -- including minors still waiting for guardian
--    approval and people who blocked them. None of the backend's rules
--    (activation gate, blocks, "Profile Visible", Community age groups)
--    apply on that path.
--
--    Nothing reads the view: the backend uses service_role on the users
--    table, and Prisma's `public_users` model is @@map("users"). Checked on
--    live 2026-10-07: it was the ONLY public object anon / authenticated
--    could SELECT. The view is kept (037's projection is still the right
--    shape if direct reads are ever wanted); only the grant goes.
--
-- 2. 031 / 032 made new TABLES private by default, but not functions: a
--    future SECURITY DEFINER function would be callable by anyone at
--    /rest/v1/rpc/<name> until someone remembered to revoke it.
--
-- Idempotent. Undo for 1: GRANT SELECT ON public.public_users TO authenticated;

REVOKE ALL ON public.public_users FROM PUBLIC, anon, authenticated;

-- Run as the role that creates functions in this project (postgres), which
-- is the role these default privileges apply to.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
