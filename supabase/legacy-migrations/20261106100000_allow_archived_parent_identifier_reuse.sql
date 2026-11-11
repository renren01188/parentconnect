-- Archived Parent accounts are retained for historic attendance, reports,
-- messages, and audit records. Their former email/mobile login identifiers
-- must not prevent a verified guardian from registering a new account for a
-- new active student. Active accounts remain unique by normalized email and
-- normalized login mobile number.
--
-- This migration changes indexes only; it does not alter any Parent, student,
-- family-member, link, attendance, report, notification, or audit record.

BEGIN;

-- These global unique indexes reserve identifiers even after archival.
DROP INDEX IF EXISTS public.parents_email_normalized_unique_idx;
DROP INDEX IF EXISTS public.parents_email_unique_idx;
DROP INDEX IF EXISTS public.parents_login_contact_number_unique;

CREATE UNIQUE INDEX IF NOT EXISTS parents_active_email_normalized_unique_idx
  ON public.parents (lower(btrim(email)))
  WHERE email IS NOT NULL
    AND btrim(email) <> ''
    AND archive_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS parents_active_login_contact_number_unique_idx
  ON public.parents (login_contact_number)
  WHERE login_contact_number IS NOT NULL
    AND archive_status = 'active';

COMMIT;
