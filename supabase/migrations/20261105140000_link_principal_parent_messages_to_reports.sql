-- Link separate Principal-to-Parent follow-up messages to their source
-- report without making them part of the report conversation.  These rows
-- remain in staff_messages, which is the Parent School Messages transport;
-- no report workflow status, escalation, or existing message is changed.

BEGIN;

ALTER TABLE public.staff_messages
  ADD COLUMN IF NOT EXISTS report_id bigint
    REFERENCES public.parent_adviser_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_messages_report_id_created_at_idx
  ON public.staff_messages (report_id, created_at);

COMMENT ON COLUMN public.staff_messages.report_id IS
  'Optional source report for a separate staff message. It does not make the row part of parent_adviser_report_messages or alter report workflow state.';

COMMIT;
