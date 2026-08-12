-- 039_user_region.sql
--
-- Adds the sub-national administrative division to users: wilaya in Algeria,
-- state in the US, province in Canada, région in France. Mapbox calls all of
-- them `region`, so we use that name rather than picking one country's word.
--
-- Why this column has to exist: the signup screen already receives the region
-- from Mapbox geocoding and then drops it on the floor — only city, country,
-- lat and lng were ever forwarded. `users.location` is free text along the
-- lines of "Montreal, Canada", which holds the city and the country but not
-- the province, so there was nothing to filter on. Searching for a wilaya
-- returned nothing at every layer because the value was never stored.
--
-- Nullable with no backfill: existing rows keep NULL and are simply absent
-- from region-filtered results, which is the honest answer for a user whose
-- region we never captured. Country filtering is untouched.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS region text;

COMMENT ON COLUMN public.users.region IS
  'Sub-national division (wilaya / state / province) as returned by Mapbox geocoding. NULL when never captured.';

-- Discover filters region together with country and compares case-insensitively
-- ("Blida" typed by one user, "blida" stored from another geocode result), so
-- the index is on the lowered value to match how the query is written.
CREATE INDEX IF NOT EXISTS idx_users_region_lower
  ON public.users (lower(region))
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_country_region_lower
  ON public.users (lower(country), lower(region))
  WHERE region IS NOT NULL;

-- Discover reads through public_users (037), which is an explicit column list,
-- so a new column on the table is invisible until it is added here too.
--
-- Safe to expose, by 037's own standard: a wilaya or province is coarse in the
-- same way `location` and `country` already are. The line that migration draws
-- is precise latitude/longitude, which stays out — that is a physical safety
-- matter for the minors on this platform, not just a privacy one.
--
-- CREATE OR REPLACE VIEW can only append columns, never reorder or remove, so
-- `region` goes last and every existing column keeps its position.
CREATE OR REPLACE VIEW public.public_users AS
SELECT
  id,
  name,
  role,
  avatar_url,
  location,      -- coarse, user-entered ("Montreal, QC")
  country,
  is_onboarded,
  created_at,
  region         -- coarse: wilaya / state / province
FROM public.users
WHERE is_banned = FALSE;

COMMENT ON VIEW public.public_users IS
  'Publicly readable projection of users. NEVER add email, phone, '
  'stripe_*, kyc_*, activation_status, preferences, plan_id, is_banned or '
  'latitude/longitude here -- see migration 037. Precise coordinates are a '
  'safety issue for minor accounts, not merely a privacy one.';

-- CREATE OR REPLACE drops the grants that 037 set, so restate them.
REVOKE ALL ON public.public_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_users TO authenticated;
