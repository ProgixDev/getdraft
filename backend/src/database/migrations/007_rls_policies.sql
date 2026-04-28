-- ============================================
-- Migration 007: Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiter_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Users: read own, read public info of others
CREATE POLICY users_read_own ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY users_read_public ON public.users FOR SELECT
  USING (is_banned = FALSE);

CREATE POLICY users_update_own ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Athlete profiles: own read/write, public read
CREATE POLICY athlete_profiles_own ON public.athlete_profiles FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY athlete_profiles_read ON public.athlete_profiles FOR SELECT
  USING (TRUE);

-- Recruiter profiles: own read/write, public read
CREATE POLICY recruiter_profiles_own ON public.recruiter_profiles FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY recruiter_profiles_read ON public.recruiter_profiles FOR SELECT
  USING (TRUE);

-- Parent profiles: own read/write
CREATE POLICY parent_profiles_own ON public.parent_profiles FOR ALL
  USING (auth.uid() = user_id);

-- Swipes: own insert/read
CREATE POLICY swipes_own ON public.swipes FOR ALL
  USING (auth.uid() = swiper_id);

-- Matches: participants only
CREATE POLICY matches_own ON public.matches FOR SELECT
  USING (auth.uid() = user_1_id OR auth.uid() = user_2_id);

-- Messages: match participants only
CREATE POLICY messages_own ON public.messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE matches.id = messages.match_id
      AND (matches.user_1_id = auth.uid() OR matches.user_2_id = auth.uid())
    )
  );

-- Subscriptions: own only
CREATE POLICY subscriptions_own ON public.subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- Push tokens: own only
CREATE POLICY push_tokens_own ON public.push_tokens FOR ALL
  USING (auth.uid() = user_id);

-- Blocks: blocker only
CREATE POLICY blocks_own ON public.blocks FOR ALL
  USING (auth.uid() = blocker_id);

-- Profile views: insert own, read viewed
CREATE POLICY profile_views_insert ON public.profile_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

CREATE POLICY profile_views_read ON public.profile_views FOR SELECT
  USING (auth.uid() = viewed_id);

-- Service role bypass (for backend API)
-- Note: The service_role key bypasses RLS automatically in Supabase

-- Supabase Storage buckets (run in Supabase dashboard)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', true);
