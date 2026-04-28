-- ============================================
-- Migration 001: Users and Profiles
-- ============================================

-- Public users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('athlete', 'parent', 'coach', 'recruiter', 'admin')),
  avatar_url TEXT,
  is_onboarded BOOLEAN DEFAULT FALSE,
  plan_id TEXT DEFAULT 'basic' CHECK (plan_id IN ('basic', 'starter', 'pro', 'premium')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  location TEXT,
  country TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Athlete profiles
CREATE TABLE IF NOT EXISTS public.athlete_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  position TEXT,
  level TEXT,
  bio TEXT,
  class_year TEXT,
  gpa NUMERIC(3,2),
  height TEXT,
  weight TEXT,
  forty_yard_dash TEXT,
  awards TEXT[] DEFAULT '{}',
  photos TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  profile_views INTEGER DEFAULT 0,
  likes_received INTEGER DEFAULT 0,
  profile_completion INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recruiter/Coach profiles
CREATE TABLE IF NOT EXISTS public.recruiter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization TEXT NOT NULL,
  sport TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('agent', 'coach')),
  verified BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',
  bio TEXT,
  photos TEXT[] DEFAULT '{}',
  videos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parent profiles
CREATE TABLE IF NOT EXISTS public.parent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  child_athlete_id UUID REFERENCES public.users(id),
  child_class_year TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-create public.users row when auth.users is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'athlete'),
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  );
  -- Auto-create subscription (basic/free)
  INSERT INTO public.subscriptions (user_id, plan_id, daily_swipe_limit)
  VALUES (NEW.id, 'basic', 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER athlete_profiles_updated_at BEFORE UPDATE ON public.athlete_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER recruiter_profiles_updated_at BEFORE UPDATE ON public.recruiter_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER parent_profiles_updated_at BEFORE UPDATE ON public.parent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
