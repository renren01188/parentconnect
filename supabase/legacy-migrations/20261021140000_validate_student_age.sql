-- Store the optional age as a whole number of years. Existing student rows
-- are intentionally retained: age can remain NULL until a profile is updated.

BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS age integer;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_age_range_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_age_range_check
  CHECK (age IS NULL OR age BETWEEN 1 AND 120);

COMMENT ON COLUMN public.students.age IS
  'Optional age in whole years; validated from 1 through 120.';

COMMIT;
