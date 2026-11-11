-- RFID cards are school-wide identifiers. The application validates first for
-- a friendly error, while this index closes the concurrent-write race across
-- ICT, Adviser, registration, and transfer flows.

BEGIN;

-- Do not silently discard an existing assignment. If legacy data contains a
-- duplicate, surface it before enabling the database guarantee so ICT can
-- resolve the records deliberately.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.students
    WHERE NULLIF(btrim(rfid_card), '') IS NOT NULL
    GROUP BY upper(btrim(rfid_card))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce RFID uniqueness because duplicate normalized RFID cards already exist. Resolve the duplicate student assignments first.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS students_rfid_card_normalized_unique
  ON public.students (upper(btrim(rfid_card)))
  WHERE NULLIF(btrim(rfid_card), '') IS NOT NULL;

COMMENT ON INDEX public.students_rfid_card_normalized_unique IS
  'Prevents the same non-empty RFID UID from being assigned to more than one student, case-insensitively.';

COMMIT;
