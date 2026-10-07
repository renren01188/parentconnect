-- Apply after 20261006_parent_dashboard_guide.sql. These independent markers
-- let a parent complete each page-specific guide once.
alter table public.parents
  add column if not exists parent_attendance_guide_completed_at timestamp with time zone,
  add column if not exists parent_reports_guide_completed_at timestamp with time zone;

comment on column public.parents.parent_attendance_guide_completed_at is
  'Timestamp when the parent completed the Parent Attendance quick guide.';

comment on column public.parents.parent_reports_guide_completed_at is
  'Timestamp when the parent completed the Parent Reports quick guide.';
