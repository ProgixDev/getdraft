-- ============================================
-- Migration 003: Outreach (Recruiter → Parent)
-- ============================================

CREATE TABLE IF NOT EXISTS public.outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  child_athlete_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Review', 'Responded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recruiter_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_parent ON public.outreach(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_recruiter ON public.outreach(recruiter_id);

CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id UUID NOT NULL REFERENCES public.outreach(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_messages ON public.outreach_messages(outreach_id, created_at DESC);

CREATE TRIGGER outreach_updated_at BEFORE UPDATE ON public.outreach
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
