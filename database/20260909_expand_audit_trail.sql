-- Server-side, append-only audit trail. Safe to apply to existing audit_log data.
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS performed_by_id text,
  ADD COLUMN IF NOT EXISTS performed_by_email text,
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'System',
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS previous_status text,
  ADD COLUMN IF NOT EXISTS new_status text,
  ADD COLUMN IF NOT EXISTS related_report_id text,
  ADD COLUMN IF NOT EXISTS related_ticket_id text,
  ADD COLUMN IF NOT EXISTS related_student_id text,
  ADD COLUMN IF NOT EXISTS related_user_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_browser_read" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_browser_insert" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_browser_update" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_browser_delete" ON public.audit_log;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END;
$$;
DROP TRIGGER IF EXISTS audit_log_is_append_only ON public.audit_log;
CREATE TRIGGER audit_log_is_append_only BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE OR REPLACE FUNCTION public.reject_sensitive_audit_data()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE audit_text text := lower(coalesce(NEW.details, '') || ' ' || coalesce(NEW.metadata::text, '') || ' ' || coalesce(NEW.changes::text, ''));
BEGIN
  IF audit_text ~ '"[^" ]*(password|otp|captcha|token|secret|authorization|cookie|credential)[^" ]*"\\s*:' THEN
    RAISE EXCEPTION 'sensitive credential fields are not permitted in audit_log';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS audit_log_reject_sensitive_data ON public.audit_log;
CREATE TRIGGER audit_log_reject_sensitive_data BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.reject_sensitive_audit_data();

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (performed_by_role, performed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_filter_idx ON public.audit_log (module, action, new_status, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_related_idx ON public.audit_log (related_report_id, related_ticket_id, related_student_id, related_user_id);
