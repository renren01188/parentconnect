-- Target the two repeatedly observed attendance/security lookups without
-- changing any attendance, SMS, or audit data. These indexes keep the
-- per-request password-revocation check and parent notification lookup from
-- scanning unrelated historical rows as the project grows.

BEGIN;

-- getAdviserFromToken and the Edge middleware both check whether the current
-- account's password session was revoked. Only user revocation audit events
-- participate in that check, so a partial index stays small and exact.
CREATE INDEX IF NOT EXISTS audit_log_password_session_revocation_lookup_idx
  ON public.audit_log (target_id, target_role, created_at DESC)
  WHERE target_type = 'user'
    AND action IN ('Password Session Revoked', 'ICT Password Session Revoked');

-- Attendance notification enqueueing finds direct parent records by student.
-- parent_student_links already has the equivalent child-side index; direct
-- parent records need the same lookup path.
CREATE INDEX IF NOT EXISTS parents_student_id_idx
  ON public.parents (student_id);

COMMIT;
