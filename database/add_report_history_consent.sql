-- Stores the parent's consent for sharing the report conversation with higher authorities.
ALTER TABLE public.parent_adviser_reports
  ADD COLUMN IF NOT EXISTS allow_history_access boolean;

COMMENT ON COLUMN public.parent_adviser_reports.allow_history_access IS
  'True permits Principal history access; false denies it; null means a forwarded Student Concern is awaiting the parent choice.';
