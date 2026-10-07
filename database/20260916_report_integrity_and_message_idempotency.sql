-- M-01 / M-05. Run only after the preflight orphan checks in this file return
-- zero rows. These constraints preserve report history: deletes are RESTRICTed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.parent_adviser_reports r
    LEFT JOIN public.parents p ON p.id = r.parent_id
    WHERE r.parent_id IS NOT NULL AND p.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.parent_adviser_reports r
    LEFT JOIN public.advisers a ON a.id = r.adviser_id
    WHERE r.adviser_id IS NOT NULL AND a.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.parent_adviser_reports r
    LEFT JOIN public.students s ON s.student_id = r.student_id
    WHERE r.student_id IS NOT NULL AND s.student_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.student_reports r
    LEFT JOIN public.students s ON s.id = r.student_db_id
    WHERE r.student_db_id IS NOT NULL AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.student_reports r
    LEFT JOIN public.students s ON s.student_id = r.student_id
    WHERE r.student_id IS NOT NULL AND s.student_id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.student_reports r
    LEFT JOIN public.advisers a ON a.id = r.adviser_id
    WHERE r.adviser_id IS NOT NULL AND a.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.parent_adviser_report_messages m
    LEFT JOIN public.parent_adviser_reports r ON r.id = m.report_id
    WHERE r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Report foreign-key preflight failed; no constraint was applied.';
  END IF;
END $$;

ALTER TABLE public.parent_adviser_report_messages
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS parent_adviser_report_messages_idempotency_key_idx
  ON public.parent_adviser_report_messages (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.parent_adviser_report_messages
  ADD CONSTRAINT parent_adviser_report_messages_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES public.parent_adviser_reports(id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.parent_adviser_reports
  ADD CONSTRAINT parent_adviser_reports_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.parents(id)
  ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT parent_adviser_reports_adviser_id_fkey
  FOREIGN KEY (adviser_id) REFERENCES public.advisers(id)
  ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT parent_adviser_reports_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.students(student_id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.student_reports
  ADD CONSTRAINT student_reports_student_db_id_fkey
  FOREIGN KEY (student_db_id) REFERENCES public.students(id)
  ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT student_reports_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.students(student_id)
  ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT student_reports_adviser_id_fkey
  FOREIGN KEY (adviser_id) REFERENCES public.advisers(id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.parent_adviser_report_messages VALIDATE CONSTRAINT parent_adviser_report_messages_report_id_fkey;
ALTER TABLE public.parent_adviser_reports VALIDATE CONSTRAINT parent_adviser_reports_parent_id_fkey;
ALTER TABLE public.parent_adviser_reports VALIDATE CONSTRAINT parent_adviser_reports_adviser_id_fkey;
ALTER TABLE public.parent_adviser_reports VALIDATE CONSTRAINT parent_adviser_reports_student_id_fkey;
ALTER TABLE public.student_reports VALIDATE CONSTRAINT student_reports_student_db_id_fkey;
ALTER TABLE public.student_reports VALIDATE CONSTRAINT student_reports_student_id_fkey;
ALTER TABLE public.student_reports VALIDATE CONSTRAINT student_reports_adviser_id_fkey;
