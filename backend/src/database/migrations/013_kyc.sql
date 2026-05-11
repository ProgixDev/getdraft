-- 013: KYC verification via Didit
--
-- Every signup runs through Didit's "Custom KYC" workflow (OCR +
-- liveness + face match + IP analysis) before completing onboarding.
-- The backend owns the lifecycle: create a session, redirect the user
-- to Didit, then either receive a webhook OR poll the decision API
-- to update the user's kyc_status.

-- Per-user verification status (denormalised onto users so we don't
-- have to join kyc_sessions on every read).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'none'
    CHECK (kyc_status IN ('none', 'pending', 'in_review', 'approved', 'declined')),
  ADD COLUMN IF NOT EXISTS kyc_completed_at TIMESTAMPTZ;

-- One row per Didit session (a user may have multiple over time —
-- failed first attempt, retried later, etc.).
CREATE TABLE IF NOT EXISTS public.kyc_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  didit_session_id  TEXT NOT NULL UNIQUE,
  workflow_id       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'approved', 'declined', 'expired')),
  decision          JSONB,
  verification_url  TEXT,
  callback_url      TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kyc_sessions_user_started
  ON public.kyc_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_sessions_status
  ON public.kyc_sessions(status)
  WHERE status IN ('pending', 'in_review');

-- Service-role only — frontend reads through the backend API.
ALTER TABLE public.kyc_sessions ENABLE ROW LEVEL SECURITY;
