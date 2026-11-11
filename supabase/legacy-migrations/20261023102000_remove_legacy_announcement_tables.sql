-- Retire the unused first-generation announcement delivery schema.
-- The active implementation uses the role-specific announcement tables and
-- parent_announcement_notifications instead. Both legacy tables are empty;
-- adviser_notifications is the only table that references announcements.

BEGIN;

DROP TABLE IF EXISTS public.adviser_notifications;
DROP TABLE IF EXISTS public.announcements;

COMMIT;
