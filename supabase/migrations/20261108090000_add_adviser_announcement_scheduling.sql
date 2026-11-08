-- Adviser announcements use the shared scheduled-announcement worker. Keep
-- existing records published and add only the state needed for future sends.
ALTER TABLE public.adviser_announcements
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Published',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'adviser_announcements_status_check'
      AND conrelid = 'public.adviser_announcements'::regclass
  ) THEN
    ALTER TABLE public.adviser_announcements
      ADD CONSTRAINT adviser_announcements_status_check
      CHECK (status IN ('Published', 'Scheduled', 'Cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS adviser_announcements_scheduled_delivery_idx
  ON public.adviser_announcements (scheduled_at)
  WHERE status = 'Scheduled';
