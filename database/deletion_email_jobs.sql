-- Durable parent-deletion email queue. Run in the Supabase SQL editor before
-- deploying the worker route. SMTP credentials remain in the app environment.

create extension if not exists pg_net with schema extensions;

create table if not exists public.deletion_email_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  recipient_email text not null,
  recipient_email_normalized text generated always as (lower(btrim(recipient_email))) stored,
  recipient_name text not null,
  target_names text[] not null default array[]::text[],
  scheduled_deletion_ids bigint[] not null default array[]::bigint[],
  reason text not null,
  delete_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deletion_email_jobs_one_recipient_per_batch unique (batch_id, recipient_email_normalized)
);

create index if not exists deletion_email_jobs_pending_idx
  on public.deletion_email_jobs (status, available_at, created_at);
create index if not exists deletion_email_jobs_batch_idx
  on public.deletion_email_jobs (batch_id, status);

alter table public.deletion_email_jobs enable row level security;

create or replace function public.touch_deletion_email_job()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deletion_email_jobs_touch_updated_at on public.deletion_email_jobs;
create trigger deletion_email_jobs_touch_updated_at
before update on public.deletion_email_jobs
for each row execute function public.touch_deletion_email_job();

-- Configure these two Vault values once. The secret value must match the app's
-- CRON_SECRET environment variable; it is deliberately not stored in this SQL.
--   select vault.create_secret('https://YOUR-APP.example.com', 'parentconnect_app_url');
--   select vault.create_secret('YOUR_CRON_SECRET', 'parentconnect_cron_secret');
-- Then the scheduler invokes the protected worker every minute. It processes a
-- bounded batch, so no bulk-delete browser request waits for SMTP delivery.
do $schedule$
declare
  existing_job record;
begin
  if exists (select 1 from vault.secrets where name = 'parentconnect_app_url')
     and exists (select 1 from vault.secrets where name = 'parentconnect_cron_secret') then
    for existing_job in select jobid from cron.job where jobname = 'process-parent-deletion-email-jobs' loop
      perform cron.unschedule(existing_job.jobid);
    end loop;
    perform cron.schedule(
      'process-parent-deletion-email-jobs',
      '* * * * *',
      $request$
        select extensions.net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'parentconnect_app_url') || '/api/internal/process-deletion-emails',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'parentconnect_cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 10000
        );
      $request$
    );
  else
    raise notice 'Email queue created. Add parentconnect_app_url and parentconnect_cron_secret to Vault, then rerun this migration to schedule the worker.';
  end if;
end;
$schedule$;
