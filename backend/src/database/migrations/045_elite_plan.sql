-- 045_elite_plan.sql
--
-- Four tiers, priced by the client on 2026-09-11:
--   basic (free) · starter 3.99 · pro 7.99 · elite 12.99   (USD / month)
--
-- The only schema change is the new plan id. Both CHECK constraints listed
-- the plan ids explicitly (001 for users, 008 for subscriptions), so a
-- webhook granting 'elite' would have failed the row update and the user
-- would have paid for nothing. Limits and features live in code
-- (PLAN_SWIPE_LIMITS, SUPER_DRAFT_LIMITS, PLAN_FEATURES).
--
-- 'premium' stays: it is a legacy alias for pro and rows may still carry it.

-- 001 declared the users CHECK inline, so Postgres named it. The default is
-- users_plan_id_check, but drop whatever CHECK mentions plan_id rather than
-- trusting the name.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.users
  ADD CONSTRAINT users_plan_id_check
  CHECK (plan_id IN ('basic', 'starter', 'pro', 'elite', 'premium'));

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_plan_id_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_id_check
  CHECK (plan_id IN ('basic', 'starter', 'pro', 'elite', 'premium'));
