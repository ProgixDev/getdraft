-- Migration 027: Team / club field (client request — "VERY IMPORTANT").
-- Athletes (players) and coaches list the team they play for / coach.
-- Agents keep using recruiter_profiles.organization for their agency name.
-- Additive, nullable, non-destructive.
ALTER TABLE public.athlete_profiles
  ADD COLUMN IF NOT EXISTS team TEXT;

ALTER TABLE public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS team TEXT;
