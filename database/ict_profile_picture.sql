-- Run once in Supabase before deploying ICT profile-picture support.
ALTER TABLE public.ict_admins
  ADD COLUMN IF NOT EXISTS profile_picture TEXT;
