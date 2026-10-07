-- This independent marker keeps the Guidance Dashboard walkthrough separate
-- from the Guidance Reports guide.
alter table public.guidance_counselors
  add column if not exists guidance_dashboard_guide_completed_at timestamp with time zone;

comment on column public.guidance_counselors.guidance_dashboard_guide_completed_at is
  'Timestamp when the Guidance Counselor completed the Dashboard quick guide.';
