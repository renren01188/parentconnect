-- Rapid Tap retries the same scanner request after browser/network failures.
-- Keep that retry id on the durable attendance event so a request that was
-- committed just before a timeout is returned as the original event instead
-- of creating another Time In or Time Out record.

BEGIN;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS scan_request_id text;

ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_scan_request_id_length;

ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_scan_request_id_length
  CHECK (scan_request_id IS NULL OR char_length(scan_request_id) BETWEEN 16 AND 128);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_scan_request_id_unique
  ON public.attendance_logs (scan_request_id)
  WHERE scan_request_id IS NOT NULL;

COMMIT;
