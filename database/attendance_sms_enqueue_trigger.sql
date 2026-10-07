-- Queue one SMS only for an RFID Time In or Time Out attendance event.
-- Manual, automatic, and approved-excuse attendance never create SMS jobs.
-- Apply after database/attendance_sms_queue.sql.

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
     or new.status = 'Absent' then
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
for each row execute function public.enqueue_attendance_sms_job();
