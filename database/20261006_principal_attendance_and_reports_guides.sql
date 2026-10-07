-- Apply this one migration for the Principal Attendance Summary and Reports walkthroughs.
-- Each nullable timestamp is scoped to one principal account and one page.
alter table public.principals
  add column if not exists principal_attendance_summary_guide_completed_at timestamp with time zone,
  add column if not exists principal_reports_guide_completed_at timestamp with time zone;

comment on column public.principals.principal_attendance_summary_guide_completed_at is
  'Timestamp when the Principal completed the Attendance Summary quick guide.';

comment on column public.principals.principal_reports_guide_completed_at is
  'Timestamp when the Principal completed the Reports quick guide.';
