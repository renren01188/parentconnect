-- Keep Semaphore's known states canonical so the scheduled worker can find
-- messages that were initially accepted as Pending or Queued. This does not
-- create or resend any attendance notification; it only normalizes the stored
-- casing of those non-final provider snapshots.

BEGIN;

UPDATE public.attendance_sms_jobs
SET provider_status = lower(btrim(provider_status))
WHERE provider = 'semaphore'
  AND lower(btrim(coalesce(provider_status, ''))) IN ('queued', 'pending');

-- The worker checks only accepted Semaphore messages that have remained in a
-- non-final state past its grace period. The partial index keeps that sweep
-- bounded as attendance history grows.
CREATE INDEX IF NOT EXISTS attendance_sms_jobs_semaphore_pending_reconcile_idx
  ON public.attendance_sms_jobs (updated_at)
  WHERE provider = 'semaphore'
    AND status = 'sent'
    AND provider_message_id IS NOT NULL
    AND provider_status IN ('queued', 'pending');

COMMIT;
