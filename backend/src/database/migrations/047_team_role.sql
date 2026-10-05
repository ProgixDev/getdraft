-- 047_team_role.sql
--
-- A fifth account type: 'team' -- a club, school, college or academy that
-- recruits athletes the way a coach or an agent does (one login per team).
--
-- A team is stored as users.role = 'team' with a recruiter_profiles row whose
-- role_type is 'team'. It reuses that table on purpose: organization is the
-- club's name, sport / tags / bio / photos mean what they mean for a coach,
-- and the admin `verified` badge already lives there. Two things a club has
-- and a coach does not get their own nullable columns: org_type and website.
--
-- What has to change in the database for that:
--
--   1. users.role CHECK            accept 'team'
--   2. recruiter_profiles CHECK    role_type accepts 'team'
--   3. recruiter_profiles          + org_type (checked), + website
--   4. handle_new_user()           the signup trigger keeps 'team' instead of
--                                  turning it into 'athlete'
--   5. athlete_ranking_scores      a team's Draft counts in the Draft Score,
--                                  like a coach's or an agent's
--
-- Matching, the Community pool (team ↔ team), labels and the profile API are
-- backend code. matches.kind needs no change: athlete ↔ team is 'recruit',
-- team ↔ team is 'peer'.
--
-- ORDER OF OPERATIONS: this file can be run before or after the backend
-- deploy. The backend refuses to create team accounts until
-- TEAM_ROLE_ENABLED is switched on (common/utils/team-role.ts), and every
-- statement here only widens what the database accepts, so the old and the
-- new backend both run against either state. Run this file FIRST, then set
-- TEAM_ROLE_ENABLED=true -- never the other way round: without step 1 a team
-- signup is written as an 'athlete' and the role reconcile after it fails.
--
-- Idempotent: safe to re-run.

-- ------------------------------------------------------------- users.role

-- 001 declared this CHECK inline, so Postgres named it. On the live database
-- it is users_role_check (checked 2026-10-05), but the migrations are applied
-- by hand and another environment may differ, so drop whichever CHECK is
-- about the role column instead of trusting the name -- the 045 pattern.
-- \m and \M are word boundaries: 'role' must stand alone, so a constraint on
-- some other column whose name merely contains those letters is left alone.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* '\mrole\M'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('athlete', 'parent', 'coach', 'recruiter', 'team', 'admin'));

-- ------------------------------------------- recruiter_profiles.role_type

-- Same story: inline in 001, recruiter_profiles_role_type_check on the live
-- database, located by definition all the same.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.recruiter_profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* '\mrole_type\M'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.recruiter_profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.recruiter_profiles
  ADD CONSTRAINT recruiter_profiles_role_type_check
  CHECK (role_type IN ('agent', 'coach', 'team'));

-- role_type is no longer taken from the request: the backend derives it from
-- users.role on every profile save (coach -> 'coach', recruiter -> 'agent',
-- team -> 'team'), so a coach cannot label itself a team.

-- ------------------------------------------ recruiter_profiles: team fields

-- Both nullable and both optional: a coach or an agent leaves them empty, and
-- a team may too. The league / level a team plays in goes in `tags`, as it
-- does for coaches.
ALTER TABLE public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS org_type TEXT,
  ADD COLUMN IF NOT EXISTS website  TEXT;

-- Separate from ADD COLUMN so a re-run on a database that already has the
-- column still ends with exactly this constraint.
ALTER TABLE public.recruiter_profiles
  DROP CONSTRAINT IF EXISTS recruiter_profiles_org_type_check;
ALTER TABLE public.recruiter_profiles
  ADD CONSTRAINT recruiter_profiles_org_type_check
  CHECK (
    org_type IS NULL
    OR org_type IN ('club', 'school', 'college', 'academy', 'pro', 'other')
  );

COMMENT ON COLUMN public.recruiter_profiles.org_type IS
  'Teams only: club | school | college | academy | pro | other. NULL for '
  'coaches and agents. See migration 047.';
COMMENT ON COLUMN public.recruiter_profiles.website IS
  'Optional public website of the club / organisation (http or https, '
  'validated by the backend). See migration 047.';

-- 035's column-scoped policies need no change. On recruiter_profiles they pin
-- one column, `verified`; organization is the owner's to edit, and org_type
-- and website are the same kind of field. (role_type is not pinned there
-- either. That is unreachable while 031's revoke stands -- only the backend
-- writes this table -- but pin it like `verified` before any client grant
-- on recruiter_profiles is restored, now that it says what an account is.)

-- ---------------------------------------------------------- signup trigger

-- 033's function, unchanged except for 'team' in the whitelist. Without it a
-- team signup falls through to the 'athlete' default below, and the account
-- starts life in the athlete deck. Everything 032/033 established is kept:
-- app_metadata only, 'admin' never, SECURITY DEFINER with a pinned
-- search_path, and REVOKE EXECUTE. The body is 033's line for line, its
-- comments included ("the header" in there is 033's header).
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
  IF requested_role IN ('athlete', 'parent', 'coach', 'recruiter', 'team') THEN
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

-- ---------------------------------------------------------- ranking view

-- Same definition as 044, with one change: drafts_received also counts
-- Drafts FROM teams. A club drafting an athlete is a scout's interest, the
-- same signal as a coach's or an agent's Draft. Athlete ↔ team matches
-- already counted (they are kind = 'recruit'); team ↔ team matches are
-- 'peer' and stay out, like every other Community match.
-- Everything else is unchanged. CREATE OR REPLACE keeps column order/types.

CREATE OR REPLACE VIEW public.athlete_ranking_scores AS
WITH draft_counts AS (
  -- Only a recruiter's Draft is a signal of talent. An athlete drafting
  -- another athlete is a friend request, and must not move the leaderboard.
  SELECT s.swiped_id AS user_id, COUNT(*)::int AS drafts_received
  FROM public.swipes s
  JOIN public.users sw ON sw.id = s.swiper_id
  WHERE s.direction = 'draft'
    AND sw.role IN ('coach', 'recruiter', 'team')
  GROUP BY s.swiped_id
),
match_counts AS (
  SELECT u.id AS user_id, COUNT(m.id)::int AS matches_count
  FROM public.users u
  LEFT JOIN public.matches m
    ON (m.user_1_id = u.id OR m.user_2_id = u.id)
   AND m.is_active = TRUE
   AND m.kind = 'recruit'
  GROUP BY u.id
),
outreach_counts AS (
  SELECT child_athlete_id AS user_id, COUNT(*)::int AS outreach_received
  FROM public.outreach
  GROUP BY child_athlete_id
),
base AS (
  SELECT
    u.id                AS user_id,
    u.name,
    u.avatar_url,
    u.country,
    u.kyc_status,
    u.created_at,
    ap.sport,
    ap.position,
    ap.level,
    ap.class_year,
    CASE
      WHEN lower(coalesce(u.country, '')) IN ('canada', 'ca', 'can')
        THEN 'CA'
      WHEN lower(coalesce(u.country, '')) IN
        ('usa', 'us', 'united states', 'united states of america',
         'u.s.a.', 'u.s.', 'america')
        THEN 'US'
      ELSE 'OTHER'
    END                 AS division,
    coalesce(dc.drafts_received, 0)     AS drafts_received,
    coalesce(mc.matches_count, 0)       AS matches_count,
    coalesce(oc.outreach_received, 0)   AS outreach_received,
    coalesce(ap.profile_views, 0)       AS profile_views,
    coalesce(ap.likes_received, 0)      AS likes_received,
    coalesce(ap.profile_completion, 0)  AS profile_completion,
    (
        coalesce(dc.drafts_received, 0)    * 10
      + coalesce(mc.matches_count, 0)      * 8
      + coalesce(oc.outreach_received, 0)  * 6
      -- likes_received term intentionally removed: a Draft already adds 10
      -- via drafts_received, and double-counting via likes inflated every
      -- Draft to 12. See migration 026.
      + coalesce(ap.profile_views, 0)      * 0.5
      + coalesce(ap.profile_completion, 0) * 0.2
      + CASE WHEN u.kyc_status = 'approved' THEN 15 ELSE 0 END
    )::numeric(10, 2)   AS score
  FROM public.users u
  JOIN public.athlete_profiles ap ON ap.user_id = u.id
  LEFT JOIN draft_counts    dc ON dc.user_id = u.id
  LEFT JOIN match_counts    mc ON mc.user_id = u.id
  LEFT JOIN outreach_counts oc ON oc.user_id = u.id
  WHERE u.role = 'athlete'
    AND coalesce(u.is_banned, FALSE) = FALSE
)
SELECT
  base.*,
  RANK() OVER (
    PARTITION BY division, sport
    ORDER BY score DESC, profile_completion DESC, created_at ASC
  )::int AS division_rank,
  COUNT(*) OVER (PARTITION BY division, sport)::int AS cohort_size,
  RANK() OVER (
    PARTITION BY sport
    ORDER BY score DESC, profile_completion DESC, created_at ASC
  )::int AS world_rank,
  COUNT(*) OVER (PARTITION BY sport)::int AS world_cohort_size
FROM base;

COMMENT ON VIEW public.athlete_ranking_scores IS
  'Draft Score leaderboard. division_rank/cohort_size are per (country '
  'division, sport); world_rank/world_cohort_size are per sport across every '
  'country (040). Counts only Drafts from coaches, agents and teams, and '
  'recruit-kind matches, so peer/community activity never moves the board '
  '(044, 047).';
