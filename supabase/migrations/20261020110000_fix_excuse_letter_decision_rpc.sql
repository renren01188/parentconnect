-- The existing approval RPC used unqualified column names after joining
-- excuse_letters, students, and advisers. PostgreSQL therefore raised
-- "column reference id is ambiguous" when an Adviser approved or declined a
-- letter. Keep every table field qualified and perform the decision and any
-- attendance adjustment in one transaction.

BEGIN;

-- Older deployments created this RPC outside the migration history. Drop
-- every legacy signature first: CREATE OR REPLACE cannot change an existing
-- function's OUT-column types, and retaining an integer overload would make
-- PostgREST's RPC resolution ambiguous.
DO $$
DECLARE
  legacy_function record;
BEGIN
  FOR legacy_function IN
    SELECT procedure.oid::regprocedure AS signature
    FROM pg_proc AS procedure
    INNER JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'decide_excuse_letter'
  LOOP
    EXECUTE format('DROP FUNCTION %s', legacy_function.signature);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_excuse_letter(
  p_letter_id bigint,
  p_adviser_id bigint,
  p_status text,
  p_decline_reason text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  status text,
  student_id text,
  parent_id bigint,
  date_from date,
  date_to date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_letter public.excuse_letters%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_school_year public.school_year_config%ROWTYPE;
  v_session_type text;
  v_session_start time;
  v_date date;
  v_weekday text;
BEGIN
  IF p_status NOT IN ('Approved', 'Declined') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid excuse-letter decision.';
  END IF;

  IF p_status = 'Declined' AND nullif(btrim(coalesce(p_decline_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A decline reason is required.';
  END IF;

  -- Lock the pending request before authorization and update so concurrent
  -- advisers cannot approve/decline the same letter twice.
  SELECT excuse_letter.*
  INTO v_letter
  FROM public.excuse_letters AS excuse_letter
  WHERE excuse_letter.id = p_letter_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Excuse letter not found.';
  END IF;

  IF v_letter.status <> 'Pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'This excuse letter has already been reviewed.';
  END IF;

  SELECT student.*
  INTO v_student
  FROM public.students AS student
  WHERE student.student_id = v_letter.student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Student not found for this excuse letter.';
  END IF;

  -- The deciding adviser must currently own the student's grade and section.
  PERFORM 1
  FROM public.advisers AS adviser
  WHERE adviser.id = p_adviser_id
    AND adviser.grade = v_student.grade
    AND (
      adviser.section = v_student.section
      OR v_student.section = ANY(coalesce(adviser.sections, ARRAY[]::text[]))
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Student is not assigned to this adviser.';
  END IF;

  UPDATE public.excuse_letters AS excuse_letter
  SET status = p_status,
      decline_reason = CASE
        WHEN p_status = 'Declined' THEN btrim(p_decline_reason)
        ELSE NULL
      END
  WHERE excuse_letter.id = v_letter.id
  RETURNING excuse_letter.* INTO v_letter;

  IF p_status = 'Approved' THEN
    -- A saved section assignment is authoritative for the attendance session.
    SELECT coalesce(section.class_session, v_student.class_session, 'Morning')
    INTO v_session_type
    FROM public.sections AS section
    WHERE section.name = v_student.section
      AND section.grade = v_student.grade
    LIMIT 1;
    v_session_type := coalesce(v_session_type, v_student.class_session, 'Morning');

    SELECT school_year.*
    INTO v_school_year
    FROM public.school_year_config AS school_year
    WHERE school_year.is_active = true
    LIMIT 1;

    IF FOUND THEN
      FOR v_date IN
        SELECT calendar_day.day_value::date
        FROM generate_series(
          v_letter.date_from::timestamp,
          v_letter.date_to::timestamp,
          interval '1 day'
        ) AS calendar_day(day_value)
      LOOP
        IF v_date < v_school_year.start_date OR v_date > v_school_year.end_date THEN
          CONTINUE;
        END IF;

        v_weekday := CASE extract(isodow FROM v_date)::integer
          WHEN 1 THEN 'Mon'
          WHEN 2 THEN 'Tue'
          WHEN 3 THEN 'Wed'
          WHEN 4 THEN 'Thu'
          WHEN 5 THEN 'Fri'
          WHEN 6 THEN 'Sat'
          ELSE 'Sun'
        END;
        IF NOT (coalesce(
          v_school_year.attendance_weekdays,
          ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri']::text[]
        ) @> ARRAY[v_weekday]) THEN
          CONTINUE;
        END IF;

        -- Keep holiday support optional for older schemas where the table has
        -- not been installed yet.
        IF to_regclass('public.school_holidays') IS NOT NULL THEN
          IF EXISTS (
            SELECT 1
            FROM public.school_holidays AS holiday
            WHERE holiday.school_year_config_id = v_school_year.id
              AND holiday.holiday_date = v_date
          ) THEN
            CONTINUE;
          END IF;
        END IF;

        SELECT class_session.scheduled_start::time
        INTO v_session_start
        FROM public.class_sessions AS class_session
        WHERE class_session.session_date = v_date
          AND class_session.session_type = v_session_type
        LIMIT 1;

        -- An approved letter may replace an existing absence, but never a
        -- recorded Present/Late arrival or an already approved excuse.
        UPDATE public.attendance_logs AS attendance_log
        SET status = 'Excused',
            remark = coalesce(
              attendance_log.remark,
              format('Approved excuse letter #%s', v_letter.id)
            )
        WHERE attendance_log.student_db_id = v_student.id
          AND attendance_log.attendance_date = v_date
          AND attendance_log.type = 'Time In'
          AND attendance_log.session_type = v_session_type
          AND attendance_log.status = 'Absent';

        INSERT INTO public.attendance_logs (
          student_db_id,
          student_id,
          attendance_date,
          time_logged,
          type,
          session_type,
          status,
          via,
          remark
        )
        SELECT
          v_student.id,
          v_student.student_id,
          v_date,
          coalesce(v_session_start, time '00:00:00'),
          'Time In',
          v_session_type,
          'Excused',
          'Manual',
          format('Approved excuse letter #%s', v_letter.id)
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.attendance_logs AS existing_log
          WHERE existing_log.student_db_id = v_student.id
            AND existing_log.attendance_date = v_date
            AND existing_log.type = 'Time In'
            AND existing_log.session_type = v_session_type
        );
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    v_letter.id::bigint,
    v_letter.status::text,
    v_letter.student_id::text,
    v_letter.parent_id::bigint,
    v_letter.date_from::date,
    v_letter.date_to::date;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_excuse_letter(bigint, bigint, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_excuse_letter(bigint, bigint, text, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
