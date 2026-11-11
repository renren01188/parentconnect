-- Subject Teacher submissions belong to the Adviser-owned Student Reports
-- queue until an Adviser explicitly forwards a concern to a completed Parent
-- account.  Keep the sender metadata on that source record so retries,
-- per-teacher limits, staff-only attribution, and later escalation remain
-- reliable without creating a Parent report at submission time.

BEGIN;

ALTER TABLE public.student_reports
  ADD COLUMN IF NOT EXISTS report_source text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS subject_teacher_name text,
  ADD COLUMN IF NOT EXISTS subject_teacher_email text,
  ADD COLUMN IF NOT EXISTS subject_teacher_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS subject_teacher_submission_key uuid,
  ADD COLUMN IF NOT EXISTS subject_teacher_report_date_manila date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_reports_report_source_check'
      AND conrelid = 'public.student_reports'::regclass
  ) THEN
    ALTER TABLE public.student_reports
      ADD CONSTRAINT student_reports_report_source_check
      CHECK (report_source IN ('student', 'subject_teacher'));
  END IF;
END $$;

-- The former global one-report-per-student/day index would also block a
-- Subject Teacher report when a student submitted their own report that day.
-- Retain that public-student rule, but scope it to its actual source.
DROP INDEX IF EXISTS public.student_reports_one_per_manila_day_idx;

CREATE UNIQUE INDEX IF NOT EXISTS student_reports_one_per_manila_day_idx
  ON public.student_reports (
    student_id,
    ((created_at AT TIME ZONE 'Asia/Manila')::date)
  )
  WHERE report_source = 'student';

CREATE UNIQUE INDEX IF NOT EXISTS student_reports_subject_teacher_submission_key_idx
  ON public.student_reports (subject_teacher_submission_key)
  WHERE subject_teacher_submission_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_reports_subject_teacher_daily_limit_idx
  ON public.student_reports (
    subject_teacher_email,
    subject_teacher_report_date_manila
  )
  WHERE report_source = 'subject_teacher';

CREATE OR REPLACE FUNCTION public.enforce_subject_teacher_student_report_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  report_count integer;
BEGIN
  IF NEW.report_source <> 'subject_teacher' THEN
    RETURN NEW;
  END IF;

  IF coalesce(btrim(NEW.subject_teacher_email), '') = ''
    OR NEW.subject_teacher_report_date_manila IS NULL
    OR NEW.subject_teacher_submission_key IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Subject Teacher reports require verified sender metadata.';
  END IF;

  -- Serialize the count for one teacher and one Manila calendar day so two
  -- concurrent browser submissions cannot bypass the maximum of two reports.
  PERFORM pg_advisory_xact_lock(
    hashtext(lower(btrim(NEW.subject_teacher_email)) || ':' || NEW.subject_teacher_report_date_manila::text)
  );

  SELECT count(*)::integer
  INTO report_count
  FROM public.student_reports AS report
  WHERE report.report_source = 'subject_teacher'
    AND lower(btrim(report.subject_teacher_email)) = lower(btrim(NEW.subject_teacher_email))
    AND report.subject_teacher_report_date_manila = NEW.subject_teacher_report_date_manila;

  IF report_count >= 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUBJECT_TEACHER_DAILY_LIMIT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_reports_enforce_subject_teacher_daily_limit
  ON public.student_reports;

CREATE TRIGGER student_reports_enforce_subject_teacher_daily_limit
BEFORE INSERT ON public.student_reports
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subject_teacher_student_report_daily_limit();

COMMENT ON COLUMN public.student_reports.report_source IS
  'Whether this Adviser Student Report was submitted by a student or a verified Subject Teacher.';

COMMENT ON COLUMN public.student_reports.subject_teacher_submission_key IS
  'Browser retry key for a verified Subject Teacher submission; unique when present.';

COMMIT;
