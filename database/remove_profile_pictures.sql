-- Permanently removes the retired profile-picture feature and its data.
-- Run once in Supabase SQL Editor after deploying the matching application code.
-- The application did not use Supabase Storage for profile pictures; it stored
-- base64 image data in these columns, so dropping them deletes that data.

ALTER TABLE IF EXISTS public.advisers
  DROP COLUMN IF EXISTS profile_picture CASCADE;

ALTER TABLE IF EXISTS public.ict_admins
  DROP COLUMN IF EXISTS profile_picture CASCADE;

ALTER TABLE IF EXISTS public.guidance_counselors
  DROP COLUMN IF EXISTS profile_picture CASCADE;

ALTER TABLE IF EXISTS public.principals
  DROP COLUMN IF EXISTS profile_picture CASCADE;

ALTER TABLE IF EXISTS public.parents
  DROP COLUMN IF EXISTS profile_picture CASCADE;

-- These were denormalized historical copies of the same images.
ALTER TABLE IF EXISTS public.parent_adviser_reports
  DROP COLUMN IF EXISTS parent_profile_picture CASCADE;

ALTER TABLE IF EXISTS public.parent_adviser_report_messages
  DROP COLUMN IF EXISTS sender_profile_picture CASCADE;

-- No Storage buckets are created or referenced by this application for this
-- feature. If a manually-created legacy bucket exists, delete it explicitly
-- from Storage after verifying that it contains only retired profile pictures.
