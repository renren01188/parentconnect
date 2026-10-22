-- Use the same neutral greeting for both RFID Time In and Time Out SMS
-- messages. The database trigger is retained because some deployments create
-- attendance SMS jobs there before the application worker runs.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_attendance_sms_job_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  attendance_type text;
  attendance_date date;
  attendance_time time;
  student_name text;
BEGIN
  SELECT
    attendance_log.type,
    attendance_log.attendance_date::date,
    attendance_log.time_logged::time,
    concat_ws(
      ' ',
      nullif(btrim(student.first_name), ''),
      nullif(btrim(coalesce(student.middle_name, '')), ''),
      nullif(btrim(student.last_name), ''),
      nullif(btrim(coalesce(student.suffix, '')), '')
    )
  INTO attendance_type, attendance_date, attendance_time, student_name
  FROM public.attendance_logs AS attendance_log
  INNER JOIN public.students AS student
    ON student.id = attendance_log.student_db_id
  WHERE attendance_log.id = NEW.attendance_log_id;

  IF NOT FOUND OR attendance_type NOT IN ('Time In', 'Time Out') THEN
    RETURN NEW;
  END IF;

  NEW.message := concat(
    'PConnect: Good Day! ',
    student_name,
    CASE
      WHEN attendance_type = 'Time Out' THEN ' scanned their RFID tag upon leaving the classroom on '
      ELSE ' scanned their RFID tag upon entering the classroom on '
    END,
    btrim(to_char(attendance_date, 'Month')),
    ' ',
    extract(day FROM attendance_date)::integer,
    ', ',
    extract(year FROM attendance_date)::integer,
    ', at ',
    to_char(attendance_time, 'FMHH12:MI AM'),
    '.'
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.attendance_sms_jobs') IS NULL
    OR to_regclass('public.attendance_logs') IS NULL
    OR to_regclass('public.students') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS attendance_sms_jobs_template_guard ON public.attendance_sms_jobs';
  EXECUTE 'CREATE TRIGGER attendance_sms_jobs_template_guard
    BEFORE INSERT OR UPDATE OF attendance_log_id, message ON public.attendance_sms_jobs
    FOR EACH ROW EXECUTE FUNCTION public.normalize_attendance_sms_job_message()';

  -- Refresh only jobs that have not yet been delivered. Sent SMS messages
  -- remain immutable and this migration never requeues or resends them.
  UPDATE public.attendance_sms_jobs AS sms_job
  SET message = sms_job.message
  FROM public.attendance_logs AS attendance_log
  WHERE sms_job.attendance_log_id = attendance_log.id
    AND sms_job.status = 'pending'
    AND attendance_log.type IN ('Time In', 'Time Out');
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_attendance_sms_job_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_attendance_sms_job_message() TO service_role;

COMMIT;
