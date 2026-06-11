-- ============================================
-- Migration 019: Athlete Rankings — "Draft Score" with Canada / USA divisions
-- ============================================
-- Ranks athletes inside their COUNTRY division (Canada / USA / Other) and
-- sport by a composite "Draft Score" reflecting recruiter demand (drafts,
-- matches, outreach) plus profile quality and KYC verification.
--
-- Implemented as a VIEW computed on read with window functions, so ranks
-- are always fresh and there is no job to schedule. At scale this can be
-- swapped for a denormalised score column refreshed by a worker; the API
-- contract (this view's columns) stays the same.

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
      + coalesce(ap.likes_received, 0)     * 2
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
  COUNT(*) OVER (PARTITION BY division, sport)::int AS cohort_size
FROM base;

-- Supporting indexes for the aggregates the view scans.
CREATE INDEX IF NOT EXISTS idx_swipes_draft_target
  ON public.swipes(swiped_id) WHERE direction = 'draft';
CREATE INDEX IF NOT EXISTS idx_outreach_child_athlete
  ON public.outreach(child_athlete_id);

COMMENT ON VIEW public.athlete_ranking_scores IS
  'Athlete Draft Score leaderboard, ranked within (division, sport). Division derived from users.country -> CA/US/OTHER. See migration 019.';
