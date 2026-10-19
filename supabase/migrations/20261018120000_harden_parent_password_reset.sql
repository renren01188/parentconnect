-- Parent self-service password reset hardening:
-- * durable OTP storage and shared request throttling,
-- * atomic OTP consumption and password replacement, and
-- * a durable session-revocation audit marker written in the same transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS public.parent_password_reset_otps (
  parent_id bigint PRIMARY KEY REFERENCES public.parents(id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  requested_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.parent_password_reset_otps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.parent_password_reset_rate_limits (
  subject_hash text PRIMARY KEY,
  window_started_at timestamp with time zone NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.parent_password_reset_rate_limits ENABLE ROW LEVEL SECURITY;

-- Older audit schemas may predate these structured target columns. The
-- revocation check relies on them, so ensure they exist before the function
-- below starts writing its marker.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS target_id text;

CREATE OR REPLACE FUNCTION public.consume_parent_password_reset_rate_limit(
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  limiter public.parent_password_reset_rate_limits%ROWTYPE;
  remaining_seconds integer;
BEGIN
  IF p_subject_hash !~ '^[a-f0-9]{64}$'
    OR p_limit < 1 OR p_limit > 20
    OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid password-reset rate-limit request.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO limiter
  FROM public.parent_password_reset_rate_limits
  WHERE subject_hash = p_subject_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.parent_password_reset_rate_limits (subject_hash, window_started_at, request_count)
    VALUES (p_subject_hash, now(), 1);
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  IF limiter.window_started_at + make_interval(secs => p_window_seconds) <= now() THEN
    UPDATE public.parent_password_reset_rate_limits
    SET window_started_at = now(), request_count = 1
    WHERE subject_hash = p_subject_hash;
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  remaining_seconds := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (limiter.window_started_at + make_interval(secs => p_window_seconds) - now())))::integer
  );
  IF limiter.request_count >= p_limit THEN
    RETURN QUERY SELECT false, remaining_seconds;
    RETURN;
  END IF;

  UPDATE public.parent_password_reset_rate_limits
  SET request_count = request_count + 1
  WHERE subject_hash = p_subject_hash;
  RETURN QUERY SELECT true, remaining_seconds;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_parent_password_with_otp(
  p_parent_id bigint,
  p_otp_hash text,
  p_password_hash text,
  p_parent_name text,
  p_parent_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  otp_record public.parent_password_reset_otps%ROWTYPE;
  updated_rows integer;
BEGIN
  IF p_parent_id IS NULL
    OR coalesce(btrim(p_otp_hash), '') = ''
    OR coalesce(btrim(p_password_hash), '') = '' THEN
    RAISE EXCEPTION 'Invalid password-reset request.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO otp_record
  FROM public.parent_password_reset_otps
  WHERE parent_id = p_parent_id
  FOR UPDATE;

  IF NOT FOUND
    OR otp_record.expires_at <= now()
    OR otp_record.attempts >= 5 THEN
    RETURN false;
  END IF;

  IF otp_record.otp_hash <> p_otp_hash THEN
    UPDATE public.parent_password_reset_otps
    SET attempts = LEAST(attempts + 1, 5)
    WHERE parent_id = p_parent_id;
    RETURN false;
  END IF;

  UPDATE public.parents
  SET password = p_password_hash,
      -- The existing deployments use either a boolean or integer flag. The
      -- unknown literal is coerced by PostgreSQL to the column's real type.
      password_set = '1',
      temp_password = NULL,
      temporary_password_expires_at = NULL,
      reset_token = NULL,
      reset_token_expiry = NULL
  WHERE id = p_parent_id
    AND lower(coalesce(password_set::text, '')) IN ('1', 'true');
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RETURN false;
  END IF;

  -- This marker and the password replacement commit together. Middleware and
  -- protected APIs reject every token issued at or before this timestamp.
  INSERT INTO public.audit_log (
    action, performed_by, performed_by_role,
    target_user, target_role, target_email, target_type, target_id,
    module, details
  ) VALUES (
    'Password Session Revoked', p_parent_name, 'Parent',
    p_parent_name, 'Parent', p_parent_email, 'user', p_parent_id::text,
    'Auth', 'Password reset completed after email OTP verification; all earlier sessions were revoked.'
  );

  DELETE FROM public.parent_password_reset_otps
  WHERE parent_id = p_parent_id
    AND otp_hash = otp_record.otp_hash;

  RETURN true;
END;
$$;

REVOKE ALL ON TABLE public.parent_password_reset_otps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.parent_password_reset_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_parent_password_reset_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_parent_password_reset_rate_limit(text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.reset_parent_password_with_otp(bigint, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_parent_password_with_otp(bigint, text, text, text, text) TO service_role;

COMMIT;
