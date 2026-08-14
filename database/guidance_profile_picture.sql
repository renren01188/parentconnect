-- Run once in Supabase before deploying Guidance profile-picture support.
ALTER TABLE public.guidance_counselors
  ADD COLUMN IF NOT EXISTS profile_picture TEXT;
