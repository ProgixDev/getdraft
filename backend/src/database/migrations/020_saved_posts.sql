-- ============================================
-- Migration 020: Saved posts (bookmarks)
-- ============================================
-- A user's private bookmark list across the social feed. Posts and reels
-- both live in public.posts (migration 010), so one table covers both
-- kinds. Unique (user_id, post_id) makes save idempotent, matching the
-- pattern of post_likes (010) and post_comment_likes (011). FKs cascade
-- so deleting a user or post cleans up its saves automatically — no
-- orphan rows, no need for a follow-up sweep.

CREATE TABLE IF NOT EXISTS public.saved_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

-- "My saved, newest first" is the only read pattern, so a composite
-- index on (user_id, created_at DESC) is enough.
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created
  ON public.saved_posts(user_id, created_at DESC);

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

-- Saves are private. Only the owner can see and mutate their own list.
DROP POLICY IF EXISTS sp_sel ON public.saved_posts;
CREATE POLICY sp_sel ON public.saved_posts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS sp_all ON public.saved_posts;
CREATE POLICY sp_all ON public.saved_posts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.saved_posts IS
  'Per-user bookmark list over public.posts (both photo posts and video reels). See migration 020.';
