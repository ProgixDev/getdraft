-- 040_world_rankings.sql
--
-- Adds a global leaderboard alongside the country divisions.
--
-- 019 built rankings around Canada and the USA and swept everyone else into an
-- OTHER bucket the app never surfaced. An athlete in Algiers could hold a Draft
-- Score with no board to appear on, and a recruiter had no way to look at
-- global talent at all.
--
-- Rather than adding a division per country -- a migration every new market --
-- this ranks by sport across every country. Country divisions are untouched;
-- WORLD is an extra lens on the same scores.
--
-- Built from 026's definition, not 019's: 026 is the live version and casts the
-- CTE counts to int. Retyping from 019 produced integer/bigint mismatches that
-- CREATE OR REPLACE rejects, since it cannot change an existing column's type.

CREATE OR REPLACE VIEW public.athlete_ranking_scores AS
WITH draft_counts AS (
  SELECT swiped_id AS user_id, COUNT(*)::int AS drafts_received
  FROM public.swipes
  WHERE direction = 'draft'
  GROUP BY swiped_id
),
match_counts AS (
  SELECT u.id AS user_id, COUNT(m.id)::int AS matches_count
  FROM public.users u
  LEFT JOIN public.matches m
    ON (m.user_1_id = u.id OR m.user_2_id = u.id) AND m.is_active = TRUE
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
  -- Global standing: same score and tie-breaks, partitioned by sport alone so
  -- an athlete outside CA/US finally has a board, and a recruiter can compare
  -- talent across every country.
  RANK() OVER (
    PARTITION BY sport
    ORDER BY score DESC, profile_completion DESC, created_at ASC
  )::int AS world_rank,
  COUNT(*) OVER (PARTITION BY sport)::int AS world_cohort_size
FROM base;

COMMENT ON VIEW public.athlete_ranking_scores IS
  'Draft Score leaderboard. division_rank/cohort_size are per (country '
  'division, sport); world_rank/world_cohort_size are per sport across every '
  'country -- see migration 040.';
