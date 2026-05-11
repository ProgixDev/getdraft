-- 010: Signup OTPs for the new email + phone signup flow
--
-- The backend owns the verification step (custom SMTP via Resend for email;
-- Twilio Verify for phone). A Supabase auth user is created ONLY after
-- the full signup flow completes (`/auth/complete-signup`). This table
-- holds the in-flight OTPs.

CREATE TABLE IF NOT EXISTS public.signup_otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact       TEXT NOT NULL,
  contact_type  TEXT NOT NULL CHECK (contact_type IN ('email', 'phone')),
  code_hash     TEXT NOT NULL,
  attempts      INT  NOT NULL DEFAULT 0,
  verified      BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active OTP row at a time per contact; we upsert on every request.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_otps_contact
  ON public.signup_otps(contact, contact_type);

-- Cleanup index for the periodic sweeper.
CREATE INDEX IF NOT EXISTS idx_signup_otps_expires_at
  ON public.signup_otps(expires_at);

-- Service-role only — frontend never reads this table directly.
ALTER TABLE public.signup_otps ENABLE ROW LEVEL SECURITY;
