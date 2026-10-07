-- Public Student Report and Subject Teacher Report daily limits.
-- All dates are calculated in Asia/Manila, and triggers make the limits safe
-- against refreshes, parallel tabs, and concurrent requests.

ALTER TABLE public.student_reports
  ADD COLUMN IF NOT EXISTS report_date_manila date;

UPDATE public.student_reports
SET report_date_manila = (created_at AT TIME ZONE 'Asia/Manila')::date
WHERE report_date_manila IS NULL;

ALTER TABLE public.student_reports
  ALTER COLUMN report_date_manila SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_student_report_date_manila()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.report_date_manila := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Manila')::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_report_date_manila ON public.student_reports;
CREATE TRIGGER set_student_report_date_manila
BEFORE INSERT OR UPDATE OF created_at ON public.student_reports
FOR EACH ROW EXECUTE FUNCTION public.set_student_report_date_manila();

CREATE UNIQUE INDEX IF NOT EXISTS student_reports_one_per_manila_day_idx
  ON public.student_reports (student_id, report_date_manila);

ALTER TABLE public.parent_adviser_reports
  ADD COLUMN IF NOT EXISTS subject_teacher_email text,
  ADD COLUMN IF NOT EXISTS subject_teacher_report_date_manila date;

CREATE INDEX IF NOT EXISTS parent_adviser_reports_subject_teacher_daily_idx
  ON public.parent_adviser_reports (subject_teacher_email, subject_teacher_report_date_manila)
  WHERE subject_teacher_email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_subject_teacher_report_daily_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reports_today integer;
BEGIN
  IF NEW.subject_teacher_email IS NULL OR btrim(NEW.subject_teacher_email) = '' THEN
    RETURN NEW;
  END IF;

  NEW.subject_teacher_email := lower(btrim(NEW.subject_teacher_email));
  NEW.subject_teacher_report_date_manila := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Manila')::date;

  -- Serialize requests for the same teacher and Manila calendar date.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.subject_teacher_email || ':' || NEW.subject_teacher_report_date_manila::text, 0));

  SELECT count(*) INTO reports_today
  FROM public.parent_adviser_reports
  WHERE subject_teacher_email = NEW.subject_teacher_email
    AND subject_teacher_report_date_manila = NEW.subject_teacher_report_date_manila;

  IF reports_today >= 2 THEN
    RAISE EXCEPTION 'SUBJECT_TEACHER_DAILY_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_subject_teacher_report_daily_limit ON public.parent_adviser_reports;
CREATE TRIGGER enforce_subject_teacher_report_daily_limit
BEFORE INSERT ON public.parent_adviser_reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_subject_teacher_report_daily_limit();
