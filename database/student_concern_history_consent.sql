-- Run this once if add_report_history_consent.sql was previously applied.
-- Forwarded Student Concerns need a null (undecided) value until the Parent
-- explicitly chooses Yes or No before beginning the conversation.
ALTER TABLE public.parent_adviser_reports
  ALTER COLUMN allow_history_access DROP NOT NULL,
  ALTER COLUMN allow_history_access DROP DEFAULT;

COMMENT ON COLUMN public.parent_adviser_reports.allow_history_access IS
  'True permits Principal history access; false denies it; null means a forwarded Student Concern is awaiting the parent choice.';
