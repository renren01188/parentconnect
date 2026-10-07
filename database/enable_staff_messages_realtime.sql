-- Lets staff message threads update immediately without a full-page refresh.
-- Run once in the Supabase SQL editor after the staff_messages table exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'staff_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messages;
  END IF;
END $$;
