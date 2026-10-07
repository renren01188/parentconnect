-- Apply this one migration for the adviser Attendance and Reports walkthroughs.
-- Each nullable timestamp is scoped to one adviser account and one page.
alter table public.advisers
  add column if not exists adviser_attendance_guide_completed_at timestamp with time zone,
  add column if not exists adviser_reports_guide_completed_at timestamp with time zone;

comment on column public.advisers.adviser_attendance_guide_completed_at is
  'Timestamp when the adviser completed the RFID Attendance quick guide.';

comment on column public.advisers.adviser_reports_guide_completed_at is
  'Timestamp when the adviser completed the Reports & Messages quick guide.';
