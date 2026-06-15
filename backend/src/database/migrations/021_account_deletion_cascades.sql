-- 021_account_deletion_cascades.sql
--
-- Self-service account deletion (DELETE /users/me) calls
-- supabase.auth.admin.deleteUser(userId), which cascades into public.users
-- and from there into every dependent row via the existing FKs. Two FKs to
-- public.users were left at NO ACTION (the Postgres default) and would
-- break the cascade with a 23503 foreign_key_violation:
--
--   * guardian_links.athlete_user_id  — deleting an athlete who has been
--     linked to by a parent would fail. Their guardian links are
--     meaningless once the athlete is gone, so CASCADE the deletion.
--   * parent_profiles.child_athlete_id — deleting an athlete who has been
--     selected as a parent's child would fail. The column is nullable and
--     the parent_profile row should survive (the parent themselves still
--     exists), so SET NULL — the parent is simply unlinked.
--
-- guardian_links.guardian_user_id and parent_profiles.user_id are already
-- ON DELETE CASCADE and don't need touching.
--
-- The DROP+ADD on guardian_links_athlete_user_id_fkey is idempotent: a
-- subset of environments already have it at CASCADE (it was tightened in a
-- prior pass), and re-stating CASCADE leaves them unchanged.

BEGIN;

ALTER TABLE public.guardian_links
  DROP CONSTRAINT IF EXISTS guardian_links_athlete_user_id_fkey,
  ADD CONSTRAINT guardian_links_athlete_user_id_fkey
    FOREIGN KEY (athlete_user_id) REFERENCES public.users(id)
    ON DELETE CASCADE;

ALTER TABLE public.parent_profiles
  DROP CONSTRAINT IF EXISTS parent_profiles_child_athlete_id_fkey,
  ADD CONSTRAINT parent_profiles_child_athlete_id_fkey
    FOREIGN KEY (child_athlete_id) REFERENCES public.users(id)
    ON DELETE SET NULL;

COMMIT;
