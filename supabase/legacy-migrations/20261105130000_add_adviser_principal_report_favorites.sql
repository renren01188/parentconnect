-- Adviser and Principal report favorites are private inbox preferences. They
-- are deliberately separate from parent_adviser_reports, so a saved star can
-- never change shared report status, escalation, read state, or access.

BEGIN;

CREATE TABLE IF NOT EXISTS public.adviser_report_favorites (
  adviser_id integer NOT NULL
    REFERENCES public.advisers(id) ON DELETE CASCADE,
  report_id bigint NOT NULL
    REFERENCES public.parent_adviser_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (adviser_id, report_id)
);

CREATE INDEX IF NOT EXISTS adviser_report_favorites_report_id_idx
  ON public.adviser_report_favorites (report_id);

ALTER TABLE public.adviser_report_favorites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.adviser_report_favorites IS
  'Private Adviser report favorites; intentionally separate from report state and read receipts.';

CREATE TABLE IF NOT EXISTS public.principal_report_favorites (
  principal_id bigint NOT NULL
    REFERENCES public.principals(id) ON DELETE CASCADE,
  report_id bigint NOT NULL
    REFERENCES public.parent_adviser_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, report_id)
);

CREATE INDEX IF NOT EXISTS principal_report_favorites_report_id_idx
  ON public.principal_report_favorites (report_id);

ALTER TABLE public.principal_report_favorites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.principal_report_favorites IS
  'Private Principal report favorites; intentionally separate from report state and read receipts.';

COMMIT;
