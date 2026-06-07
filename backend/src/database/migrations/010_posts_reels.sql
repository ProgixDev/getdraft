-- Migration 010: Posts (photos) and Reels (videos) with likes, comments, one-level replies.
-- kind: 'post' (photo) or 'reel' (video). Global feed for all roles.

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('post','reel')),
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  thumbnail_url TEXT,
  caption TEXT,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_kind_created ON public.posts(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON public.posts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.post_comments(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON public.post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON public.post_comments(parent_id);

-- Atomic counter maintenance via triggers.
CREATE OR REPLACE FUNCTION public.bump_post_likes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_post_likes ON public.post_likes;
CREATE TRIGGER trg_post_likes AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_likes();

CREATE OR REPLACE FUNCTION public.bump_post_comments() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP='DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_post_comments ON public.post_comments;
CREATE TRIGGER trg_post_comments AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_post_comments();

-- RLS — backend uses service_role (bypasses); these protect any direct authenticated client access.
ALTER TABLE public.posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS posts_ins ON public.posts;
CREATE POLICY posts_ins ON public.posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS posts_del ON public.posts;
CREATE POLICY posts_del ON public.posts FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS plikes_sel ON public.post_likes;
CREATE POLICY plikes_sel ON public.post_likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS plikes_all ON public.post_likes;
CREATE POLICY plikes_all ON public.post_likes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS pcom_sel ON public.post_comments;
CREATE POLICY pcom_sel ON public.post_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pcom_ins ON public.post_comments;
CREATE POLICY pcom_ins ON public.post_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS pcom_del ON public.post_comments;
CREATE POLICY pcom_del ON public.post_comments FOR DELETE TO authenticated USING (user_id = auth.uid());
