-- The nullable timestamp is per parent account. Existing accounts remain
-- untouched and will see the guide once until they complete it.
alter table public.parents
  add column if not exists parent_dashboard_guide_completed_at timestamp with time zone;

comment on column public.parents.parent_dashboard_guide_completed_at is
  'Timestamp when the parent completed the Parent Dashboard quick guide.';
