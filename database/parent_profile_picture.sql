-- Run once in Supabase before deploying parent profile-picture support.
ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS profile_picture TEXT;

ALTER TABLE public.parent_adviser_reports
  ADD COLUMN IF NOT EXISTS parent_profile_picture TEXT;
