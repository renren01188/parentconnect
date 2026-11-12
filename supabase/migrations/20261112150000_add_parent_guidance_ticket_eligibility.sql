BEGIN;

-- A Parent ticket and an Adviser escalation both route the same report to
-- Guidance. Locking the report makes that handoff a single decision even when
-- the two requests reach the server at almost the same time.
CREATE OR REPLACE FUNCTION public.submit_parent_guidance_ticket(
  p_report_id bigint,
  p_parent_id bigint,
  p_concern text,
  p_message text,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  ticket_id bigint,
  ticket_status text,
  duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.parent_adviser_reports%ROWTYPE;
  v_ticket public.parent_report_guidance_tickets%ROWTYPE;
BEGIN
  IF p_report_id IS NULL OR p_report_id < 1 OR p_parent_id IS NULL OR p_parent_id < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid report or Parent account.';
  END IF;

  SELECT * INTO v_report
  FROM public.parent_adviser_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Report not found.';
  END IF;
  IF v_report.parent_id IS DISTINCT FROM p_parent_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only the Parent who submitted this report may create a Guidance ticket.';
  END IF;

  -- Use the original report submission time. Replies and status changes only
  -- update last_message_at/status_updated_at and can never extend this wait.
  IF clock_timestamp() < v_report.created_at + interval '72 hours' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Guidance tickets become available 72 hours after the original report submission.';
  END IF;
  IF v_report.status NOT IN ('new', 'read', 'replied', 'ongoing')
    OR v_report.escalated_to_guidance
    OR coalesce(v_report.escalated_to_principal, false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Only open reports that have not been escalated to Guidance may be submitted.';
  END IF;

  SELECT * INTO v_ticket
  FROM public.parent_report_guidance_tickets
  WHERE report_id = v_report.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_ticket.id, v_ticket.status, true;
    RETURN;
  END IF;

  INSERT INTO public.parent_report_guidance_tickets (
    report_id, parent_id, student_id, adviser_id, concern, message, attachments,
    status, created_at, updated_at
  ) VALUES (
    v_report.id, v_report.parent_id, v_report.student_id, v_report.adviser_id,
    btrim(p_concern), btrim(coalesce(p_message, '')), coalesce(p_attachments, '[]'::jsonb),
    'pending', clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (report_id) DO NOTHING
  RETURNING * INTO v_ticket;

  IF NOT FOUND THEN
    SELECT * INTO v_ticket
    FROM public.parent_report_guidance_tickets
    WHERE report_id = v_report.id;
    RETURN QUERY SELECT v_ticket.id, v_ticket.status, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_ticket.id, v_ticket.status, false;
END;
$$;

-- If the Parent ticket wins the row lock first, do not let a stale Adviser
-- status update create a second, parallel escalation. Rejected tickets do not
-- block a future Adviser escalation; accepted tickets update the report to
-- `ongoing`, not `escalated`, in the existing Guidance acceptance flow.
CREATE OR REPLACE FUNCTION public.prevent_adviser_escalation_after_pending_parent_ticket()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'escalated'
    AND coalesce(NEW.escalated_to_guidance, false)
    AND NOT coalesce(OLD.escalated_to_guidance, false)
    AND EXISTS (
      SELECT 1
      FROM public.parent_report_guidance_tickets AS ticket
      WHERE ticket.report_id = NEW.id
        AND ticket.status = 'pending'
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A Parent Guidance ticket is already pending for this report.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_adviser_escalation_after_pending_parent_ticket
  ON public.parent_adviser_reports;
CREATE TRIGGER prevent_adviser_escalation_after_pending_parent_ticket
  BEFORE UPDATE OF status, escalated_to_guidance ON public.parent_adviser_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_adviser_escalation_after_pending_parent_ticket();

REVOKE ALL ON FUNCTION public.submit_parent_guidance_ticket(bigint, bigint, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_parent_guidance_ticket(bigint, bigint, text, text, jsonb) TO service_role;

COMMIT;
