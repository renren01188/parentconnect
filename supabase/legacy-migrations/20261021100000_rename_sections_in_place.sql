-- Rename a section as an in-place update.  The sections.id value remains
-- stable, and all records that display a denormalized section name are kept
-- in sync in the same transaction.

BEGIN;

-- The existing relationship is keyed by (name, grade), so a rename must
-- cascade to enrolled students instead of forcing a delete/recreate flow.
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_section_grade_fk;

ALTER TABLE public.students
  ADD CONSTRAINT students_section_grade_fk
  FOREIGN KEY (section, grade)
  REFERENCES public.sections(name, grade)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

-- The API normalizes names for presentation, but this index makes the
-- duplicate-name rule authoritative even when two saves race or differ only
-- by letter casing.
CREATE UNIQUE INDEX IF NOT EXISTS sections_grade_name_case_insensitive_key
  ON public.sections (lower(btrim(grade)), lower(btrim(name)));

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

  -- Lock and verify the exact original row. This ensures the caller never
  -- renames a stale row or a different section with the same display name.
  SELECT * INTO v_section
  FROM public.sections
  WHERE sections.id = p_section_id
    AND sections.grade = v_grade
    AND sections.name = v_old_name
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

  -- This updates the original record rather than inserting one. Its id and
  -- class_session therefore remain unchanged; enrolled student assignments
  -- update through students_section_grade_fk's ON UPDATE CASCADE rule.
  UPDATE public.sections
  SET name = v_new_name
  WHERE sections.id = p_section_id
  RETURNING * INTO v_section;

  -- These fields are display copies rather than foreign keys. Keeping them
  -- synchronized means the renamed section is immediately shown everywhere
  -- the system still stores its label.
  UPDATE public.students
  SET target_section = v_new_name
  WHERE target_grade = v_grade
    AND target_section = v_old_name;

  UPDATE public.advisers
  SET section = CASE WHEN section = v_old_name THEN v_new_name ELSE section END,
      sections = CASE
        WHEN v_old_name = ANY(COALESCE(sections, '{}'::text[]))
          THEN array_replace(sections, v_old_name, v_new_name)
        ELSE sections
      END
  WHERE grade = v_grade
    AND (
      section = v_old_name
      OR v_old_name = ANY(COALESCE(sections, '{}'::text[]))
    );

  UPDATE public.parent_adviser_reports
  SET section = v_new_name
  WHERE grade = v_grade
    AND section = v_old_name;

  UPDATE public.student_reports
  SET section = v_new_name
  WHERE grade = v_grade
    AND section = v_old_name;

  UPDATE public.parent_announcement_notifications
  SET section = v_new_name
  WHERE grade = v_grade
    AND section = v_old_name;

  UPDATE public.adviser_announcements
  SET sections = array_replace(sections, v_old_name, v_new_name)
  WHERE grade = v_grade
    AND v_old_name = ANY(COALESCE(sections, '{}'::text[]));

  UPDATE public.scheduled_adviser_transfers
  SET section = v_new_name
  WHERE grade = v_grade
    AND section = v_old_name;

  RETURN QUERY
  SELECT v_section.id, v_section.name, v_section.grade, v_section.class_session;
END;
$$;

-- A modal can stage more than one rename. Run them as one statement so a
-- duplicate or stale section rolls back every rename in that authorization.
CREATE OR REPLACE FUNCTION public.rename_sections(p_renames jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rename jsonb;
BEGIN
  IF jsonb_typeof(p_renames) <> 'array' THEN
    RAISE EXCEPTION 'SECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR v_rename IN SELECT value FROM jsonb_array_elements(p_renames)
  LOOP
    PERFORM public.rename_section(
      (v_rename ->> 'id')::integer,
      v_rename ->> 'grade',
      v_rename ->> 'old_name',
      v_rename ->> 'new_name'
    );
  END LOOP;
END;
$$;

-- Only server-side calls authenticated with the service role may invoke this
-- data-wide synchronization function. The API separately verifies the ICT
-- administrator's password before calling it.
REVOKE ALL ON FUNCTION public.rename_section(integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_section(integer, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.rename_sections(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_sections(jsonb) TO service_role;

COMMIT;
