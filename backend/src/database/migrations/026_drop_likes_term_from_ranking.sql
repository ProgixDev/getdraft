-- ============================================
-- Migration 026: Draft Score — drop the duplicate likes_received term
-- ============================================
-- A Draft swipe currently increments BOTH swipes(direction='draft') AND
-- athlete_profiles.likes_received, and the view in migration 019 weighted
-- drafts ×10 AND likes ×2 = 12 for ONE recruiter action. The likes term is
-- removed here so a draft is worth exactly 10. Every other input, weight,
-- COALESCE behavior, division partition, ordering, and cohort_size stays
-- identical — likes_received is kept in the SELECT output because the
-- frontend (RankingRow type, services/rankings.ts) and other UI surfaces
-- still read it as a standalone "Likes" stat.

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
  COUNT(*) OVER (PARTITION BY division, sport)::int AS cohort_size
FROM base;

COMMENT ON VIEW public.athlete_ranking_scores IS
  'Athlete Draft Score leaderboard, ranked within (division, sport). Migration 026 drops the likes_received term to stop double-counting Draft swipes.';
