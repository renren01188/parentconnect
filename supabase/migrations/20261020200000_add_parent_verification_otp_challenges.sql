-- Server-side, one-time verification challenges for Parent signup and password
-- recovery. A challenge contains only an HMAC of the six-digit code; raw OTPs
-- are never persisted.

BEGIN;

CREATE TABLE IF NOT EXISTS public.parent_verification_otps (
  challenge_id uuid PRIMARY KEY,
  parent_id integer REFERENCES public.parents(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('signup', 'password_reset')),
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  resend_available_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_until timestamptz,
  used_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A Parent has at most one active password-reset challenge. Issuing a new
-- challenge replaces the old ID and invalidates the previous code.
CREATE UNIQUE INDEX IF NOT EXISTS parent_verification_otps_parent_purpose_unique
  ON public.parent_verification_otps (parent_id, purpose)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS parent_verification_otps_expiry_idx
  ON public.parent_verification_otps (expires_at);

CREATE OR REPLACE FUNCTION public.issue_parent_verification_otp(
  p_challenge_id uuid,
  p_parent_id integer,
  p_purpose text,
  p_channel text,
  p_otp_hash text,
  p_expires_at timestamptz,
  p_resend_available_at timestamptz,
  p_replace_existing boolean DEFAULT false
)
RETURNS TABLE (
  result text,
  expires_at timestamptz,
  resend_available_at timestamptz,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.parent_verification_otps%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_challenge_id IS NULL
    OR p_purpose NOT IN ('signup', 'password_reset')
    OR p_channel NOT IN ('email', 'sms')
    OR coalesce(btrim(p_otp_hash), '') = ''
    OR p_expires_at <= v_now
    OR p_resend_available_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Parent verification challenge.';
  END IF;
  IF (p_purpose = 'signup') <> (p_parent_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Parent verification challenge owner.';
  END IF;

  IF p_parent_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.parent_verification_otps
    WHERE challenge_id = p_challenge_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_existing
    FROM public.parent_verification_otps
    WHERE parent_id = p_parent_id
      AND purpose = p_purpose
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    IF p_parent_id IS NOT NULL
      AND v_existing.challenge_id <> p_challenge_id
      AND NOT p_replace_existing THEN
      RETURN QUERY SELECT 'stale'::text, v_existing.expires_at, v_existing.resend_available_at, 0;
      RETURN;
    END IF;
    IF v_existing.resend_available_at > v_now THEN
      RETURN QUERY SELECT
        'cooldown'::text,
        v_existing.expires_at,
        v_existing.resend_available_at,
        greatest(1, ceil(extract(epoch FROM v_existing.resend_available_at - v_now))::integer);
      RETURN;
    END IF;

    UPDATE public.parent_verification_otps
    SET challenge_id = p_challenge_id,
        parent_id = p_parent_id,
        purpose = p_purpose,
        channel = p_channel,
        otp_hash = p_otp_hash,
        expires_at = p_expires_at,
        resend_available_at = p_resend_available_at,
        attempts = 0,
        locked_until = NULL,
        used_at = NULL,
        requested_at = v_now,
        updated_at = v_now
    WHERE challenge_id = v_existing.challenge_id;
  ELSE
    INSERT INTO public.parent_verification_otps (
      challenge_id, parent_id, purpose, channel, otp_hash, expires_at, resend_available_at
    ) VALUES (
      p_challenge_id, p_parent_id, p_purpose, p_channel, p_otp_hash, p_expires_at, p_resend_available_at
    );
  END IF;

  RETURN QUERY SELECT 'issued'::text, p_expires_at, p_resend_available_at, 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_parent_verification_otp(
  p_challenge_id uuid,
  p_purpose text,
  p_otp_hash text
)
RETURNS TABLE (
  result text,
  parent_id integer,
  channel text,
  expires_at timestamptz,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_challenge public.parent_verification_otps%ROWTYPE;
  v_now timestamptz := now();
  v_attempts smallint;
  v_wait interval;
  v_locked_until timestamptz;
BEGIN
  SELECT * INTO v_challenge
  FROM public.parent_verification_otps
  WHERE challenge_id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND OR v_challenge.purpose <> p_purpose THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::integer, NULL::text, NULL::timestamptz, 0;
    RETURN;
  END IF;
  IF v_challenge.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'used'::text, v_challenge.parent_id, v_challenge.channel, v_challenge.expires_at, 0;
    RETURN;
  END IF;
  IF v_challenge.expires_at <= v_now THEN
    RETURN QUERY SELECT 'expired'::text, v_challenge.parent_id, v_challenge.channel, v_challenge.expires_at, 0;
    RETURN;
  END IF;
  IF v_challenge.locked_until IS NOT NULL AND v_challenge.locked_until > v_now THEN
    RETURN QUERY SELECT
      'locked'::text,
      v_challenge.parent_id,
      v_challenge.channel,
      v_challenge.expires_at,
      greatest(1, ceil(extract(epoch FROM v_challenge.locked_until - v_now))::integer);
    RETURN;
  END IF;
  IF v_challenge.otp_hash <> p_otp_hash THEN
    v_attempts := v_challenge.attempts + 1;
    v_wait := CASE
      WHEN v_attempts = 1 THEN interval '1 minute'
      WHEN v_attempts = 2 THEN interval '2 minutes'
      WHEN v_attempts = 3 THEN interval '3 minutes'
      ELSE interval '10 minutes'
    END;
    v_locked_until := v_now + v_wait;
    UPDATE public.parent_verification_otps
    SET attempts = v_attempts,
        locked_until = v_locked_until,
        updated_at = v_now
    WHERE challenge_id = v_challenge.challenge_id;
    RETURN QUERY SELECT
      'incorrect'::text,
      v_challenge.parent_id,
      v_challenge.channel,
      v_challenge.expires_at,
      ceil(extract(epoch FROM v_wait))::integer;
    RETURN;
  END IF;

  UPDATE public.parent_verification_otps
  SET used_at = v_now,
      locked_until = NULL,
      updated_at = v_now
  WHERE challenge_id = v_challenge.challenge_id;

  RETURN QUERY SELECT 'verified'::text, v_challenge.parent_id, v_challenge.channel, v_challenge.expires_at, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_parent_verification_otp(uuid, integer, text, text, text, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_parent_verification_otp(uuid, integer, text, text, text, timestamptz, timestamptz, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.verify_parent_verification_otp(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_parent_verification_otp(uuid, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
