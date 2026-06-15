-- 022: Minor account activation gate
--
-- Under-18 ATHLETES must have a guardian validate them through the existing
-- guardian-link QR flow (migration 018) and an admin approve that link
-- before the account can use the app. Until then the account sits in
-- 'pending_guardian' and BOTH the backend ActivationGuard and the client
-- route-guard block every feature.
--
-- Denormalised onto users (exactly like kyc_status in 016) so every request
-- can read activation state from a single column without joining
-- guardian_links.
--
-- Backwards compatibility: the DEFAULT 'active' means every EXISTING row,
-- and every adult / non-athlete signup, is unaffected. Only NEW minor
-- athletes are flipped to 'pending_guardian' by
-- users.service.ts -> completeOnboarding(). Activation flips back to 'active'
-- in guardian-links.service.ts -> adminDecide() when the guardian link is
-- approved. This is done in service code (not a trigger) so the whole
-- activation decision lives in one auditable place.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS activation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (activation_status IN ('active', 'pending_guardian'));

-- Partial index for the (small) set of accounts awaiting activation —
-- used by admin tooling / queue filters.
CREATE INDEX IF NOT EXISTS idx_users_activation_status
  ON public.users(activation_status)
  WHERE activation_status = 'pending_guardian';
