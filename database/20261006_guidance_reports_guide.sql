-- The nullable timestamp is per Guidance Counselor account. Existing accounts
-- remain untouched and will see this guide once until they complete it.
alter table public.guidance_counselors
  add column if not exists guidance_reports_guide_completed_at timestamp with time zone;

comment on column public.guidance_counselors.guidance_reports_guide_completed_at is
  'Timestamp when the Guidance Counselor completed the Reports quick guide.';
