-- 046_community_age_groups.sql
--
-- Athlete Community (athlete ↔ athlete peer matching, migration 044) now only
-- connects athletes of the SAME SPORT and the SAME AGE GROUP. From this
-- release the backend enforces it on the Discover feed, the globe, every
-- swipe and the "who drafted you" list (modules/discover/community.ts):
--
--   * a date of birth is required -- without one there is no age group;
--   * under 13: no Community at all;
--   * 13-17 is 'youth', 18+ is 'adult', and an athlete only sees and matches
--     their own group, so an adult can never reach a minor through it;
--   * same sport = athlete_profiles.sport, trimmed, case-insensitive;
--   * both accounts active (a minor's guardian approved).
--
-- The code only stops NEW connections. Peer matches made before it can break
-- those rules -- a 24-year-old matched with a 15-year-old -- and an active
-- match is what opens chat and DMs. This closes them with is_active = FALSE,
-- the same switch an unmatch uses: match chat and DMs both require an active
-- match, so the conversation stops at once, and the Draft Board no longer
-- lists it. The match row, the swipes and the messages are kept for
-- moderation. Nothing is deleted.
--
-- A peer match between two athletes is closed when:
--   * either athlete has no date of birth (or no athlete profile), or
--   * either athlete is under 13, or
--   * one is under 18 and the other is 18 or over, or
--   * their sports differ (case-insensitive, surrounding spaces ignored),
--     or either has no sport.
--
-- Ages use age(CURRENT_DATE, date_of_birth): whole years, a birthday counting
-- from the day itself -- the same rule as isMinor() / ageFromDob() in
-- common/utils/age.ts, so SQL and code draw the lines on the same day. A date
-- of birth in the future reads as a negative age, i.e. under 13, as in code.
--
-- Recruit matches, and coach / agent / parent peer matches, are untouched.
-- No schema or constraint change.
--
-- Idempotent: it only ever sets is_active to FALSE, only on rows that are
-- still active and still break the rules, and never re-activates anything.
-- Running it twice closes nothing the second time.
--
-- To see what it will close before running it, keep the two CTEs and replace
-- the final UPDATE ... with:  SELECT id FROM breaking_the_rules;

WITH athlete_peer_matches AS (
  SELECT
    m.id,
    ap1.date_of_birth       AS dob_1,
    ap2.date_of_birth       AS dob_2,
    lower(btrim(ap1.sport)) AS sport_1,
    lower(btrim(ap2.sport)) AS sport_2
  FROM public.matches m
  JOIN public.users u1
    ON u1.id = m.user_1_id AND u1.role = 'athlete'
  JOIN public.users u2
    ON u2.id = m.user_2_id AND u2.role = 'athlete'
  -- LEFT: an athlete with no profile row has no date of birth, so the match
  -- is closed rather than skipped.
  LEFT JOIN public.athlete_profiles ap1 ON ap1.user_id = m.user_1_id
  LEFT JOIN public.athlete_profiles ap2 ON ap2.user_id = m.user_2_id
  WHERE m.kind = 'peer'
    AND m.is_active IS DISTINCT FROM FALSE
),
breaking_the_rules AS (
  SELECT id
  FROM athlete_peer_matches
  WHERE dob_1 IS NULL
     OR dob_2 IS NULL
     OR date_part('year', age(CURRENT_DATE, dob_1)) < 13
     OR date_part('year', age(CURRENT_DATE, dob_2)) < 13
     OR (date_part('year', age(CURRENT_DATE, dob_1)) >= 18)
        <> (date_part('year', age(CURRENT_DATE, dob_2)) >= 18)
     OR coalesce(sport_1, '') = ''
     OR coalesce(sport_2, '') = ''
     OR sport_1 <> sport_2
)
UPDATE public.matches AS m
SET is_active = FALSE
FROM breaking_the_rules b
WHERE m.id = b.id;
