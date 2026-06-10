-- 013: User preferences (settings persistence)
-- (ported from reference 009_user_preferences.sql)
--
-- Per-user JSONB blob for client-managed settings: notification toggles,
-- privacy flags, etc. The shape is intentionally loose; the client is
-- the source of truth for which keys exist.
--
-- Default '{}' so existing rows behave like "all defaults" without
-- needing a backfill.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
