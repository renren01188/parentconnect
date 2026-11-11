-- Persist the staff role that resolved a Parent report. This is independent
-- from escalation routing: an escalated report can only be resolved by the
-- role that currently owns it, but the resolver must remain explicit for UI
-- and audit accuracy. No report status, relationship, or message is changed.

BEGIN;

ALTER TABLE public.parent_adviser_reports
  ADD COLUMN IF NOT EXISTS resolved_by_role text;

ALTER TABLE public.parent_adviser_reports
  DROP CONSTRAINT IF EXISTS parent_adviser_reports_resolved_by_role_check;

ALTER TABLE public.parent_adviser_reports
  ADD CONSTRAINT parent_adviser_reports_resolved_by_role_check
  CHECK (resolved_by_role IS NULL OR resolved_by_role IN ('Adviser', 'Guidance', 'Principal'));

-- Preserve the actual historical resolver wherever the existing report audit
-- trail has it. The latest resolution record wins if a legacy report was
-- reopened and resolved again.
WITH historical_resolvers AS (
  SELECT DISTINCT ON (audit.related_report_id)
    audit.related_report_id,
    CASE
      WHEN lower(btrim(audit.performed_by_role)) = 'adviser' THEN 'Adviser'
      WHEN lower(btrim(audit.performed_by_role)) IN ('guidance', 'guidance counselor') THEN 'Guidance'
      WHEN lower(btrim(audit.performed_by_role)) = 'principal' THEN 'Principal'
      ELSE NULL
    END AS resolved_by_role
  FROM public.audit_log AS audit
  WHERE audit.action = 'Report Resolved'
    AND audit.related_report_id IS NOT NULL
  ORDER BY audit.related_report_id, audit.created_at DESC, audit.id DESC
)
UPDATE public.parent_adviser_reports AS report
SET resolved_by_role = historical_resolvers.resolved_by_role
FROM historical_resolvers
WHERE report.id::text = historical_resolvers.related_report_id
  AND report.status = 'resolved'
  AND report.resolved_by_role IS NULL
  AND historical_resolvers.resolved_by_role IS NOT NULL;

-- Older report records that predate the report-resolution audit fields still
-- have an unambiguous owner from the established escalation workflow.
UPDATE public.parent_adviser_reports
SET resolved_by_role = CASE
  WHEN escalated_to_principal IS TRUE THEN 'Principal'
  WHEN escalated_to_guidance IS TRUE THEN 'Guidance'
  ELSE 'Adviser'
END
WHERE status = 'resolved'
  AND resolved_by_role IS NULL;

COMMENT ON COLUMN public.parent_adviser_reports.resolved_by_role IS
  'The staff role that actually resolved a report: Adviser, Guidance, or Principal.';

COMMIT;
