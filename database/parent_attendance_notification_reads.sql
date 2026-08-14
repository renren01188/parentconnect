-- Run this once in the Supabase SQL editor before deploying the matching app changes.
-- It stores a parent's read state for attendance alerts without duplicating
-- attendance records or announcement notifications.
CREATE TABLE IF NOT EXISTS public.parent_attendance_notification_reads (
  parent_id INTEGER NOT NULL REFERENCES public.parents(id) ON DELETE CASCADE,
  attendance_log_id BIGINT NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_id, attendance_log_id)
);

CREATE INDEX IF NOT EXISTS parent_attendance_notification_reads_log_idx
  ON public.parent_attendance_notification_reads (attendance_log_id);

-- The browser never accesses this table directly. Parent-facing reads and
-- updates go through authenticated Next.js API routes using the service role.
ALTER TABLE public.parent_attendance_notification_reads ENABLE ROW LEVEL SECURITY;
