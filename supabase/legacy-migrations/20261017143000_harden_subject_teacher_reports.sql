-- Subject Teacher report hardening:
-- 1. consume OTP attempts under a row lock,
-- 2. restrict SECURITY DEFINER RPCs to the server's service role, and
-- 3. make a browser retry idempotent at the database boundary.

BEGIN;

ALTER TABLE public.parent_adviser_reports
  ADD COLUMN IF NOT EXISTS subject_teacher_submission_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS parent_adviser_reports_subject_teacher_submission_key_idx
  ON public.parent_adviser_reports (subject_teacher_submission_key)
  WHERE subject_teacher_submission_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.consume_subject_teacher_report_otp(
  p_email text,
  p_otp_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  otp_record public.subject_teacher_report_otps%ROWTYPE;
BEGIN
  SELECT *
  INTO otp_record
  FROM public.subject_teacher_report_otps
  WHERE email = lower(btrim(p_email))
  FOR UPDATE;

  IF NOT FOUND
    OR otp_record.expires_at <= now()
    OR otp_record.attempts >= 5 THEN
    RETURN false;
  END IF;

  IF otp_record.otp_hash <> p_otp_hash THEN
    UPDATE public.subject_teacher_report_otps
    SET attempts = LEAST(attempts + 1, 5)
    WHERE email = otp_record.email;
    RETURN false;
  END IF;

  DELETE FROM public.subject_teacher_report_otps
  WHERE email = otp_record.email
    AND otp_hash = otp_record.otp_hash
    AND expires_at > now()
    AND attempts < 5;

  RETURN FOUND;
END;
$$;

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
  p_created_at timestamp with time zone DEFAULT now()
)
RETURNS public.parent_adviser_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_report public.parent_adviser_reports;
BEGIN
  IF p_submission_key IS NULL THEN
    RAISE EXCEPTION 'A submission key is required.' USING ERRCODE = '22023';
  END IF;

  IF btrim(coalesce(p_concern, '')) = '' OR btrim(coalesce(p_teacher_name, '')) = '' THEN
    RAISE EXCEPTION 'A Subject Teacher name and concern are required.' USING ERRCODE = '22023';
  END IF;

  -- A retry after a completed request returns the original report before the
  -- daily-limit trigger runs. The unique index below handles concurrent calls.
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
      p_student_id, p_student_name, p_grade, p_section, p_subject, ARRAY['Subject Teacher'],
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

REVOKE ALL ON FUNCTION public.consume_subject_teacher_report_otp(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_subject_teacher_report_otp(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, timestamp with time zone
) TO service_role;

REVOKE ALL ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, uuid, timestamp with time zone
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_subject_teacher_report(
  bigint, text, text, bigint, text, text, text, text, text, text, text, text, text, uuid, timestamp with time zone
) TO service_role;

COMMIT;
