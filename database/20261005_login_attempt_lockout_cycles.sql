-- Login lockout batches for all protected roles.
--
-- This is an in-place upgrade: it changes only the shared RPC definitions,
-- retains existing guard rows, and does not read or alter account records.
-- PostgreSQL's `now()` and existing advisory transaction locks remain the
-- authority, so refreshes and client clock changes cannot bypass a lock.

CREATE OR REPLACE FUNCTION public.get_login_attempt_guard_v2(
  p_role text,
  p_account_hash text,
  p_ip_hash text
)
RETURNS TABLE(
  failed_attempts integer,
  lockout_level integer,
  locked_until timestamptz,
  captcha_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  account_guard public.login_attempt_guards%ROWTYPE;
  ip_guard public.login_attempt_guards%ROWTYPE;
  account_attempts integer := 0;
  ip_attempts integer := 0;
  account_level integer := 0;
  ip_level integer := 0;
  current_lock timestamptz;
BEGIN
  IF p_role NOT IN ('parent', 'adviser', 'guidance', 'principal', 'ict')
    OR p_account_hash !~ '^[0-9a-f]{64}$'
    OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login guard parameters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':account:' || p_account_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':ip:' || p_ip_hash, 0));

  SELECT * INTO account_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'account' AND subject_hash = p_account_hash
  FOR UPDATE;

  SELECT * INTO ip_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'ip' AND subject_hash = p_ip_hash
  FOR UPDATE;

  -- An expired lock starts a fresh five-attempt batch. The level is retained:
  -- level 1 is the original 10-minute lock; level 2 is every later 20-minute
  -- lock. This writes the reset atomically for status checks and page reloads.
  IF account_guard.locked_until IS NOT NULL AND account_guard.locked_until <= now() THEN
    account_guard.failed_attempts := 0;
    account_guard.locked_until := NULL;
    UPDATE public.login_attempt_guards
    SET failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE role = p_role AND scope = 'account' AND subject_hash = p_account_hash;
  END IF;
  IF ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until <= now() THEN
    ip_guard.failed_attempts := 0;
    ip_guard.locked_until := NULL;
    UPDATE public.login_attempt_guards
    SET failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE role = p_role AND scope = 'ip' AND subject_hash = p_ip_hash;
  END IF;

  -- Retain the established quiet-period behavior for the next lock duration.
  IF account_guard.last_failed_at IS NOT NULL
    AND account_guard.last_failed_at <= now() - interval '24 hours' THEN
    account_guard.lockout_level := 0;
    account_guard.locked_until := NULL;
  END IF;
  IF ip_guard.last_failed_at IS NOT NULL
    AND ip_guard.last_failed_at <= now() - interval '24 hours' THEN
    ip_guard.lockout_level := 0;
    ip_guard.locked_until := NULL;
  END IF;

  account_attempts := COALESCE(account_guard.failed_attempts, 0);
  ip_attempts := COALESCE(ip_guard.failed_attempts, 0);
  account_level := COALESCE(account_guard.lockout_level, 0);
  ip_level := COALESCE(ip_guard.lockout_level, 0);
  current_lock := CASE
    WHEN account_guard.locked_until IS NULL THEN ip_guard.locked_until
    WHEN ip_guard.locked_until IS NULL THEN account_guard.locked_until
    ELSE GREATEST(account_guard.locked_until, ip_guard.locked_until)
  END;

  RETURN QUERY SELECT
    GREATEST(account_attempts, ip_attempts),
    GREATEST(account_level, ip_level),
    current_lock,
    account_attempts >= 3 OR ip_attempts >= 3;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_failed_login_attempt_v2(
  p_role text,
  p_account_hash text,
  p_ip_hash text
)
RETURNS TABLE(
  failed_attempts integer,
  lockout_level integer,
  locked_until timestamptz,
  captcha_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  account_guard public.login_attempt_guards%ROWTYPE;
  ip_guard public.login_attempt_guards%ROWTYPE;
  account_attempts integer := 0;
  ip_attempts integer := 0;
  account_level integer := 0;
  ip_level integer := 0;
  account_lock timestamptz;
  ip_lock timestamptz;
  current_lock timestamptz;
BEGIN
  IF p_role NOT IN ('parent', 'adviser', 'guidance', 'principal', 'ict')
    OR p_account_hash !~ '^[0-9a-f]{64}$'
    OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login guard parameters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':account:' || p_account_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':ip:' || p_ip_hash, 0));

  SELECT * INTO account_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'account' AND subject_hash = p_account_hash
  FOR UPDATE;

  SELECT * INTO ip_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'ip' AND subject_hash = p_ip_hash
  FOR UPDATE;

  -- A new failure after an expired lock is the first of a new batch. This is
  -- intentionally evaluated with database time before checking for a lock.
  IF account_guard.locked_until IS NOT NULL AND account_guard.locked_until <= now() THEN
    account_guard.failed_attempts := 0;
    account_guard.locked_until := NULL;
  END IF;
  IF ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until <= now() THEN
    ip_guard.failed_attempts := 0;
    ip_guard.locked_until := NULL;
  END IF;

  IF account_guard.last_failed_at IS NOT NULL
    AND account_guard.last_failed_at <= now() - interval '24 hours' THEN
    account_guard.lockout_level := 0;
    account_guard.locked_until := NULL;
  END IF;
  IF ip_guard.last_failed_at IS NOT NULL
    AND ip_guard.last_failed_at <= now() - interval '24 hours' THEN
    ip_guard.lockout_level := 0;
    ip_guard.locked_until := NULL;
  END IF;

  IF (account_guard.locked_until IS NOT NULL AND account_guard.locked_until > now())
    OR (ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until > now()) THEN
    current_lock := CASE
      WHEN account_guard.locked_until IS NULL THEN ip_guard.locked_until
      WHEN ip_guard.locked_until IS NULL THEN account_guard.locked_until
      ELSE GREATEST(account_guard.locked_until, ip_guard.locked_until)
    END;
    RETURN QUERY SELECT
      GREATEST(COALESCE(account_guard.failed_attempts, 0), COALESCE(ip_guard.failed_attempts, 0)),
      GREATEST(COALESCE(account_guard.lockout_level, 0), COALESCE(ip_guard.lockout_level, 0)),
      current_lock,
      true;
    RETURN;
  END IF;

  account_attempts := COALESCE(account_guard.failed_attempts, 0) + 1;
  ip_attempts := COALESCE(ip_guard.failed_attempts, 0) + 1;
  account_level := CASE
    WHEN account_attempts >= 5 THEN
      CASE WHEN COALESCE(account_guard.lockout_level, 0) >= 1 THEN 2 ELSE 1 END
    ELSE COALESCE(account_guard.lockout_level, 0)
  END;
  ip_level := CASE
    WHEN ip_attempts >= 5 THEN
      CASE WHEN COALESCE(ip_guard.lockout_level, 0) >= 1 THEN 2 ELSE 1 END
    ELSE COALESCE(ip_guard.lockout_level, 0)
  END;
  account_lock := CASE
    WHEN account_attempts >= 5 THEN now() + make_interval(mins => account_level * 10)
    ELSE NULL
  END;
  ip_lock := CASE
    WHEN ip_attempts >= 5 THEN now() + make_interval(mins => ip_level * 10)
    ELSE NULL
  END;

  INSERT INTO public.login_attempt_guards(
    role, scope, subject_hash, failed_attempts, lockout_level, locked_until, updated_at, last_failed_at
  ) VALUES
    (p_role, 'account', p_account_hash, account_attempts, account_level, account_lock, now(), now()),
    (p_role, 'ip', p_ip_hash, ip_attempts, ip_level, ip_lock, now(), now())
  ON CONFLICT (role, scope, subject_hash) DO UPDATE
  SET failed_attempts = EXCLUDED.failed_attempts,
      lockout_level = EXCLUDED.lockout_level,
      locked_until = EXCLUDED.locked_until,
      updated_at = EXCLUDED.updated_at,
      last_failed_at = EXCLUDED.last_failed_at;

  current_lock := CASE
    WHEN account_lock IS NULL THEN ip_lock
    WHEN ip_lock IS NULL THEN account_lock
    ELSE GREATEST(account_lock, ip_lock)
  END;

  RETURN QUERY SELECT
    GREATEST(account_attempts, ip_attempts),
    GREATEST(account_level, ip_level),
    current_lock,
    account_attempts >= 3 OR ip_attempts >= 3;
END;
$$;

-- Successful authentication resets the complete policy for the account and
-- current source IP. A future fifth failure must therefore begin at level 1
-- (the default 10-minute lock), not the recurring 20-minute level.
CREATE OR REPLACE FUNCTION public.clear_login_attempt_guard_v2(
  p_role text,
  p_account_hash text,
  p_ip_hash text
)
RETURNS TABLE(
  failed_attempts integer,
  lockout_level integer,
  locked_until timestamptz,
  captcha_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_role NOT IN ('parent', 'adviser', 'guidance', 'principal', 'ict')
    OR p_account_hash !~ '^[0-9a-f]{64}$'
    OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login guard parameters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':account:' || p_account_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':ip:' || p_ip_hash, 0));

  UPDATE public.login_attempt_guards
  SET failed_attempts = 0,
      lockout_level = 0,
      locked_until = NULL,
      last_failed_at = NULL,
      updated_at = now()
  WHERE role = p_role
    AND ((scope = 'account' AND subject_hash = p_account_hash)
      OR (scope = 'ip' AND subject_hash = p_ip_hash));

  RETURN QUERY SELECT 0, 0, NULL::timestamptz, false;
END;
$$;

REVOKE ALL ON FUNCTION public.get_login_attempt_guard_v2(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_failed_login_attempt_v2(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_login_attempt_guard_v2(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_attempt_guard_v2(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt_v2(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_login_attempt_guard_v2(text, text, text) TO service_role;
