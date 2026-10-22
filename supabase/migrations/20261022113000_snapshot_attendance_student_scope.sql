-- Attendance history must remain tied to the class the student belonged to
-- when the event was recorded. Current student assignments can change after a
-- transfer or an ICT class-session update, so they are not a reliable source
-- for a historical Adviser view.

BEGIN;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS student_grade_snapshot text,
  ADD COLUMN IF NOT EXISTS student_section_snapshot text;

-- Best available scope for pre-existing attendance. New rows use the trigger
-- below and therefore retain their original grade/section permanently.
UPDATE public.attendance_logs AS attendance_log
SET
  student_grade_snapshot = COALESCE(
    attendance_log.student_grade_snapshot,
    (SELECT grade FROM public.class_sessions WHERE id = attendance_log.class_session_id),
    student.grade
  ),
  student_section_snapshot = COALESCE(attendance_log.student_section_snapshot, student.section)
FROM public.students AS student
WHERE attendance_log.student_db_id = student.id
  AND (
    attendance_log.student_grade_snapshot IS NULL
    OR attendance_log.student_section_snapshot IS NULL
  );

CREATE OR REPLACE FUNCTION public.capture_attendance_student_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF NEW.student_db_id IS NOT NULL
    AND (NEW.student_grade_snapshot IS NULL OR NEW.student_section_snapshot IS NULL) THEN
    SELECT
      COALESCE(NEW.student_grade_snapshot, grade),
      COALESCE(NEW.student_section_snapshot, section)
    INTO NEW.student_grade_snapshot, NEW.student_section_snapshot
    FROM public.students
    WHERE id = NEW.student_db_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_attendance_student_scope_trigger
  ON public.attendance_logs;

CREATE TRIGGER capture_attendance_student_scope_trigger
BEFORE INSERT ON public.attendance_logs
FOR EACH ROW
EXECUTE FUNCTION public.capture_attendance_student_scope();

CREATE INDEX IF NOT EXISTS attendance_logs_history_scope_idx
  ON public.attendance_logs (attendance_date, student_grade_snapshot, student_section_snapshot);

COMMIT;
