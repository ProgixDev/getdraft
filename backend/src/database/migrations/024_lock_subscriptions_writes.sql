-- 024: Lock down subscriptions writes (P0 — privilege escalation)
--
-- migration 005 created `subscriptions_own` as a FOR ALL policy and the table
-- inherited default anon/authenticated DML grants. Net effect: any signed-in
-- user could `UPDATE public.subscriptions SET plan_id='pro',
-- daily_swipe_limit=-1 WHERE user_id = auth.uid()` and self-grant Pro +
-- unlimited swipes (the USING expr matches their own row; WITH CHECK was null).
--
-- Fix: subscriptions is written ONLY by the backend (service-role key, which
-- bypasses RLS). Clients may read their own row but must never write it.
-- Idempotent.

DROP POLICY IF EXISTS subscriptions_own ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_own_select ON public.subscriptions;

CREATE POLICY subscriptions_own_select
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;
