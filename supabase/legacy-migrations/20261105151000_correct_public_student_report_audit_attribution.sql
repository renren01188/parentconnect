-- Correct one legacy Audit Trail row created by the public student report
-- form. The report itself, its timestamp, student reference, and every other
-- audit entry remain unchanged. New /report submissions already use this
-- attribution in the API.

BEGIN;

UPDATE public.audit_log
SET
  action = 'Student Report Submitted',
  performed_by = 'Student',
  performed_by_role = 'Student',
  performed_by_email = 'not-applicable',
  details = 'Student report submitted for PILOT PILOT PILOT (111111111111).'
WHERE id = 1171
  AND action = 'Report Submitted'
  AND performed_by = 'Subject Teacher'
  AND performed_by_role = 'Subject Teacher';

COMMIT;
