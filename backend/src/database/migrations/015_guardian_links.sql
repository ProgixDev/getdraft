-- ============================================
-- Migration 015: Guardian ↔ Athlete linking
-- ============================================
-- Parents (and other guardians) prove their relationship to an athlete
-- by scanning a QR code generated on the athlete's account, answering
-- a relationship questionnaire, and recording a short declaration
-- video. Admin reviews the final submission before the link is
-- "approved" and the parent can act on behalf of the athlete.

CREATE TYPE guardian_relationship AS ENUM (
  'parent',
  'legal_guardian',
  'step_parent',
  'sibling',
  'aunt_uncle',
  'grandparent',
  'other'
);

CREATE TYPE guardian_link_status AS ENUM (
  'pending_video',     -- QR scanned + questionnaire filled, awaiting video
  'pending_admin',     -- everything submitted, waiting for admin review
  'approved',
  'declined',
  'expired'            -- QR token expired before scan completed
);

CREATE TABLE IF NOT EXISTS public.guardian_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  guardian_user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship        guardian_relationship NOT NULL,
  -- Free-form answers to the relationship questionnaire (lives, contact,
  -- consent acknowledgements, etc.) — schema intentionally loose.
  questionnaire       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              guardian_link_status NOT NULL DEFAULT 'pending_video',
  -- HMAC-signed token printed in the athlete's QR. Stored so we can
  -- look up which session a parent's scan refers to. NULL once consumed.
  qr_token            TEXT UNIQUE,
  qr_expires_at       TIMESTAMPTZ,
  -- Path in the `guardian-videos` storage bucket, relative to the
  -- bucket root. We don't store the bytes here.
  video_storage_path  TEXT,
  video_recorded_at   TIMESTAMPTZ,
  admin_notes         TEXT,
  decided_at          TIMESTAMPTZ,
  decided_by          UUID REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One active link per (athlete, guardian) pair — re-scanning supersedes
  -- by deleting the old row first.
  UNIQUE (athlete_user_id, guardian_user_id)
);

CREATE INDEX IF NOT EXISTS idx_guardian_links_athlete
  ON public.guardian_links(athlete_user_id);
CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian
  ON public.guardian_links(guardian_user_id);
CREATE INDEX IF NOT EXISTS idx_guardian_links_status_pending
  ON public.guardian_links(status)
  WHERE status IN ('pending_video', 'pending_admin');

CREATE TRIGGER guardian_links_updated_at BEFORE UPDATE ON public.guardian_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;
-- All access goes through the backend service role; no direct client reads.

-- Storage bucket for guardian declaration videos. Created idempotently
-- via Supabase REST in code if it doesn't exist — this migration only
-- adds the SQL-side artefacts.
