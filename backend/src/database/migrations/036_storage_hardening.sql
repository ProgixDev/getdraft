-- ============================================
-- Migration 036: Storage bucket hardening
-- ============================================
--
-- Nobody had ever read storage.buckets. The Phase 0 dump found all six
-- buckets accepting `mime=any`, five of them public, and the one private
-- bucket -- guardian consent recordings of minors -- with no size limit
-- at all.
--
-- `mime=any` on a PUBLIC bucket is the serious half. A public Supabase
-- bucket serves objects to anyone with the URL: no auth, no expiry, no
-- revocation. Combined with "any file type" that is an open file host on
-- the project's own domain, and an uploaded .html or .svg served inline
-- is stored XSS against that origin.
--
-- This migration fixes what can be fixed without touching the app:
-- allowlist the MIME types each bucket actually needs, and put a ceiling
-- on guardian-videos.
--
-- SVG is deliberately excluded everywhere. It is an image to a product
-- manager and a script container to a browser.
--
-- Idempotent.

-- --------------------------------------------
-- Image-only buckets
-- --------------------------------------------
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    ],
    file_size_limit = 5242880          -- 5 MB
WHERE id IN ('avatars', 'sports');

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
    ],
    file_size_limit = 10485760         -- 10 MB
WHERE id = 'photos';

-- --------------------------------------------
-- Video buckets
-- --------------------------------------------
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'video/mp4', 'video/quicktime', 'video/webm'
    ],
    file_size_limit = 52428800         -- 50 MB
WHERE id = 'videos';

-- Posts carry both photos and reels.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/webm'
    ],
    file_size_limit = 52428800         -- 50 MB
WHERE id = 'posts';

-- Guardian consent recordings. Correctly private already; it was the only
-- bucket with NO ceiling, so a single upload could consume the project's
-- entire storage quota -- on the FREE plan, 1 GB shared with everything
-- else. 100 MB is generous for a short consent clip.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'video/mp4', 'video/quicktime', 'video/webm'
    ],
    file_size_limit = 104857600        -- 100 MB
WHERE id = 'guardian-videos';

-- ============================================
-- NOT DONE HERE -- needs a product decision + client changes
-- ============================================
--
-- `photos` and `videos` are PUBLIC and hold media of athletes who are
-- minors. Public means world-readable by URL, forever, with no auth and
-- no way to revoke a link once it leaks. For a recruiting product some of
-- this is intentional -- profiles are meant to be seen -- but "visible to
-- signed-in recruiters" and "visible to the entire internet" are not the
-- same requirement, and right now it is the second one.
--
-- Flipping them to private is one UPDATE, but it breaks every <Image>
-- in the app: the client would have to request signed URLs instead of
-- using public paths. So it pairs with client work rather than shipping
-- alone.
--
--   UPDATE storage.buckets SET public = FALSE
--    WHERE id IN ('photos', 'videos');
--
-- `avatars`, `sports` and `posts` are defensible as public -- avatars and
-- sport icons are low-sensitivity, and posts are a public social feed by
-- design.
--
-- Also still open: storage.objects has RLS on and ZERO policies, so no
-- client can upload directly today (service_role only). Every upload path
-- must be authored before uploads move client-direct -- and the policy
-- must check the object's owner from the stored path rather than trusting
-- a client-supplied name, which is what uploads.service.ts:42-44 does
-- today with a startsWith() string check.
-- ============================================
