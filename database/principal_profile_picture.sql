-- Run once in Supabase before deploying Principal profile-picture support.
ALTER TABLE public.principals
  ADD COLUMN IF NOT EXISTS profile_picture TEXT;
