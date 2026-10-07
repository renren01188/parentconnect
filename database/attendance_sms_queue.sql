-- Durable attendance SMS queue. Apply this before deploying the worker route.
-- SMS provider credentials stay in server-side environment variables only.

-- The old index allowed only one attendance row per student/day, which made a
-- successful Time Out impossible after a Time In. This preserves one record
-- for each event in each session while retaining duplicate protection.
drop index if exists public.attendance_logs_student_day_idx;
create unique index if not exists attendance_logs_student_date_session_type_idx
  on public.attendance_logs (student_db_id, attendance_date, session_type, type)
  where student_db_id is not null;

create table if not exists public.attendance_sms_jobs (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id bigint not null references public.attendance_logs(id) on delete cascade,
  parent_id integer references public.parents(id) on delete set null,
  recipient_phone text,
  recipient_key text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  provider text check (provider in ('semaphore', 'unisms')),
  provider_message_id text,
  provider_status text,
  provider_response jsonb,
  provider_requested_at timestamptz,
  provider_accepted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sms_jobs_one_delivery_per_event unique (attendance_log_id)
);

create index if not exists attendance_sms_jobs_ready_idx
  on public.attendance_sms_jobs (status, available_at, created_at)
  where status in ('pending', 'processing');
create index if not exists attendance_sms_jobs_provider_message_idx
  on public.attendance_sms_jobs (provider, provider_message_id)
  where provider_message_id is not null;

alter table public.attendance_sms_jobs enable row level security;

create or replace function public.touch_attendance_sms_job()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_sms_jobs_touch_updated_at on public.attendance_sms_jobs;
create trigger attendance_sms_jobs_touch_updated_at
before update on public.attendance_sms_jobs
for each row execute function public.touch_attendance_sms_job();

-- Add these Vault values, then rerun this file to schedule the worker:
--   select vault.create_secret('https://YOUR-APP.example.com', 'parentconnect_app_url');
--   select vault.create_secret('YOUR_SMS_QUEUE_CRON_SECRET', 'parentconnect_sms_queue_cron_secret');
-- The secret must equal SMS_QUEUE_CRON_SECRET (or CRON_SECRET if reusing it).
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
    raise notice 'Attendance SMS queue created. Add the Vault values above, then rerun this migration to schedule delivery.';
  end if;
end;
$schedule$;
