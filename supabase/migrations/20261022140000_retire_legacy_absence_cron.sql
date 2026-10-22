-- The app-based absence processor is the canonical grade-aware workflow.
-- This legacy pg_cron function predates grade-scoped class_sessions and fails
-- on every run because its ON CONFLICT target no longer exists.  It must not
-- remain callable through the public PostgREST RPC surface.

BEGIN;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'process-attendance-absences'
      AND command = 'select public.process_attendance_absences();'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_attendance_absences() FROM PUBLIC;

COMMIT;
