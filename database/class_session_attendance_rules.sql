-- Upgrade the existing public.class_sessions table. This does not create a new table.
-- Run the duplicate check below first. If it returns no rows, run this entire file.
alter table public.class_sessions add column if not exists late_after time;
alter table public.class_sessions add column if not exists absent_after time;

update public.class_sessions
set late_after = coalesce(late_after, scheduled_start + interval '30 minutes'),
    absent_after = coalesce(absent_after, scheduled_end);

-- Exactly one Morning and one Afternoon session are allowed per school date.
-- This makes concurrent page loads/RFID scans idempotent instead of creating copies.
create unique index if not exists class_sessions_date_type_unique
  on public.class_sessions (session_date, session_type);
