-- The application is the source of truth for new RFID SMS templates. Some
-- older deployments may already have pending queue rows produced by a legacy
-- database trigger, so update only those unsent rows during rollout.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.attendance_sms_job') IS NULL
    OR to_regclass('public.attendance_logs') IS NULL
    OR to_regclass('public.students') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.attendance_sms_job AS sms_job
  SET message = concat(
    CASE
      WHEN attendance_log.type = 'Time Out' THEN 'PConnect: Good Afternoon! '
      ELSE 'PConnect: Good Morning! '
    END,
    concat_ws(
      ' ',
      nullif(btrim(student.first_name), ''),
      nullif(btrim(coalesce(student.middle_name, '')), ''),
      nullif(btrim(student.last_name), ''),
      nullif(btrim(coalesce(student.suffix, '')), '')
    ),
    CASE
      WHEN attendance_log.type = 'Time Out' THEN ' scanned their RFID tag upon leaving the classroom on '
      ELSE ' scanned their RFID tag upon entering the classroom on '
    END,
    btrim(to_char(attendance_log.attendance_date::date, 'Month')),
    ' ',
    extract(day FROM attendance_log.attendance_date::date)::integer,
    ', ',
    extract(year FROM attendance_log.attendance_date::date)::integer,
    ', at ',
    to_char(attendance_log.time_logged::time, 'FMHH12:MI AM'),
    '.'
  )
  FROM public.attendance_logs AS attendance_log
  INNER JOIN public.students AS student
    ON student.id = attendance_log.student_db_id
  WHERE sms_job.attendance_log_id = attendance_log.id
    AND sms_job.status = 'pending'
    AND attendance_log.type IN ('Time In', 'Time Out');
END;
$$;

COMMIT;
