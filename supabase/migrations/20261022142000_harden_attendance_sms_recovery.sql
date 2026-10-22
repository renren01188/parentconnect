-- Make every attendance SMS intent durable and auditable. A provider request
-- is never placed back on the send queue after an indeterminate outcome.

BEGIN;

ALTER TABLE public.attendance_sms_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS provider_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS retry_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_attempts integer NOT NULL DEFAULT 0;

-- Existing rows use the same attendance-event/parent identity that the new
-- application queue uses. A legacy duplicate gets its own immutable suffix,
-- preserving its delivery history instead of deleting or coalescing data.
WITH keys AS (
  SELECT
    id,
    created_at,
    'attendance-sms:v1:' || COALESCE(
      NULLIF(recipient_key, ''),
      'attendance-log:' || attendance_log_id::text || ':legacy-job:' || id::text
    ) AS base_key
  FROM public.attendance_sms_jobs
), numbered AS (
  SELECT
    id,
    base_key,
    row_number() OVER (PARTITION BY base_key ORDER BY created_at, id) AS duplicate_number
  FROM keys
)
UPDATE public.attendance_sms_jobs AS job
SET idempotency_key = numbered.base_key || CASE
  WHEN numbered.duplicate_number = 1 THEN ''
  ELSE ':legacy-duplicate:' || job.id::text
END
FROM numbered
WHERE job.id = numbered.id
  AND (job.idempotency_key IS NULL OR job.idempotency_key = '');

ALTER TABLE public.attendance_sms_jobs
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_sms_jobs_idempotency_key_idx
  ON public.attendance_sms_jobs (idempotency_key);

-- The old worker could put an attempted delivery back in pending. Existing
-- such rows are held for review, so applying this migration cannot resend an
-- SMS whose first request may have reached Semaphore.
ALTER TABLE public.attendance_sms_jobs
  DROP CONSTRAINT IF EXISTS attendance_sms_jobs_status_check;

ALTER TABLE public.attendance_sms_jobs
  ADD CONSTRAINT attendance_sms_jobs_status_check CHECK (
    status = ANY (ARRAY[
      'pending'::text,
      'processing'::text,
      'sent'::text,
      'failed'::text,
      'skipped'::text,
      'reconciliation_required'::text,
      'retry_eligible'::text
    ])
  );

UPDATE public.attendance_sms_jobs
SET
  status = 'reconciliation_required',
  provider_status = COALESCE(provider_status, 'unknown'),
  locked_at = NULL,
  reconciliation_required_at = COALESCE(reconciliation_required_at, locked_at, updated_at, now()),
  last_error = COALESCE(
    last_error,
    'SMS provider outcome is unknown from a legacy worker state. Reconcile before any retry.'
  )
WHERE status = 'processing'
   OR (
     status = 'pending'
     AND (
       attempts > 0
       OR provider_requested_at IS NOT NULL
       OR provider_message_id IS NOT NULL
       OR provider_status IS NOT NULL
     )
   );

CREATE OR REPLACE FUNCTION public.set_attendance_sms_job_idempotency_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
    NEW.idempotency_key := 'attendance-sms:v1:' || COALESCE(
      NULLIF(NEW.recipient_key, ''),
      'attendance-log:' || NEW.attendance_log_id::text || ':legacy-job:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_sms_jobs_idempotency_guard ON public.attendance_sms_jobs;
CREATE TRIGGER attendance_sms_jobs_idempotency_guard
  BEFORE INSERT OR UPDATE OF attendance_log_id, parent_id, recipient_key, idempotency_key
  ON public.attendance_sms_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_attendance_sms_job_idempotency_key();

REVOKE ALL ON FUNCTION public.set_attendance_sms_job_idempotency_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_attendance_sms_job_idempotency_key() TO service_role;

-- Retain provider message IDs and state transitions across retries. The queue
-- row holds the current state; this table preserves the immutable timeline.
CREATE TABLE IF NOT EXISTS public.attendance_sms_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_sms_job_id uuid NOT NULL REFERENCES public.attendance_sms_jobs(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  provider text,
  provider_message_id text,
  provider_status text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_sms_provider_events_job_created_idx
  ON public.attendance_sms_provider_events (attendance_sms_job_id, created_at DESC);

ALTER TABLE public.attendance_sms_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.attendance_sms_provider_events FROM anon, authenticated;

COMMIT;
