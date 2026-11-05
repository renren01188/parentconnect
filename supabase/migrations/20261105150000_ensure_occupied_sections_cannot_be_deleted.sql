-- Keep the section-occupancy safeguard under source control. The function and
-- trigger already protect existing deployments; this forward migration is
-- idempotent so environments that missed the original migration receive the
-- same protection without changing any student, account, or Adviser record.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_occupied_section_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_student_count integer;
BEGIN
  SELECT count(*)::integer
  INTO active_student_count
  FROM public.students AS student
  WHERE student.grade = OLD.grade
    AND student.section = OLD.name
    AND lower(coalesce(student.archive_status, 'active')) NOT IN ('archived', 'deleted');

  IF active_student_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = format(
        'Cannot delete section "%s" for %s: %s student(s) are still assigned. Remove or reassign them first.',
        OLD.name,
        OLD.grade,
        active_student_count
      );
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sections_prevent_occupied_delete ON public.sections;

CREATE TRIGGER sections_prevent_occupied_delete
BEFORE DELETE ON public.sections
FOR EACH ROW
EXECUTE FUNCTION public.prevent_occupied_section_deletion();

COMMIT;
