-- Subject Teacher reports are opening messages in the existing Parent <-> Adviser
-- conversation model. The old check constraint rejected that sender role after
-- the report header had already been saved, leaving a blank report.
ALTER TABLE public.parent_adviser_report_messages
  DROP CONSTRAINT IF EXISTS parent_adviser_report_messages_sender_role_check;

ALTER TABLE public.parent_adviser_report_messages
  ADD CONSTRAINT parent_adviser_report_messages_sender_role_check
  CHECK (sender_role IN ('parent', 'adviser', 'principal', 'guidance', 'subject_teacher'));

-- Create the report header and its original Subject Teacher message as one
-- database transaction. A failed message can no longer leave an orphan header.
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
  p_created_at timestamptz DEFAULT now()
)
RETURNS public.parent_adviser_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_report public.parent_adviser_reports;
BEGIN
  IF btrim(coalesce(p_concern, '')) = '' OR btrim(coalesce(p_teacher_name, '')) = '' THEN
    RAISE EXCEPTION 'A Subject Teacher name and concern are required.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.parent_adviser_reports (
    parent_id, parent_email, parent_name, adviser_id, adviser_name,
    student_id, student_name, grade, section, subject, categories,
    concern_level, status, escalated_to_guidance, escalated_to_principal,
    parent_seen_at, subject_teacher_email, status_updated_at, updated_at,
    last_message_at, created_at
  ) VALUES (
    p_parent_id, p_parent_email, p_parent_name, p_adviser_id, p_adviser_name,
    p_student_id, p_student_name, p_grade, p_section, p_subject, ARRAY['Subject Teacher'],
    0, 'new', false, false,
    NULL, lower(btrim(p_subject_teacher_email)), p_created_at, p_created_at,
    p_created_at, p_created_at
  ) RETURNING * INTO new_report;

  INSERT INTO public.parent_adviser_report_messages (
    report_id, sender_role, sender_name, body, thread_type, read_by_parent, read_by_adviser
  ) VALUES (
    new_report.id, 'subject_teacher', p_teacher_name, p_concern, 'adviser', false, false
  );

  RETURN new_report;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, timestamptz
) TO service_role;
