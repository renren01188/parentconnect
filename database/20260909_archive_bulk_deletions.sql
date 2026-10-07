-- Archive-only replacement for the bulk-deletion retention flow.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['students','parents','advisers','ict_admins','guidance_counselors','principals']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archived_at timestamptz', table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archived_by text', table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archive_reason text', table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT ''active'' CHECK (archive_status IN (''active'', ''archived''))', table_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS archive_previous_status text', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (archive_status)', table_name || '_archive_status_idx', table_name);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.prevent_archivable_hard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion is disabled; archive the selected record instead.';
END;
$$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['students','parents','advisers','ict_admins','guidance_counselors','principals']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_hard_delete ON public.%I', table_name);
    EXECUTE format('CREATE TRIGGER prevent_hard_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.prevent_archivable_hard_delete()', table_name);
  END LOOP;
END $$;
ALTER TABLE public.scheduled_deletions ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by text, ADD COLUMN IF NOT EXISTS archive_reason text;
ALTER TABLE public.scheduled_deletions DROP CONSTRAINT IF EXISTS scheduled_deletions_status_check;
-- Keep legacy Deleted rows readable; new application code never writes them.
ALTER TABLE public.scheduled_deletions ADD CONSTRAINT scheduled_deletions_status_check CHECK (status IN ('PendingICT', 'Scheduled', 'Rejected', 'Restored', 'Archived', 'Deleted'));
CREATE INDEX IF NOT EXISTS scheduled_deletions_archive_due_idx ON public.scheduled_deletions (status, delete_after);
