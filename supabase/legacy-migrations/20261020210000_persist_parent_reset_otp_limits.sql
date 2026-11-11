-- Password-reset delivery and failed-code limits belong to the durable Parent
-- account challenge, never to a browser cookie, page, email address, or SMS
-- number.  A fresh request therefore cannot replace a challenge while it is
-- still in a resend or failed-attempt cooldown.

BEGIN;

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
    -- Check the failed-code lock before accepting a different email/SMS
    -- request. This survives refreshes, new browser sessions, and switches.
    IF v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
      RETURN QUERY SELECT
        'locked'::text,
        v_existing.expires_at,
        v_existing.resend_available_at,
        greatest(1, ceil(extract(epoch FROM v_existing.locked_until - v_now))::integer);
      RETURN;
    END IF;
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

REVOKE ALL ON FUNCTION public.issue_parent_verification_otp(uuid, integer, text, text, text, timestamptz, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_parent_verification_otp(uuid, integer, text, text, text, timestamptz, timestamptz, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
