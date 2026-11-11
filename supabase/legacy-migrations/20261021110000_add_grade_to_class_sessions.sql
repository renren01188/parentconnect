-- Keep daily attendance-session snapshots per grade level. Existing session
-- and attendance rows remain in place. Attendance logs are moved from the
-- former date/type relationship to the immutable class_sessions.id instead.

BEGIN;

ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS grade text;

-- Preserve the existing attendance-log relationship before the old
-- (session_date, session_type) unique indexes are removed. A session ID is
-- immutable, so past attendance remains connected to its original snapshot
-- even if a student later changes grade level.
ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS class_session_id integer;

UPDATE public.attendance_logs AS attendance_log
SET class_session_id = class_session.id
FROM public.class_sessions AS class_session
WHERE attendance_log.class_session_id IS NULL
  AND class_session.session_date = attendance_log.attendance_date
  AND class_session.session_type = attendance_log.session_type;

-- The old FK depends on the old school-wide unique index. Replace it with an
-- ID-based FK rather than using CASCADE, which would remove the attendance
-- relationship we need to preserve.
ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_class_session_fk;

ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_class_session_id_fk;

ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_class_session_id_fk
  FOREIGN KEY (class_session_id)
  REFERENCES public.class_sessions (id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

DROP INDEX IF EXISTS public.class_sessions_date_type_idx;
DROP INDEX IF EXISTS public.class_sessions_date_type_unique;

-- A Grade 2 save can now coexist with Grade 1 for the same date/session.
CREATE UNIQUE INDEX IF NOT EXISTS class_sessions_date_type_grade_unique
  ON public.class_sessions (session_date, session_type, grade);

CREATE INDEX IF NOT EXISTS class_sessions_grade_date_type_idx
  ON public.class_sessions (grade, session_date DESC, session_type);

CREATE INDEX IF NOT EXISTS attendance_logs_class_session_id_idx
  ON public.attendance_logs (class_session_id);

-- All new attendance writes resolve the student's grade and select that
-- grade's snapshot first. Legacy grade-null rows remain an intentional
-- fallback only until ICT saves a schedule for that grade.
CREATE OR REPLACE FUNCTION public.assign_attendance_class_session()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_student_grade text;
  v_session_grade text;
  v_session_date date;
  v_session_type text;
  v_session_start time;
BEGIN
  IF NEW.student_db_id IS NOT NULL THEN
    SELECT grade
    INTO v_student_grade
    FROM public.students
    WHERE id = NEW.student_db_id;
  END IF;

  IF NEW.class_session_id IS NULL THEN
    SELECT id, grade, session_date, session_type, scheduled_start
    INTO NEW.class_session_id, v_session_grade, v_session_date, v_session_type, v_session_start
    FROM public.class_sessions
    WHERE session_date = NEW.attendance_date
      AND session_type = NEW.session_type
      AND (grade = v_student_grade OR grade IS NULL)
    ORDER BY CASE WHEN grade = v_student_grade THEN 0 ELSE 1 END
    LIMIT 1;
  ELSE
    SELECT grade, session_date, session_type, scheduled_start
    INTO v_session_grade, v_session_date, v_session_type, v_session_start
    FROM public.class_sessions
    WHERE id = NEW.class_session_id;
  END IF;

  IF NEW.class_session_id IS NOT NULL THEN
    IF v_session_date <> NEW.attendance_date OR v_session_type <> NEW.session_type THEN
      RAISE EXCEPTION 'Attendance log session does not match its date and session type.'
        USING ERRCODE = '23514';
    END IF;
    IF v_session_grade IS NOT NULL
      AND v_student_grade IS NOT NULL
      AND v_session_grade <> v_student_grade THEN
      RAISE EXCEPTION 'Attendance log session grade does not match the student grade.'
        USING ERRCODE = '23514';
    END IF;
    -- Approved excuses are server-side inserts. Ensure their displayed time
    -- comes from the same grade-specific session as the attendance record.
    IF NEW.status = 'Excused' AND NEW.via = 'Manual' THEN
      NEW.time_logged := v_session_start;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_attendance_class_session_trigger
  ON public.attendance_logs;

CREATE TRIGGER assign_attendance_class_session_trigger
BEFORE INSERT OR UPDATE OF attendance_date, session_type, student_db_id, class_session_id
ON public.attendance_logs
FOR EACH ROW
EXECUTE FUNCTION public.assign_attendance_class_session();

COMMIT;
