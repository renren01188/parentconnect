-- Global, ICT-managed delivery choices for RFID attendance notifications.
-- Apply after attendance_sms_queue.sql and 20261005_attendance_sms_recipient_hardening.sql.
-- No provider credential is stored in this database.

create table if not exists public.attendance_notification_settings (
  id boolean primary key default true check (id),
  sms_enabled boolean not null default true,
  email_enabled boolean not null default false,
  sms_low_credit_threshold integer not null default 50 check (sms_low_credit_threshold >= 0),
  sms_credit_balance integer check (sms_credit_balance is null or sms_credit_balance >= 0),
  sms_credits_checked_at timestamp with time zone,
  sms_credits_check_error text,
  updated_by_ict_id bigint references public.ict_admins(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- One school-wide row; SMS remains the initial choice so installations retain
-- their existing behavior until ICT deliberately changes it.
insert into public.attendance_notification_settings (
  id, sms_enabled, email_enabled, sms_low_credit_threshold
) values (true, true, false, 50)
on conflict (id) do nothing;

alter table public.attendance_notification_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'attendance_notification_settings'
      and policyname = 'attendance_notification_settings_service_role'
  ) then
    create policy attendance_notification_settings_service_role
      on public.attendance_notification_settings
      for all to service_role using (true) with check (true);
  end if;
end;
$$;

create or replace function public.touch_attendance_notification_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_notification_settings_touch_updated_at on public.attendance_notification_settings;
create trigger attendance_notification_settings_touch_updated_at
before update on public.attendance_notification_settings
for each row execute function public.touch_attendance_notification_settings();

-- Durable email queue. The unique event key and non-retry-on-unknown policy in
-- the worker prevent duplicate email for one attendance_logs row.
create table if not exists public.attendance_email_jobs (
  id uuid primary key default gen_random_uuid(),
  attendance_log_id bigint not null references public.attendance_logs(id) on delete cascade,
  parent_id integer references public.parents(id) on delete set null,
  recipient_email text,
  recipient_key text not null,
  subject text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamp with time zone not null default now(),
  locked_at timestamp with time zone,
  sent_at timestamp with time zone,
  provider text check (provider in ('brevo')),
  provider_message_id text,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint attendance_email_jobs_one_delivery_per_event unique (attendance_log_id)
);

create index if not exists attendance_email_jobs_ready_idx
  on public.attendance_email_jobs (status, available_at, created_at)
  where status in ('pending', 'processing');

alter table public.attendance_email_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'attendance_email_jobs'
      and policyname = 'attendance_email_jobs_service_role'
  ) then
    create policy attendance_email_jobs_service_role
      on public.attendance_email_jobs
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'attendance_sms_jobs'
      and policyname = 'attendance_sms_jobs_service_role'
  ) then
    create policy attendance_sms_jobs_service_role
      on public.attendance_sms_jobs
      for all to service_role using (true) with check (true);
  end if;
end;
$$;

create or replace function public.touch_attendance_email_job()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists attendance_email_jobs_touch_updated_at on public.attendance_email_jobs;
create trigger attendance_email_jobs_touch_updated_at
before update on public.attendance_email_jobs
for each row execute function public.touch_attendance_email_job();

-- The SMS trigger remains the atomic first line of queueing, but it now
-- consults the global ICT choice before doing any parent lookup or insert.
create or replace function public.enqueue_attendance_sms_job()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_id integer;
  v_phone text;
  v_student_name text;
  v_message text;
begin
  if new.via is distinct from 'RFID'
     or new.type not in ('Time In', 'Time Out')
     or new.status = 'Absent'
     or not coalesce((select sms_enabled from public.attendance_notification_settings where id = true), true) then
    return new;
  end if;

  select candidate.id, candidate.phone
  into v_parent_id, v_phone
  from (
    select p.id,
      case
        when regexp_replace(coalesce(p.contact_number, ''), '\\D', '', 'g') ~ '^09[0-9]{9}$'
          then regexp_replace(p.contact_number, '\\D', '', 'g')
        when regexp_replace(coalesce(p.contact_number, ''), '\\D', '', 'g') ~ '^639[0-9]{9}$'
          then '0' || substring(regexp_replace(p.contact_number, '\\D', '', 'g') from 3)
      end as phone
    from public.parents p
    where p.student_id = new.student_id
      and p.archive_status is distinct from 'archived'
      and p.archive_status is distinct from 'deleted'
      and lower(trim(regexp_replace(coalesce(p.status, ''), '[_-]+', ' ', 'g'))) not in (
        'deletion suspended', 'deletion pending', 'pending deletion', 'pending',
        'pending approval', 'awaiting approval', 'unapproved', 'rejected', 'denied', 'waiting period',
        'suspended', 'blocked', 'deleted', 'inactive', 'deactivated', 'disabled'
      )

    union

    select p.id,
      case
        when regexp_replace(coalesce(p.contact_number, ''), '\\D', '', 'g') ~ '^09[0-9]{9}$'
          then regexp_replace(p.contact_number, '\\D', '', 'g')
        when regexp_replace(coalesce(p.contact_number, ''), '\\D', '', 'g') ~ '^639[0-9]{9}$'
          then '0' || substring(regexp_replace(p.contact_number, '\\D', '', 'g') from 3)
      end as phone
    from public.parent_student_links link
    join public.parents p on p.id = link.parent_id
    where link.student_id = new.student_id
      and p.archive_status is distinct from 'archived'
      and p.archive_status is distinct from 'deleted'
      and lower(trim(regexp_replace(coalesce(p.status, ''), '[_-]+', ' ', 'g'))) not in (
        'deletion suspended', 'deletion pending', 'pending deletion', 'pending',
        'pending approval', 'awaiting approval', 'unapproved', 'rejected', 'denied', 'waiting period',
        'suspended', 'blocked', 'deleted', 'inactive', 'deactivated', 'disabled'
      )
  ) as candidate
  where candidate.phone is not null
  order by candidate.id
  limit 1;

  select concat_ws(' ', first_name, middle_name, last_name, suffix)
  into v_student_name
  from public.students
  where id = new.student_db_id;

  v_message := format(
    'PConnect: Your child, %s, recorded attendance at Santiago Elementary School on %s at %s.',
    coalesce(nullif(v_student_name, ''), new.student_id),
    to_char(new.attendance_date, 'FMMonth FMDD, YYYY'),
    to_char(new.time_logged, 'FMHH12:MI AM')
  );

  insert into public.attendance_sms_jobs (
    attendance_log_id, parent_id, recipient_phone, recipient_key, message,
    status, available_at, last_error
  ) values (
    new.id,
    v_parent_id,
    v_phone,
    'attendance-log:' || new.id,
    v_message,
    case when v_parent_id is null then 'skipped' else 'pending' end,
    now(),
    case when v_parent_id is null then 'No eligible parent or guardian account has a valid Philippine contact number.' else null end
  ) on conflict (attendance_log_id) do nothing;

  return new;
end;
$$;

drop trigger if exists attendance_logs_enqueue_sms on public.attendance_logs;
create trigger attendance_logs_enqueue_sms
after insert on public.attendance_logs
for each row
when (new.via = 'RFID')
execute function public.enqueue_attendance_sms_job();

-- Optional scheduler. Add the same Vault values used by attendance_sms_queue.sql
-- and set ATTENDANCE_EMAIL_SCHEDULED_WORKER=true in the app environment.
do $schedule$
declare
  existing_job record;
begin
  if exists (select 1 from vault.secrets where name = 'parentconnect_app_url')
     and exists (select 1 from vault.secrets where name = 'parentconnect_sms_queue_cron_secret') then
    for existing_job in select jobid from cron.job where jobname = 'process-attendance-email-jobs' loop
      perform cron.unschedule(existing_job.jobid);
    end loop;
    perform cron.schedule(
      'process-attendance-email-jobs',
      '* * * * *',
      $request$
        select extensions.net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'parentconnect_app_url') || '/api/internal/process-attendance-email',
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
    raise notice 'Attendance email scheduler not activated: add parentconnect_app_url and parentconnect_sms_queue_cron_secret to Supabase Vault, then rerun this migration.';
  end if;
end;
$schedule$;
