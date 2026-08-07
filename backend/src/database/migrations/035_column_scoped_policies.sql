-- ============================================
-- Migration 035: Column-scoped write policies
-- ============================================
--
-- 031 revoked every client grant, so today none of this is reachable --
-- Postgres checks privilege before RLS. That is exactly why now is the
-- time to fix it: these policies MUST be correct before the Supabase-only
-- migration grants client access back, and right now a mistake cannot
-- hurt anyone (0 users, no traffic).
--
-- The flaw being fixed: every one of these was `FOR ALL USING (owner =
-- auth.uid())` with no WITH CHECK. For FOR ALL, Postgres reuses USING as
-- the WITH CHECK, so they do constrain WHICH ROW you may touch -- but
-- nothing constrains WHICH COLUMNS. Owning a row meant owning every
-- field in it, including the ones the product's integrity depends on.
--
-- Pattern: split FOR ALL into explicit per-command policies, and on
-- UPDATE pin the privileged columns to their stored value by looking the
-- row up by primary key. INSERT is handled separately because there is no
-- stored row to compare against -- a value that may be SET at creation
-- but never CHANGED afterwards (date_of_birth) is expressible only by
-- splitting the two.
--
-- Idempotent: every policy is dropped before being recreated.

-- --------------------------------------------
-- athlete_profiles -- ranking inputs + the COPPA gate
-- --------------------------------------------
-- profile_views and likes_received are inputs to the national Draft Score
-- ranking; self-setting them is self-serve #1. date_of_birth is the SOLE
-- input to the minor gate -- an athlete who can edit it can age themselves
-- out of guardian consent, which is the one control that cannot be allowed
-- to fail. Both are service-role-only from here.
DROP POLICY IF EXISTS athlete_profiles_own    ON public.athlete_profiles;
DROP POLICY IF EXISTS athlete_profiles_insert ON public.athlete_profiles;
DROP POLICY IF EXISTS athlete_profiles_update ON public.athlete_profiles;
DROP POLICY IF EXISTS athlete_profiles_delete ON public.athlete_profiles;

-- Created during onboarding, so DOB may be set here -- but the ranking
-- counters must start at zero and cannot be seeded.
CREATE POLICY athlete_profiles_insert ON public.athlete_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND COALESCE(profile_views, 0)   = 0
    AND COALESCE(likes_received, 0)  = 0
  );

CREATE POLICY athlete_profiles_update ON public.athlete_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Compared against the stored row by primary key, so this is the
    -- pre-UPDATE value regardless of what the client submitted.
    AND profile_views IS NOT DISTINCT FROM
        (SELECT a.profile_views  FROM public.athlete_profiles a WHERE a.id = athlete_profiles.id)
    AND likes_received IS NOT DISTINCT FROM
        (SELECT a.likes_received FROM public.athlete_profiles a WHERE a.id = athlete_profiles.id)
    AND date_of_birth IS NOT DISTINCT FROM
        (SELECT a.date_of_birth  FROM public.athlete_profiles a WHERE a.id = athlete_profiles.id)
  );

CREATE POLICY athlete_profiles_delete ON public.athlete_profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- --------------------------------------------
-- recruiter_profiles -- the verified badge
-- --------------------------------------------
-- `verified` is trust signalling shown to minors and their guardians when
-- deciding whether to engage with a recruiter. It is granted by review,
-- never self-claimed.
DROP POLICY IF EXISTS recruiter_profiles_own    ON public.recruiter_profiles;
DROP POLICY IF EXISTS recruiter_profiles_insert ON public.recruiter_profiles;
DROP POLICY IF EXISTS recruiter_profiles_update ON public.recruiter_profiles;
DROP POLICY IF EXISTS recruiter_profiles_delete ON public.recruiter_profiles;

CREATE POLICY recruiter_profiles_insert ON public.recruiter_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND COALESCE(verified, FALSE) = FALSE);

CREATE POLICY recruiter_profiles_update ON public.recruiter_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND verified IS NOT DISTINCT FROM
        (SELECT r.verified FROM public.recruiter_profiles r WHERE r.id = recruiter_profiles.id)
  );

CREATE POLICY recruiter_profiles_delete ON public.recruiter_profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- --------------------------------------------
-- swipes -- the paywall
-- --------------------------------------------
-- `FOR ALL` let a client INSERT swipes freely (the 20-Draft/month limit
-- bypassed outright) and, worse, DELETE them -- undoing a swipe to reclaim
-- quota, which defeats any counter built on this table.
--
-- INSERT-only, self-only, and is_super forced false: Super Drafts are
-- scarce by design and counted from this table, so a client that can set
-- the flag mints them.
--
-- NOTE: a policy cannot count rows-per-month, so this does NOT enforce the
-- quota -- it only stops the trivially free cases. Before swipes move
-- client-direct, INSERT must go through a SECURITY DEFINER function that
-- checks the allowance atomically. Until then service_role remains the
-- only writer and DiscoverService enforces it.
DROP POLICY IF EXISTS swipes_own    ON public.swipes;
DROP POLICY IF EXISTS swipes_select ON public.swipes;
DROP POLICY IF EXISTS swipes_insert ON public.swipes;

CREATE POLICY swipes_select ON public.swipes
  FOR SELECT TO authenticated
  USING (swiper_id = auth.uid());

CREATE POLICY swipes_insert ON public.swipes
  FOR INSERT TO authenticated
  WITH CHECK (
    swiper_id = auth.uid()
    AND swiper_id <> swiped_id
    AND direction IN ('draft', 'pass')
    AND COALESCE(is_super, FALSE) = FALSE
  );

-- Deliberately no UPDATE and no DELETE policy: a swipe is an immutable
-- fact, and mutability is what makes a quota built on it forgeable.

-- --------------------------------------------
-- messages -- sender impersonation
-- --------------------------------------------
-- The old policy gated on match membership and never constrained
-- sender_id, so either party could INSERT a message attributed to the
-- OTHER person. On a product connecting minors with recruiters, forged
-- messages inside a real conversation are the worst failure here.
DROP POLICY IF EXISTS messages_own    ON public.messages;
DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
DROP POLICY IF EXISTS messages_update ON public.messages;

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = messages.match_id
      AND (m.user_1_id = auth.uid() OR m.user_2_id = auth.uid())
  ));

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = messages.match_id
        AND (m.user_1_id = auth.uid() OR m.user_2_id = auth.uid())
    )
  );

-- Only is_read may change -- the recipient marking a message read. text
-- and sender_id are pinned so history cannot be rewritten after the fact.
CREATE POLICY messages_update ON public.messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = messages.match_id
      AND (m.user_1_id = auth.uid() OR m.user_2_id = auth.uid())
  ))
  WITH CHECK (
    text IS NOT DISTINCT FROM
      (SELECT x.text      FROM public.messages x WHERE x.id = messages.id)
    AND sender_id IS NOT DISTINCT FROM
      (SELECT x.sender_id FROM public.messages x WHERE x.id = messages.id)
  );

-- --------------------------------------------
-- blocks / push_tokens / parent_profiles
-- --------------------------------------------
-- Lower stakes, but FOR ALL with no explicit WITH CHECK is a pattern worth
-- removing everywhere rather than leaving three exceptions for someone to
-- copy later.
DROP POLICY IF EXISTS blocks_own    ON public.blocks;
DROP POLICY IF EXISTS blocks_select ON public.blocks;
DROP POLICY IF EXISTS blocks_insert ON public.blocks;
DROP POLICY IF EXISTS blocks_delete ON public.blocks;

CREATE POLICY blocks_select ON public.blocks
  FOR SELECT TO authenticated USING (blocker_id = auth.uid());
CREATE POLICY blocks_insert ON public.blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND blocker_id <> blocked_id);
CREATE POLICY blocks_delete ON public.blocks
  FOR DELETE TO authenticated USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_own    ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_select ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_insert ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_update ON public.push_tokens;
DROP POLICY IF EXISTS push_tokens_delete ON public.push_tokens;

CREATE POLICY push_tokens_select ON public.push_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY push_tokens_insert ON public.push_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY push_tokens_update ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY push_tokens_delete ON public.push_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- child_athlete_id is the parent->child association. guardian_links is the
-- authoritative consent record (RLS on, no policies, service-role only),
-- but this column should not be freely repointable at an arbitrary minor
-- either, so it is settable once and pinned thereafter.
DROP POLICY IF EXISTS parent_profiles_own    ON public.parent_profiles;
DROP POLICY IF EXISTS parent_profiles_select ON public.parent_profiles;
DROP POLICY IF EXISTS parent_profiles_insert ON public.parent_profiles;
DROP POLICY IF EXISTS parent_profiles_update ON public.parent_profiles;

CREATE POLICY parent_profiles_select ON public.parent_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY parent_profiles_insert ON public.parent_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY parent_profiles_update ON public.parent_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND child_athlete_id IS NOT DISTINCT FROM
        (SELECT p.child_athlete_id FROM public.parent_profiles p WHERE p.id = parent_profiles.id)
  );

-- ============================================
-- STILL OPEN after 035:
--   * swipes quota is not enforceable in a policy -- needs a
--     SECURITY DEFINER insert function before swipes go client-direct.
--   * users_read_public still exposes every column of every non-banned
--     user (email, phone, DOB, stripe ids). Unreachable while 032's
--     revoke stands; must become a column-restricted view before any
--     client SELECT grant is restored.
--   * storage: 5 of 6 buckets are public with mime=any -- see 036.
-- ============================================
