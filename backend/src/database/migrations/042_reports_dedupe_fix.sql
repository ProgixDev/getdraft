-- 042_reports_dedupe_fix.sql
--
-- Fixes the de-duplication that 041 claimed to have and did not.
--
-- 041 wrote UNIQUE (reporter_id, target_type, target_id, reported_user_id)
-- with a comment saying COALESCE handled the null case. The COALESCE was never
-- actually written. target_id is NULL for a user-level report, and in Postgres
-- NULL is never equal to NULL, so the constraint never fired for exactly the
-- most common kind of report. One person could file the same report against
-- the same user without limit and bury the moderation queue.
--
-- Caught by a test that filed the same report twice and got two ids back.
--
-- A unique INDEX over a COALESCE expression, rather than a constraint: a table
-- constraint cannot be defined over an expression.

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reporter_id_target_type_target_id_reported_user_id_key;

-- Collapse the duplicates 041 allowed through, keeping the earliest of each
-- group, or the index below cannot be built.
DELETE FROM public.reports a
USING public.reports b
WHERE a.ctid > b.ctid
  AND a.reporter_id = b.reporter_id
  AND a.target_type = b.target_type
  AND a.reported_user_id = b.reported_user_id
  AND COALESCE(a.target_id, '00000000-0000-0000-0000-000000000000'::uuid)
    = COALESCE(b.target_id, '00000000-0000-0000-0000-000000000000'::uuid);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_one_per_reporter_target
  ON public.reports (
    reporter_id,
    target_type,
    COALESCE(target_id, '00000000-0000-0000-0000-000000000000'::uuid),
    reported_user_id
  );

COMMENT ON INDEX public.uq_reports_one_per_reporter_target IS
  'One report per reporter per target. COALESCE because target_id is NULL for '
  'user-level reports and NULL never equals NULL -- see migration 042.';
