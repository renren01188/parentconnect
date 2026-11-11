-- A Guidance favorite is a personal inbox preference. It deliberately has no
-- report status/read/escalation columns, so changing it cannot affect the
-- shared report workflow or another Guidance account's queue.

BEGIN;

CREATE TABLE IF NOT EXISTS public.guidance_report_favorites (
  guidance_id bigint NOT NULL
    REFERENCES public.guidance_counselors(id) ON DELETE CASCADE,
  report_id bigint NOT NULL
    REFERENCES public.parent_adviser_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guidance_id, report_id)
);

-- The primary key serves the per-counselor inbox lookup. This index keeps
-- report deletion/cascade checks efficient as the report history grows.
CREATE INDEX IF NOT EXISTS guidance_report_favorites_report_id_idx
  ON public.guidance_report_favorites (report_id);

ALTER TABLE public.guidance_report_favorites ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.guidance_report_favorites IS
  'Private Guidance report favorites; intentionally separate from report state and read receipts.';

COMMIT;
