-- Store the categories explicitly selected by a Subject Teacher. The existing
-- report type is identified from its opening message, so categories can use
-- the same values and filters as Parent reports.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_subject_teacher_report(
  p_parent_id bigint,
  p_parent_email text,
  p_parent_name text,
  p_adviser_id bigint,
  p_adviser_name text,
  p_student_id text,
  p_student_name text,
  p_grade text,
  p_section text,
  p_subject text,
  p_subject_teacher_email text,
  p_teacher_name text,
  p_concern text,
  p_submission_key uuid,
  p_categories text[],
  p_created_at timestamp with time zone DEFAULT now()
)
RETURNS public.parent_adviser_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_report public.parent_adviser_reports;
  normalized_categories text[];
BEGIN
  IF p_submission_key IS NULL THEN
    RAISE EXCEPTION 'A submission key is required.' USING ERRCODE = '22023';
  END IF;

  IF btrim(coalesce(p_concern, '')) = '' OR btrim(coalesce(p_teacher_name, '')) = '' THEN
    RAISE EXCEPTION 'A Subject Teacher name and concern are required.' USING ERRCODE = '22023';
  END IF;

  IF p_categories IS NULL OR cardinality(p_categories) = 0 OR EXISTS (
    SELECT 1
    FROM unnest(p_categories) AS submitted(category)
    WHERE category IS NULL
      OR category NOT IN (
        'Academic Concern', 'Health/Medical', 'Behavioral Issue', 'Attendance',
        'Other', 'Permission Request', 'General Inquiry'
      )
  ) THEN
    RAISE EXCEPTION 'At least one valid concern category is required.' USING ERRCODE = '22023';
  END IF;

  -- Preserve the order chosen in the form while storing each category once.
  SELECT COALESCE(array_agg(category ORDER BY first_position), ARRAY[]::text[])
  INTO normalized_categories
  FROM (
    SELECT category, MIN(position) AS first_position
    FROM unnest(p_categories) WITH ORDINALITY AS submitted(category, position)
    GROUP BY category
  ) AS distinct_categories;

  -- A retry after a completed request returns the original report before the
  -- daily-limit trigger runs. The unique index handles concurrent calls.
  SELECT *
  INTO new_report
  FROM public.parent_adviser_reports
  WHERE subject_teacher_submission_key = p_submission_key
  LIMIT 1;
  IF FOUND THEN
    RETURN new_report;
  END IF;

  BEGIN
    INSERT INTO public.parent_adviser_reports (
      parent_id, parent_email, parent_name, adviser_id, adviser_name,
      student_id, student_name, grade, section, subject, categories,
      concern_level, status, escalated_to_guidance, escalated_to_principal,
      parent_seen_at, subject_teacher_email, subject_teacher_submission_key,
      status_updated_at, updated_at, last_message_at, created_at
    ) VALUES (
      p_parent_id, p_parent_email, p_parent_name, p_adviser_id, p_adviser_name,
      p_student_id, p_student_name, p_grade, p_section, p_subject, normalized_categories,
      0, 'new', false, false,
      NULL, lower(btrim(p_subject_teacher_email)), p_submission_key,
      p_created_at, p_created_at, p_created_at, p_created_at
    ) RETURNING * INTO new_report;

    INSERT INTO public.parent_adviser_report_messages (
      report_id, sender_role, sender_name, body, thread_type, read_by_parent, read_by_adviser
    ) VALUES (
      new_report.id, 'subject_teacher', p_teacher_name, p_concern, 'adviser', false, false
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO new_report
      FROM public.parent_adviser_reports
      WHERE subject_teacher_submission_key = p_submission_key
      LIMIT 1;
      IF FOUND THEN
        RETURN new_report;
      END IF;
      RAISE;
  END;

  RETURN new_report;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, uuid, text[], timestamp with time zone
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, uuid, text[], timestamp with time zone
) TO service_role;

COMMIT;
