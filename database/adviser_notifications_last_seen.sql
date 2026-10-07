-- Run this once in the Supabase SQL editor before deploying the matching app changes.
-- The timestamp is account-level state for the Adviser sidebar badge. Individual
-- notification read state remains in adviser_notification_reads.
ALTER TABLE public.advisers
  ADD COLUMN IF NOT EXISTS notifications_last_seen_at TIMESTAMPTZ;

-- Preserve existing page-view state before removing the superseded table.
-- The condition keeps this safe for installations where the interim table
-- was never created.
DO $$
BEGIN
  IF to_regclass('public.adviser_notification_views') IS NOT NULL THEN
    UPDATE public.advisers AS adviser
    SET notifications_last_seen_at = views.last_seen_at
    FROM public.adviser_notification_views AS views
    WHERE adviser.id = views.adviser_id
      AND (adviser.notifications_last_seen_at IS NULL OR adviser.notifications_last_seen_at < views.last_seen_at);

    DROP TABLE public.adviser_notification_views;
  END IF;
END $$;
