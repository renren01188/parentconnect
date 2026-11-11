-- A school year's class-day schedule is stored independently from its label
-- and date range. Existing school years remain weekday-only by default.

BEGIN;

ALTER TABLE IF EXISTS public.school_year_config
  ADD COLUMN IF NOT EXISTS attendance_weekdays text[] NOT NULL
  DEFAULT ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri']::text[];

UPDATE public.school_year_config
SET attendance_weekdays = ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri']::text[]
WHERE attendance_weekdays IS NULL OR cardinality(attendance_weekdays) = 0;

ALTER TABLE IF EXISTS public.school_year_config
  DROP CONSTRAINT IF EXISTS school_year_config_attendance_weekdays_check;

ALTER TABLE IF EXISTS public.school_year_config
  ADD CONSTRAINT school_year_config_attendance_weekdays_check
  CHECK (
    cardinality(attendance_weekdays) > 0
    AND attendance_weekdays <@ ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']::text[]
  );

COMMIT;
