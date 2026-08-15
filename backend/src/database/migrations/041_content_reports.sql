-- 041_content_reports.sql
--
-- In-app reporting for users, posts, comments and messages.
--
-- Google Play's User Generated Content policy requires apps that host UGC to
-- provide "an in-app system for reporting and blocking UGC and users". The app
-- had blocking (migration 002) but no reporting, which is half the
-- requirement. It matters more here than for most apps: the audience includes
-- 13-17 year olds, so the Families policy applies, and UGC is everywhere --
-- posts, reels, comments, profile photos and video, and direct messages.
--
-- Reports are kept even after the reported content is deleted (target_id is a
-- plain UUID, not a foreign key) so a pattern of behaviour survives the
-- offender tidying up after themselves. reporter_id and reported_user_id DO
-- cascade, because an account deletion has to take its data with it -- see the
-- deletion contract in the privacy policy.

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Who the report is ultimately about. For a post or message this is its
  -- author, resolved at report time, so moderation can act on the person
  -- without re-deriving ownership from content that may be gone.
  reported_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('user', 'post', 'comment', 'message')),
  -- Null for a whole-user report; otherwise the id of the offending item.
  -- Deliberately NOT a foreign key: see the note above.
  target_id UUID,
  reason TEXT NOT NULL
    CHECK (reason IN (
      'spam',
      'harassment',
      'inappropriate_content',
      'fake_profile',
      'underage',
      'other'
    )),
  -- Optional free text from the reporter.
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One open report per person per target. A reporter can report the same
  -- thing again once the first has been dealt with, but cannot spam the queue.
  -- COALESCE because target_id is null for user-level reports and NULL never
  -- equals NULL in a unique index.
  UNIQUE (reporter_id, target_type, target_id, reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_status
  ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user
  ON public.reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter
  ON public.reports(reporter_id);

-- Nobody reaches this table with an anon key. The backend uses the
-- service-role key, which bypasses RLS; enabling it with no permissive policy
-- means a leaked anon key still cannot read who reported whom -- which is
-- exactly the data that would put a reporter at risk.
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reports IS
  'User reports of users, posts, comments and messages. Required by Google '
  'Play UGC policy alongside blocking -- see migration 041.';
