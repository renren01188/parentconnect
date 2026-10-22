-- The legacy absence function has explicit EXECUTE grants in addition to the
-- former PUBLIC grant. The function must not remain invokable by browser-facing
-- PostgREST roles. The server-only service role is left unchanged.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.process_attendance_absences()
  FROM anon, authenticated;

COMMIT;
