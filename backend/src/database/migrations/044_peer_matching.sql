-- 044_peer_matching.sql
--
-- Community matching: the same role matching itself (athlete↔athlete,
-- coach↔coach, agent↔agent, parent↔parent) so people can swap advice, next to
-- the original recruiting matrix (athlete ↔ coach/agent).
--
-- Two things have to be true for that not to damage what already exists:
--
--   1. A match must remember which kind it is, so the Draft Board can label a
--      peer connection and so nothing downstream confuses "a coach drafted
--      me" with "another athlete wants to chat".
--
--   2. Peer activity must stay OUT of the Draft Score. The ranking view counts
--      drafts received and active matches; if athletes could draft each other
--      into the leaderboard, the national #1 would be whoever has the most
--      friends, and the rankings would stop meaning anything to a recruiter.
--
-- Kind is derivable from the two roles (same role = peer), but it is stored
-- rather than joined on every read: the Draft Board and the ranking view are
-- the hot paths, and the roles can in theory change after the fact.

-- ---------------------------------------------------------------- matches

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'recruit'
    CHECK (kind IN ('recruit', 'peer'));

-- Every match that exists today predates peer mode, so the default is also
-- historically correct for all of them.

COMMENT ON COLUMN public.matches.kind IS
  'recruit = athlete ↔ coach/agent (the original product); peer = same role '
  'matching itself for community/advice. Peer matches are excluded from the '
  'Draft Score. See migration 044.';

CREATE INDEX IF NOT EXISTS idx_matches_kind ON public.matches (kind);

-- ---------------------------------------------------------- ranking view

-- Same definition as 040, with two filters added:
--   * drafts_received counts only drafts FROM coaches/agents
--   * matches_count   counts only recruit-kind matches
-- Everything else is unchanged. CREATE OR REPLACE keeps column order/types.

CREATE OR REPLACE VIEW public.athlete_ranking_scores AS
WITH draft_counts AS (
  -- Only a recruiter's Draft is a signal of talent. An athlete drafting
  -- another athlete is a friend request, and must not move the leaderboard.
  SELECT s.swiped_id AS user_id, COUNT(*)::int AS drafts_received
  FROM public.swipes s
  JOIN public.users sw ON sw.id = s.swiper_id
  WHERE s.direction = 'draft'
    AND sw.role IN ('coach', 'recruiter')
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
  'country (040). Counts only recruiter Drafts and recruit-kind matches, so '
  'peer/community activity never moves the board (044).';
