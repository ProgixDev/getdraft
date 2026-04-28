-- ============================================
-- Migration 002: Swipes, Matches, Blocks, Profile Views
-- ============================================

CREATE TABLE IF NOT EXISTS public.swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  swiped_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('draft', 'pass')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(swiper_id, swiped_id)
);

CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON public.swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_swipes_swiped ON public.swipes(swiped_id);
CREATE INDEX IF NOT EXISTS idx_swipes_daily ON public.swipes(swiper_id, created_at);

CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_2_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(user_1_id, user_2_id),
  CHECK (user_1_id < user_2_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON public.matches(user_1_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON public.matches(user_2_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);

CREATE TABLE IF NOT EXISTS public.profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_views_viewed ON public.profile_views(viewed_id, created_at DESC);

-- RPC: increment profile views
CREATE OR REPLACE FUNCTION public.increment_profile_views(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.athlete_profiles
  SET profile_views = profile_views + 1
  WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: increment likes received
CREATE OR REPLACE FUNCTION public.increment_likes_received(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.athlete_profiles
  SET likes_received = likes_received + 1
  WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: increment swipes used today
CREATE OR REPLACE FUNCTION public.increment_swipes_used(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.subscriptions
  SET swipes_used_today = swipes_used_today + 1
  WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
