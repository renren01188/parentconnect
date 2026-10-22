-- One RFID tap may notify more than one parent.  The sender must therefore
-- have a project-wide lease: Vercel Cron retries/overlaps must not multiply
-- provider calls or database work when several advisers scan at once.

BEGIN;

CREATE TABLE IF NOT EXISTS public.attendance_sms_dispatch_leases (
  lease_name text PRIMARY KEY CHECK (lease_name = 'attendance-sms-dispatch'),
  owner_token uuid,
  locked_until timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.attendance_sms_dispatch_leases (lease_name)
VALUES ('attendance-sms-dispatch')
ON CONFLICT (lease_name) DO NOTHING;

ALTER TABLE public.attendance_sms_dispatch_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_sms_dispatch_leases FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.try_acquire_attendance_sms_dispatch_lease(
  p_owner_token uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  -- Keep the lease bounded even if an environment variable or caller is
  -- misconfigured.  A crashed Vercel invocation then self-recovers.
  UPDATE public.attendance_sms_dispatch_leases
  SET
    owner_token = p_owner_token,
    locked_until = clock_timestamp() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 240)),
    updated_at = clock_timestamp()
  WHERE lease_name = 'attendance-sms-dispatch'
    AND locked_until <= clock_timestamp()
  RETURNING true INTO v_acquired;

  RETURN v_acquired;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_attendance_sms_dispatch_lease(
  p_owner_token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Only the invocation that acquired the lease may release it.  This avoids
  -- a late-finishing worker unlocking a newer worker's lease.
  UPDATE public.attendance_sms_dispatch_leases
  SET
    owner_token = NULL,
    locked_until = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE lease_name = 'attendance-sms-dispatch'
    AND owner_token = p_owner_token;
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_attendance_sms_dispatch_lease(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_attendance_sms_dispatch_lease(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_attendance_sms_dispatch_lease(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_attendance_sms_dispatch_lease(uuid)
  TO service_role;

COMMIT;
