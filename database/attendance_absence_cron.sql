-- Supabase pg_cron attendance processor.
-- Uses public.sections.class_session as the authoritative Morning/Afternoon assignment.
-- Run this entire file once in the Supabase SQL Editor.

create or replace function public.process_attendance_absences()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  manila_now timestamp := timezone('Asia/Manila', now());
  today_date date := timezone('Asia/Manila', now())::date;
  inserted_count integer := 0;
begin
  -- No attendance automation on weekends or outside the active school year.
  if extract(dow from today_date) in (0, 6)
     or not exists (
       select 1 from public.school_year_config
       where is_active = true
         and today_date between start_date and end_date
     ) then
    return 0;
  end if;

  -- Create today's two records once, inheriting the last saved ICT schedule.
  -- The unique (session_date, session_type) index makes this safe on every run.
  insert into public.class_sessions (
    session_date, session_type, scheduled_start, scheduled_end,
    late_after, absent_after, status
  )
  select
    today_date,
    template.session_type,
    template.scheduled_start,
    template.scheduled_end,
    template.late_after,
    template.absent_after,
    'Not Started'
  from (
    select distinct on (session_type)
      session_type, scheduled_start, scheduled_end,
      coalesce(late_after, scheduled_start + interval '30 minutes')::time as late_after,
      coalesce(absent_after, scheduled_end) as absent_after
    from public.class_sessions
    where session_date < today_date
    order by session_type, session_date desc
  ) template
  on conflict (session_date, session_type) do nothing;

  -- Only students with no Time In are marked Absent, and only after the
  -- ICT-configured cutoff for their section's assigned session.
  insert into public.attendance_logs (
    student_db_id, student_id, attendance_date, time_logged,
    type, session_type, status, via, remark
  )
  select
    student.id,
    student.student_id,
    today_date,
    session.absent_after,
    'Time In',
    session.session_type,
    'Absent',
    'Auto',
    'Auto-marked absent after the configured class-session cutoff'
  from public.students student
  join public.sections section
    on section.name = student.section
   and section.grade = student.grade
  join public.class_sessions session
    on session.session_date = today_date
   and session.session_type = section.class_session
  where manila_now::time >= coalesce(session.absent_after, session.scheduled_end)
    -- A student becomes eligible on the Manila calendar date their profile was
    -- created/activated. Never create a retroactive absence before enrollment.
    and timezone('Asia/Manila', student.created_at)::date <= today_date
    and not exists (
      select 1 from public.attendance_logs log
      where log.student_db_id = student.id
        and log.attendance_date = today_date
        and log.session_type = session.session_type
        and log.type = 'Time In'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Run every five minutes. The job is idempotent, so repeated runs are safe.
select cron.unschedule(jobid)
from cron.job
where jobname = 'process-attendance-absences';

select cron.schedule(
  'process-attendance-absences',
  '*/5 * * * *',
  $$select public.process_attendance_absences();$$
);
