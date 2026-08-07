-- ============================================
-- Migration 038: right-size storage for the 1 GB Free budget
-- ============================================
--
-- The Free plan gives 1 GB of object storage TOTAL, across every bucket.
-- 036 set sane MIME allowlists but kept the original size caps, which were
-- written for a paid plan:
--
--   posts 50 MB, videos 50 MB, guardian-videos 100 MB
--
-- At 50 MB a clip, the entire project fills after ~20 videos. For an app
-- built on athlete highlight reels that is not a launch constraint, it is
-- a first-afternoon-of-testing constraint.
--
-- These caps are a budget, not a quality judgement. 15 MB is a comfortable
-- 30-60s clip at sensible mobile bitrates, which is what a highlight reel
-- and a guardian consent recording actually are.
--
--   avatars           5 MB -> 2 MB    profile photo
--   sports            5 MB -> 1 MB    sport icons, tiny by nature
--   photos           10 MB -> 4 MB    profile gallery
--   posts            50 MB -> 15 MB   feed photo or reel
--   videos           50 MB -> 15 MB   highlight clip
--   guardian-videos 100 MB -> 20 MB   short consent recording
--
-- Rough capacity at these caps: ~65 videos, or a few hundred photos.
-- Enough for internal testing with a dozen testers. NOT enough for public
-- launch -- see the note at the foot of this file.
--
-- Lowering a cap does not touch existing objects; it only rejects future
-- uploads above the limit. Storage is currently empty, so nothing is
-- affected either way.
--
-- Idempotent.

UPDATE storage.buckets SET file_size_limit =   2097152 WHERE id = 'avatars';          --  2 MB
UPDATE storage.buckets SET file_size_limit =   1048576 WHERE id = 'sports';           --  1 MB
UPDATE storage.buckets SET file_size_limit =   4194304 WHERE id = 'photos';           --  4 MB
UPDATE storage.buckets SET file_size_limit =  15728640 WHERE id = 'posts';            -- 15 MB
UPDATE storage.buckets SET file_size_limit =  15728640 WHERE id = 'videos';           -- 15 MB
UPDATE storage.buckets SET file_size_limit =  20971520 WHERE id = 'guardian-videos';  -- 20 MB

-- --------------------------------------------
-- Usage monitoring
-- --------------------------------------------
-- There is no alert when a Free project approaches its storage ceiling --
-- uploads simply start failing. This view makes the number checkable
-- before that happens, from SQL or the dashboard.
CREATE OR REPLACE VIEW public.storage_usage AS
SELECT
  b.id                                              AS bucket,
  b.public,
  pg_size_pretty(b.file_size_limit)                 AS per_file_limit,
  count(o.id)                                       AS objects,
  pg_size_pretty(COALESCE(SUM((o.metadata->>'size')::bigint), 0)) AS used,
  ROUND(
    100.0 * COALESCE(SUM((o.metadata->>'size')::bigint), 0)
    / (1024::numeric ^ 3),
    2
  )                                                 AS pct_of_free_1gb
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.public, b.file_size_limit
ORDER BY 5 DESC;

COMMENT ON VIEW public.storage_usage IS
  'Per-bucket storage consumption against the Free plan 1 GB ceiling. '
  'Check before launch and whenever uploads start failing. Upgrading to '
  'Pro raises the ceiling to 100 GB and makes this view mostly a curiosity.';

-- service_role only. This is operational data; clients have no use for it
-- and 032 revoked their grants anyway.
REVOKE ALL ON public.storage_usage FROM PUBLIC, anon, authenticated;

-- ============================================
-- HONEST LIMIT
-- ============================================
-- These caps make Free workable for internal testing. They do not make it
-- workable for public launch.
--
-- Arithmetic: 1 GB / 15 MB is ~65 videos, TOTAL, across every user, for
-- the lifetime of the project. Fifty athletes uploading two clips each
-- fills it. When it fills, uploads fail -- there is no overage, no grace,
-- and no warning beyond this view.
--
-- The options at that point, cheapest first:
--   1. Supabase Pro, $25/mo -> 100 GB. Roughly one paying subscriber.
--   2. Move video to Cloudflare R2 (10 GB free, no egress fees) and keep
--      images here. Real work: another account, S3-compatible uploads,
--      signed URLs, and a second place minors' media lives.
--
-- Option 1 is less engineering and less operational surface. Option 2 is
-- genuinely free. Neither is "do nothing" -- 1 GB will not hold a video
-- product.
-- ============================================
