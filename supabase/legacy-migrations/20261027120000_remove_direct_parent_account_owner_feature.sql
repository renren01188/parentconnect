-- Remove only the schema used by the retired Direct SQL Injection / Account
-- Owner flow. This migration deliberately does not insert, update, archive,
-- unlink, or delete any Parent, student, family, attendance, or notification
-- record. Existing Parent accounts remain available through the normal login
-- and Guardian signup flows.

BEGIN;

-- Verified before this migration was added: these columns have no dependent
-- views, policies, triggers, or functions. The constraint is the sole schema
-- dependency and must be removed before its column.
ALTER TABLE public.parents
  DROP CONSTRAINT IF EXISTS parents_account_owner_role_check,
  DROP COLUMN IF EXISTS account_owner_role,
  DROP COLUMN IF EXISTS requires_account_setup,
  DROP COLUMN IF EXISTS account_setup_completed_at;

COMMIT;
