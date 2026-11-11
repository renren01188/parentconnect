-- Parent-account notes belong to the account only. They must never share a
-- column or relationship with student_remarks, which is the dated SF2 source
-- of truth used by Adviser, ICT student profiles, and attendance exports.

BEGIN;

ALTER TABLE public.parents
  ADD COLUMN IF NOT EXISTS parent_remarks text;

COMMENT ON COLUMN public.parents.parent_remarks IS
  'ICT-maintained parent account note; intentionally separate from student SF2 remarks.';

COMMIT;
