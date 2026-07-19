-- 030_super_draft.sql
-- Super Draft (client request, Patrick 18/07): a standout Draft that pushes
-- the sender to the top of the recipient's "who drafted you" list and fires a
-- dedicated notification. Adds one boolean to swipes; a Super Draft is still a
-- Draft (direction = 'draft') so all existing mutual-match logic is unchanged.
--
-- Monthly allowance is enforced in code (SUPER_DRAFT_LIMITS) by counting
-- is_super rows in the current calendar month — no counter column / reset job.
--
-- Backward-compatible: defaults to false, so existing rows and any old client
-- that doesn't send the flag behave exactly as before.

ALTER TABLE public.swipes
  ADD COLUMN IF NOT EXISTS is_super BOOLEAN NOT NULL DEFAULT false;

-- Speeds up the per-user monthly Super Draft count (quota check) and the
-- "surface super drafts first" ordering in who-drafted-you.
CREATE INDEX IF NOT EXISTS idx_swipes_super
  ON public.swipes (swiper_id, is_super, created_at)
  WHERE is_super = true;
