-- Backend-only hardening for attendance SMS bursts. Apply after
-- attendance_sms_queue.sql and attendance_sms_enqueue_trigger.sql.
-- This migration deliberately does not send messages; it only records timing
-- and schedules the existing authenticated worker.

alter table public.attendance_sms_jobs
  add column if not exists provider_requested_at timestamptz,
  add column if not exists provider_accepted_at timestamptz;

-- One scheduled worker is the only normal sender. The worker hard-caps a run
-- at 20 jobs and 4 concurrent requests, which is well below Semaphore's
-- documented 120 requests/minute endpoint limit.
--
-- Add these Vault values, set ATTENDANCE_SMS_SCHEDULED_WORKER=true in the
-- application environment, then rerun this migration to activate scheduling:
--   select vault.create_secret('https://YOUR-APP.example.com', 'parentconnect_app_url');
--   select vault.create_secret('YOUR_SMS_QUEUE_CRON_SECRET', 'parentconnect_sms_queue_cron_secret');
-- The secret must equal SMS_QUEUE_CRON_SECRET (or CRON_SECRET if reused).
do $schedule$
declare
  existing_job record;
begin
  if exists (select 1 from vault.secrets where name = 'parentconnect_app_url')
     and exists (select 1 from vault.secrets where name = 'parentconnect_sms_queue_cron_secret') then
    for existing_job in select jobid from cron.job where jobname = 'process-attendance-sms-jobs' loop
      perform cron.unschedule(existing_job.jobid);
    end loop;

    perform cron.schedule(
      'process-attendance-sms-jobs',
      '* * * * *',
      $request$
        select extensions.net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'parentconnect_app_url') || '/api/internal/process-attendance-sms',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'parentconnect_sms_queue_cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 60000
        );
      $request$
    );
  else
    raise notice 'Attendance SMS scheduler not activated: add parentconnect_app_url and parentconnect_sms_queue_cron_secret to Supabase Vault, then rerun this migration.';
  end if;
end;
$schedule$;
