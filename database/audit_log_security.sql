-- Apply once in the Supabase SQL editor for the existing audit_log table.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Older installations restrict action to a short hard-coded list that omits
-- valid events such as Logout, approvals, and report actions. Keep audit
-- actions extensible while still rejecting an empty action.
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_action_check CHECK (char_length(trim(action)) > 0);

-- System events legitimately use the System target role, while future roles
-- may be introduced without an application migration.
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_target_role_check;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_target_role_check CHECK (char_length(trim(target_role)) > 0);

-- Browser clients never query this table directly; server API routes use the
-- service-role client, so do not add public client-side policies.
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_performed_by_idx ON public.audit_log (performed_by);
