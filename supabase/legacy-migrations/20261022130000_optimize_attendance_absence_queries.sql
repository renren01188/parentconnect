-- The automatic-absence worker reads every Time In for one date/session.
-- Its write-uniqueness index begins with student_db_id, so it cannot serve
-- this date-first batch lookup efficiently as attendance history grows.

BEGIN;

CREATE INDEX IF NOT EXISTS attendance_logs_absence_lookup_idx
  ON public.attendance_logs (attendance_date, session_type, type, student_db_id)
  WHERE student_db_id IS NOT NULL;

-- The SMS worker repeatedly claims the oldest job that is ready to send and
-- periodically recovers interrupted deliveries. These partial indexes keep
-- both queue operations small even while several grades are scanning at once.
CREATE INDEX IF NOT EXISTS attendance_sms_jobs_pending_dispatch_idx
  ON public.attendance_sms_jobs (available_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS attendance_sms_jobs_processing_lock_idx
  ON public.attendance_sms_jobs (locked_at)
  WHERE status = 'processing';

COMMIT;
