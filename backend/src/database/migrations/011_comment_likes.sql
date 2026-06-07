-- Migration 011: per-comment likes + counter trigger
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.post_comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (comment_id, user_id)
);

CREATE OR REPLACE FUNCTION public.bump_comment_likes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.post_comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_comment_likes ON public.post_comment_likes;
CREATE TRIGGER trg_comment_likes AFTER INSERT OR DELETE ON public.post_comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_comment_likes();

ALTER TABLE public.post_comment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcl_sel ON public.post_comment_likes;
CREATE POLICY pcl_sel ON public.post_comment_likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pcl_all ON public.post_comment_likes;
CREATE POLICY pcl_all ON public.post_comment_likes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
