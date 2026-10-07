-- This independent marker keeps the Adviser Dashboard walkthrough separate
-- from the Adviser Attendance and Reports guides.
alter table public.advisers
  add column if not exists adviser_dashboard_guide_completed_at timestamp with time zone;

comment on column public.advisers.adviser_dashboard_guide_completed_at is
  'Timestamp when the adviser completed the Dashboard quick guide.';
