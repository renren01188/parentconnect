-- ICT announcements create the same durable per-parent notification rows as
-- Adviser, Guidance, and Principal announcements. The former source check
-- rejected those rows after the ICT announcement itself had already been
-- inserted, which made the UI report a failed publish.
ALTER TABLE public.parent_announcement_notifications
  DROP CONSTRAINT IF EXISTS parent_announcement_notifications_source_check;

ALTER TABLE public.parent_announcement_notifications
  ADD CONSTRAINT parent_announcement_notifications_source_check
  CHECK (source = ANY (ARRAY['adviser'::text, 'guidance'::text, 'principal'::text, 'ict'::text]));
