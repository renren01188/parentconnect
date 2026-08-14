-- Run once in Supabase before deploying Adviser profile-picture support.
ALTER TABLE public.advisers
  ADD COLUMN IF NOT EXISTS profile_picture TEXT;
