-- Shared, server-side login protection for every ParentConnect login route.
--
-- The application sends only HMAC-SHA-256 hashes to these functions. One
-- guard is kept per account and another per source IP, so changing either the
-- account identifier or IP alone cannot bypass the protection.
--
-- Run this migration before deploying the corresponding application code.

CREATE TABLE IF NOT EXISTS public.login_attempt_guards (
  role text NOT NULL CHECK (role IN ('parent', 'adviser', 'guidance', 'principal', 'ict')),
  subject_hash text NOT NULL CHECK (char_length(subject_hash) = 64),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  lockout_level integer NOT NULL DEFAULT 0 CHECK (lockout_level >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL DEFAULT 'account' CHECK (scope IN ('account', 'ip')),
  PRIMARY KEY (role, scope, subject_hash)
);

-- Upgrade the original account-only guard without discarding existing state.
ALTER TABLE public.login_attempt_guards
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS lockout_level integer,
  ADD COLUMN IF NOT EXISTS last_failed_at timestamptz;

UPDATE public.login_attempt_guards
SET scope = COALESCE(scope, 'account'),
    lockout_level = COALESCE(lockout_level, CASE WHEN locked_until IS NULL THEN 0 ELSE 1 END),
    -- Legacy rows have no dedicated failure timestamp. `updated_at` is the
    -- best available approximation for their last invalid login attempt.
    last_failed_at = COALESCE(last_failed_at, CASE WHEN failed_attempts > 0 THEN updated_at END);

ALTER TABLE public.login_attempt_guards
  ALTER COLUMN scope SET DEFAULT 'account',
  ALTER COLUMN scope SET NOT NULL,
  ALTER COLUMN lockout_level SET DEFAULT 0,
  ALTER COLUMN lockout_level SET NOT NULL,
  ALTER COLUMN failed_attempts TYPE integer USING failed_attempts::integer;

ALTER TABLE public.login_attempt_guards
  DROP CONSTRAINT IF EXISTS login_attempt_guards_failed_attempts_check,
  DROP CONSTRAINT IF EXISTS login_attempt_guards_scope_check,
  DROP CONSTRAINT IF EXISTS login_attempt_guards_lockout_level_check;

ALTER TABLE public.login_attempt_guards
  ADD CONSTRAINT login_attempt_guards_failed_attempts_check CHECK (failed_attempts >= 0),
  ADD CONSTRAINT login_attempt_guards_scope_check CHECK (scope IN ('account', 'ip')),
  ADD CONSTRAINT login_attempt_guards_lockout_level_check CHECK (lockout_level >= 0);

-- The original key was (role, subject_hash). Scope makes the account and IP
-- counters independent while keeping each update atomic.
ALTER TABLE public.login_attempt_guards
  DROP CONSTRAINT IF EXISTS login_attempt_guards_pkey;
ALTER TABLE public.login_attempt_guards
  ADD CONSTRAINT login_attempt_guards_pkey PRIMARY KEY (role, scope, subject_hash);

ALTER TABLE public.login_attempt_guards ENABLE ROW LEVEL SECURITY;

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

  -- Take locks in a stable order so account/IP updates cannot deadlock.
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

  -- An expired lock begins a new batch of attempts. Keep lockout_level so
  -- the next completed batch uses the recurring 20-minute duration, but
  -- reset the counter before this request reports CAPTCHA or lock state.
  -- `now()` is evaluated by PostgreSQL, not by the browser.
  IF ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until <= now() THEN
    ip_guard.failed_attempts := 0;
    ip_guard.locked_until := NULL;
    UPDATE public.login_attempt_guards
    SET failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE role = p_role AND scope = 'ip' AND subject_hash = p_ip_hash;
  END IF;

  IF account_guard.locked_until IS NOT NULL AND account_guard.locked_until <= now() THEN
    account_guard.failed_attempts := 0;
    account_guard.locked_until := NULL;
    UPDATE public.login_attempt_guards
    SET failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE role = p_role AND scope = 'account' AND subject_hash = p_account_hash;
  END IF;

  -- Progressive durations apply only to a recent failure streak. The failed
  -- count remains protected (and may still require CAPTCHA), but a 24-hour
  -- quiet period returns the *next lockout* to its 10-minute base duration.
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

  -- Expired locks are a boundary between batches: the next invalid login is
  -- attempt one of a fresh set of five. Preserve the level so the first
  -- lockout stays at 10 minutes and later batch lockouts stay at 20 minutes.
  IF account_guard.locked_until IS NOT NULL AND account_guard.locked_until <= now() THEN
    account_guard.failed_attempts := 0;
    account_guard.locked_until := NULL;
  END IF;
  IF ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until <= now() THEN
    ip_guard.failed_attempts := 0;
    ip_guard.locked_until := NULL;
  END IF;

  -- A quiet period breaks only the lockout-duration escalation. It does not
  -- clear the account/IP attempt history or CAPTCHA requirement.
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
  -- Level 1 is the initial 10-minute lock. Every lock after a completed
  -- post-lockout batch is level 2 (20 minutes), never an accumulated duration.
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

  -- A verified login starts the complete policy over: reset the current
  -- account and IP counters, remove any lock, and return the next threshold
  -- to the default 10-minute level.
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

REVOKE ALL ON TABLE public.login_attempt_guards FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.get_login_attempt_guard_v2(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_failed_login_attempt_v2(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_login_attempt_guard_v2(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_login_attempt_guard_v2(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_failed_login_attempt_v2(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_login_attempt_guard_v2(text, text, text) TO service_role;
