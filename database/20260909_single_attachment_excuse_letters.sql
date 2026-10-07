-- Permanent one-file rule for excuse letters.
ALTER TABLE public.excuse_letters
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS file_data text,
  ADD COLUMN IF NOT EXISTS attachment_uploaded_at timestamptz;

-- Never discard data silently if a legacy letter has more than one file.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.excuse_letter_attachments
    GROUP BY excuse_letter_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot consolidate excuse attachments: at least one letter has multiple files.';
  END IF;
END;
$$;

-- The current legacy data has at most one row per letter. Copy it into the
-- master record before the child table is retired.
UPDATE public.excuse_letters AS letter
SET file_name = attachment.file_name,
    file_type = attachment.file_type,
    file_data = attachment.file_data,
    attachment_uploaded_at = attachment.created_at
FROM public.excuse_letter_attachments AS attachment
WHERE attachment.excuse_letter_id = letter.id;

ALTER TABLE public.excuse_letters
  ADD CONSTRAINT excuse_letters_single_attachment_fields_check
  CHECK (
    (file_name IS NULL AND file_type IS NULL AND file_data IS NULL)
    OR (
      length(btrim(file_name)) BETWEEN 1 AND 180
      AND length(btrim(file_type)) BETWEEN 1 AND 120
      AND length(file_data) > 0
    )
  );

DROP TABLE IF EXISTS public.excuse_letter_attachments;
