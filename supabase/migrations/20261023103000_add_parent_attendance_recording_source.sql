-- `via` is an operational value that can change when an Adviser corrects an
-- existing row. Parents need the original, UI-safe recording source instead:
-- only Today's Manual Attendance may mark a row as Manual.

BEGIN;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS parent_recording_source text;

ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_parent_recording_source_check;

ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_parent_recording_source_check
  CHECK (parent_recording_source IS NULL OR parent_recording_source IN ('RFID', 'Manual'));

-- Historical RFID rows are unambiguous. Historical Manual rows are not
-- backfilled because Edit Attendance also uses `via = 'Manual'`; leaving them
-- unset avoids presenting an edit as a Today's Manual Attendance entry.
UPDATE public.attendance_logs
SET parent_recording_source = 'RFID'
WHERE parent_recording_source IS NULL
  AND via = 'RFID';

COMMENT ON COLUMN public.attendance_logs.parent_recording_source IS
  'Immutable Parent attendance source: RFID scans or Today''s Manual Attendance only. Adviser Edit Attendance does not modify this value.';

COMMIT;
