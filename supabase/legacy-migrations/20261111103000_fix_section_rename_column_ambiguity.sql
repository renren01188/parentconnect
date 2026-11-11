-- Fix the section-rename routine's ambiguity with RETURNS TABLE output names.
-- In PL/pgSQL, unqualified names such as "grade" can refer to either a table
-- column or the routine's output variable. That made a staged ICT rename fail
-- before the remainder of its authorized section batch could be saved.

BEGIN;

CREATE OR REPLACE FUNCTION public.rename_section(
  p_section_id integer,
  p_grade text,
  p_old_name text,
  p_new_name text
)
RETURNS TABLE (id integer, name text, grade text, class_session text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_section public.sections%ROWTYPE;
  v_grade text := btrim(coalesce(p_grade, ''));
  v_old_name text := btrim(coalesce(p_old_name, ''));
  v_new_name text := btrim(coalesce(p_new_name, ''));
BEGIN
  IF p_section_id IS NULL OR p_section_id <= 0
    OR v_grade = '' OR v_old_name = '' OR v_new_name = '' THEN
    RAISE EXCEPTION 'SECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Lock and verify the exact original row. Qualifying every table column is
  -- required because id, name, grade, and class_session are output variables.
  SELECT section_row.* INTO v_section
  FROM public.sections AS section_row
  WHERE section_row.id = p_section_id
    AND section_row.grade = v_grade
    AND section_row.name = v_old_name
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sections AS candidate
    WHERE lower(btrim(candidate.grade)) = lower(v_grade)
      AND lower(btrim(candidate.name)) = lower(v_new_name)
      AND candidate.id <> p_section_id
  ) THEN
    RAISE EXCEPTION 'SECTION_NAME_EXISTS' USING ERRCODE = '23505';
  END IF;

  -- Keep the existing row and its class session; the students foreign key
  -- cascades the renamed canonical section assignment.
  UPDATE public.sections AS section_row
  SET name = v_new_name
  WHERE section_row.id = p_section_id
  RETURNING section_row.* INTO v_section;

  -- Update display-only section labels that are not foreign-key backed.
  UPDATE public.students AS student_row
  SET target_section = v_new_name
  WHERE student_row.target_grade = v_grade
    AND student_row.target_section = v_old_name;

  UPDATE public.advisers AS adviser_row
  SET section = CASE WHEN adviser_row.section = v_old_name THEN v_new_name ELSE adviser_row.section END,
      sections = CASE
        WHEN v_old_name = ANY(COALESCE(adviser_row.sections, '{}'::text[]))
          THEN array_replace(adviser_row.sections, v_old_name, v_new_name)
        ELSE adviser_row.sections
      END
  WHERE adviser_row.grade = v_grade
    AND (
      adviser_row.section = v_old_name
      OR v_old_name = ANY(COALESCE(adviser_row.sections, '{}'::text[]))
    );

  UPDATE public.parent_adviser_reports AS report_row
  SET section = v_new_name
  WHERE report_row.grade = v_grade
    AND report_row.section = v_old_name;

  UPDATE public.student_reports AS report_row
  SET section = v_new_name
  WHERE report_row.grade = v_grade
    AND report_row.section = v_old_name;

  UPDATE public.parent_announcement_notifications AS notification_row
  SET section = v_new_name
  WHERE notification_row.grade = v_grade
    AND notification_row.section = v_old_name;

  UPDATE public.adviser_announcements AS announcement_row
  SET sections = array_replace(announcement_row.sections, v_old_name, v_new_name)
  WHERE announcement_row.grade = v_grade
    AND v_old_name = ANY(COALESCE(announcement_row.sections, '{}'::text[]));

  UPDATE public.scheduled_adviser_transfers AS transfer_row
  SET section = v_new_name
  WHERE transfer_row.grade = v_grade
    AND transfer_row.section = v_old_name;

  RETURN QUERY
  SELECT v_section.id, v_section.name, v_section.grade, v_section.class_session;
END;
$$;

-- Preserve the server-only execution boundary documented by the original
-- rename migration when replacing the implementation.
REVOKE ALL ON FUNCTION public.rename_section(integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_section(integer, text, text, text) TO service_role;

COMMIT;
