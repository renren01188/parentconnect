-- The nullable timestamp is per ICT account. Existing accounts remain
-- untouched and will see the Dashboard guide once until they complete it.
alter table public.ict_admins
  add column if not exists ict_dashboard_guide_completed_at timestamp with time zone;

comment on column public.ict_admins.ict_dashboard_guide_completed_at is
  'Timestamp when the ICT Administrator completed the Dashboard quick guide.';
