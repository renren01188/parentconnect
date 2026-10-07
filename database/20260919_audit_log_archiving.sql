-- Archive audit records without mutating or deleting public.audit_log.
-- Each archive row is only a one-to-one reference to the immutable source log.

CREATE TABLE IF NOT EXISTS public.audit_log_archives (
  audit_log_id bigint PRIMARY KEY REFERENCES public.audit_log(id) ON DELETE RESTRICT,
  archived_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log_archives ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS audit_log_archives_archived_at_idx
  ON public.audit_log_archives (archived_at DESC);

CREATE OR REPLACE FUNCTION public.archive_expired_audit_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  archived_count integer := 0;
BEGIN
  INSERT INTO public.audit_log_archives (audit_log_id)
  SELECT log.id
  FROM public.audit_log AS log
  WHERE log.created_at < now() - interval '7 days'
  ON CONFLICT (audit_log_id) DO NOTHING;

  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$$;

-- A view adds archive state at read time. It neither changes nor duplicates
-- any audit-log content, timestamp, user, role, action, or description.
CREATE OR REPLACE VIEW public.audit_log_with_archive_status
WITH (security_invoker = true)
AS
SELECT
  log.*,
  CASE WHEN archive.audit_log_id IS NULL THEN 'active' ELSE 'archived' END AS archive_status,
  archive.archived_at
FROM public.audit_log AS log
LEFT JOIN public.audit_log_archives AS archive ON archive.audit_log_id = log.id;

REVOKE ALL ON TABLE public.audit_log_archives FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_expired_audit_logs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audit_log_with_archive_status FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_audit_logs() TO service_role;
GRANT SELECT ON TABLE public.audit_log_with_archive_status TO service_role;

-- Backfill immediately, then run every five minutes. Inserts are idempotent, so there are
-- no duplicate archive records when this migration or job is run repeatedly.
SELECT public.archive_expired_audit_logs();

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'archive-expired-audit-logs';

SELECT cron.schedule(
  'archive-expired-audit-logs',
  '*/5 * * * *',
  $$SELECT public.archive_expired_audit_logs();$$
);
