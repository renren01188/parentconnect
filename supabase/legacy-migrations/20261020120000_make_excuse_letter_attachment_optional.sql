-- Parents may submit a valid excuse request without evidence attached. Keep
-- attachment metadata nullable so the API can persist an attachment-free
-- request while still validating a file whenever one is supplied.

BEGIN;

DO $$
DECLARE
  attachment_column record;
BEGIN
  IF to_regclass('public.excuse_letters') IS NULL THEN
    RETURN;
  END IF;

  FOR attachment_column IN
    SELECT information_schema.columns.column_name
    FROM information_schema.columns
    WHERE information_schema.columns.table_schema = 'public'
      AND information_schema.columns.table_name = 'excuse_letters'
      AND information_schema.columns.column_name IN (
        'file_name',
        'file_data',
        'file_type',
        'attachment_uploaded_at'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.excuse_letters ALTER COLUMN %I DROP NOT NULL',
      attachment_column.column_name
    );
  END LOOP;
END;
$$;

COMMIT;
