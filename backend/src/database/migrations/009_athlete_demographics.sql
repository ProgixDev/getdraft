-- Migration 009: Athlete demographics (collected at signup, previously unstored)
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender        TEXT,
  ADD COLUMN IF NOT EXISTS experience    TEXT,
  ADD COLUMN IF NOT EXISTS jersey_number TEXT;
