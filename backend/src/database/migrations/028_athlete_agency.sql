-- Migration 028: Agency field on athlete profiles (client request).
-- Some players are already signed to an agency; they pick from a popular list
-- or type their own. Optional, nullable, additive.
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS agency TEXT;
