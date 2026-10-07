-- Announcements are dashboard-only. Remove the legacy email/scheduled
-- announcement jobs without touching SMS, deletion-email, or absence jobs.
DO $$
DECLARE
  job_id bigint;
BEGIN
  FOR job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'publish-scheduled-announcements',
      'send-guidance-scheduled-announcement-emails',
      'send-ict-scheduled-announcement-emails',
      'send-principal-scheduled-announcement-emails'
    )
  LOOP
    PERFORM cron.unschedule(job_id);
  END LOOP;
END $$;
