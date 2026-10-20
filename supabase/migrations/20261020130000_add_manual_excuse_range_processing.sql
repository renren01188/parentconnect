-- A manual Adviser excuse is an adviser-originated excuse-letter record that
-- is immediately approved through the same decision function as the Adviser
-- Approval modal. Its reason and requested range remain durable in
-- public.excuse_letters.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.excuse_letters') IS NULL THEN
    RAISE EXCEPTION 'public.excuse_letters is required before manual excuses can be recorded';
  END IF;

  -- A manually entered excuse belongs to an Adviser rather than a Parent.
  -- Parent-originated rows retain their existing parent_id and default source.
  ALTER TABLE public.excuse_letters
    ALTER COLUMN parent_id DROP NOT NULL;

  ALTER TABLE public.excuse_letters
    ADD COLUMN IF NOT EXISTS submitted_by_role text,
    ADD COLUMN IF NOT EXISTS submitted_by_id bigint;

  UPDATE public.excuse_letters
  SET submitted_by_role = 'Parent'
  WHERE submitted_by_role IS NULL;

  ALTER TABLE public.excuse_letters
    ALTER COLUMN submitted_by_role SET DEFAULT 'Parent',
    ALTER COLUMN submitted_by_role SET NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_manual_excuse(
  p_student_id text,
  p_adviser_id bigint,
  p_date_from date,
  p_date_to date,
  p_reason text
)
RETURNS TABLE (
  excuse_letter_id bigint,
  student_db_id bigint,
  student_id text,
  date_from date,
  date_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_school_year public.school_year_config%ROWTYPE;
  v_excuse_letter_id bigint;
  v_reason text;
BEGIN
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF nullif(btrim(coalesce(p_student_id, '')), '') IS NULL
    OR p_adviser_id IS NULL
    OR p_date_from IS NULL
    OR p_date_to IS NULL
    OR v_reason IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Student, reason, start date, and end date are required.';
  END IF;
  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'End date cannot be before start date.';
  END IF;

  SELECT student.*
  INTO v_student
  FROM public.students AS student
  WHERE student.student_id = btrim(p_student_id)
    AND coalesce(student.archive_status, 'active') = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Student not found.';
  END IF;

  PERFORM 1
  FROM public.advisers AS adviser
  WHERE adviser.id = p_adviser_id
    AND adviser.grade = v_student.grade
    AND (
      adviser.section = v_student.section
      OR v_student.section = ANY(coalesce(adviser.sections, ARRAY[]::text[]))
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Student is not assigned to this adviser.';
  END IF;

  SELECT school_year.*
  INTO v_school_year
  FROM public.school_year_config AS school_year
  WHERE school_year.is_active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'An active school year is required before recording an excuse.';
  END IF;
  IF p_date_from < v_school_year.start_date OR p_date_to > v_school_year.end_date THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format(
        'Excuse dates must fall within the active school year (%s to %s).',
        v_school_year.start_date,
        v_school_year.end_date
      );
  END IF;

  -- Repeating the same save is idempotent: return the original manual
  -- excuse and do not create another letter or attendance row.
  SELECT excuse_letter.id
  INTO v_excuse_letter_id
  FROM public.excuse_letters AS excuse_letter
  WHERE excuse_letter.student_id = v_student.student_id
    AND excuse_letter.status = 'Approved'
    AND excuse_letter.date_from = p_date_from
    AND excuse_letter.date_to = p_date_to
    AND excuse_letter.message = v_reason
    AND excuse_letter.submitted_by_role = 'Adviser'
    AND excuse_letter.submitted_by_id = p_adviser_id
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_excuse_letter_id, v_student.id, v_student.student_id, p_date_from, p_date_to;
    RETURN;
  END IF;

  INSERT INTO public.excuse_letters (
    student_id,
    parent_id,
    date_from,
    date_to,
    message,
    status,
    submitted_by_role,
    submitted_by_id
  ) VALUES (
    v_student.student_id,
    NULL,
    p_date_from,
    p_date_to,
    v_reason,
    'Pending',
    'Adviser',
    p_adviser_id
  )
  RETURNING id INTO v_excuse_letter_id;

  -- Use the exact decision routine from the Adviser Approval modal. This
  -- applies the configured weekday range, holidays, session assignment,
  -- existing-absence replacement, and no-duplicate safeguards in one place.
  PERFORM public.decide_excuse_letter(
    v_excuse_letter_id,
    p_adviser_id,
    'Approved',
    NULL
  );

  RETURN QUERY SELECT v_excuse_letter_id, v_student.id, v_student.student_id, p_date_from, p_date_to;
END;
$$;

REVOKE ALL ON FUNCTION public.record_manual_excuse(text, bigint, date, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_excuse(text, bigint, date, date, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
