-- Retire the unused parent-account-deletion email queue.
-- Parent deletion communication is now an in-app notification; the active
-- scheduled-deletion records and reference tables are intentionally retained.
-- Refuse to silently discard data if another environment still has queue rows.

BEGIN;

DO $$
DECLARE
  job_items_has_rows boolean := false;
  jobs_has_rows boolean := false;
BEGIN
  -- Lock in parent/child order before inspecting rows. This prevents a legacy
  -- writer from adding a record after the empty-queue check but before DROP.
  IF to_regclass('public.deletion_email_jobs') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.deletion_email_jobs IN ACCESS EXCLUSIVE MODE';
  END IF;

  IF to_regclass('public.deletion_email_job_items') IS NOT NULL THEN
    EXECUTE 'LOCK TABLE public.deletion_email_job_items IN ACCESS EXCLUSIVE MODE';
  END IF;

  IF to_regclass('public.deletion_email_job_items') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.deletion_email_job_items)'
      INTO job_items_has_rows;
  END IF;

  IF to_regclass('public.deletion_email_jobs') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.deletion_email_jobs)'
      INTO jobs_has_rows;
  END IF;

  IF job_items_has_rows OR jobs_has_rows THEN
    RAISE EXCEPTION
      'Cannot remove legacy deletion email tables while queued records remain.';
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.deletion_email_job_items;
DROP TABLE IF EXISTS public.deletion_email_jobs;

COMMIT;
