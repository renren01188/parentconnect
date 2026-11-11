


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."append_parent_adviser_report_message"("p_report_id" bigint, "p_sender_role" "text", "p_sender_name" "text", "p_body" "text", "p_attachments" "jsonb", "p_thread_type" "text", "p_idempotency_key" "uuid") RETURNS TABLE("message_id" bigint, "message_created_at" timestamp with time zone, "report_status" "text", "duplicate" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_report public.parent_adviser_reports%rowtype;
  v_existing_message public.parent_adviser_report_messages%rowtype;
  v_message_id bigint;
  v_message_created_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_next_status text;
begin
  if p_report_id is null or p_report_id < 1 then
    raise exception 'Invalid report.' using errcode = '22023';
  end if;
  if p_sender_role not in ('parent', 'adviser', 'guidance', 'principal') then
    raise exception 'Invalid sender role.' using errcode = '22023';
  end if;
  if p_thread_type not in ('adviser', 'guidance', 'principal') then
    raise exception 'Invalid report conversation.' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_sender_name)), 0) = 0 then
    raise exception 'Sender name is required.' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_body)), 0) = 0
     and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'Message or attachment is required.' using errcode = '22023';
  end if;

  -- Lock the report first. This serializes a Parent reply and an Adviser
  -- reply, preventing their read receipts and statuses from racing each other.
  select *
  into v_report
  from public.parent_adviser_reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if lower(coalesce(v_report.status, '')) in ('resolved', 'cancelled') then
    raise exception 'This report is closed. You can no longer send messages in this conversation.' using errcode = 'P0001';
  end if;

  -- A browser retry with the same key returns the original saved result and
  -- never creates a second message, receipt, or status change.
  select *
  into v_existing_message
  from public.parent_adviser_report_messages
  where report_id = p_report_id
    and idempotency_key = p_idempotency_key;

  if found then
    return query
    select v_existing_message.id,
           v_existing_message.created_at,
           v_report.status,
           true;
    return;
  end if;

  insert into public.parent_adviser_report_messages (
    report_id,
    sender_role,
    sender_name,
    body,
    thread_type,
    attachments,
    idempotency_key,
    read_by_parent,
    read_by_adviser
  )
  values (
    p_report_id,
    p_sender_role,
    trim(p_sender_name),
    trim(coalesce(p_body, '')),
    p_thread_type,
    coalesce(p_attachments, '[]'::jsonb),
    p_idempotency_key,
    p_sender_role = 'parent',
    p_sender_role in ('adviser', 'guidance', 'principal')
  )
  returning id, created_at into v_message_id, v_message_created_at;

  if p_sender_role in ('adviser', 'guidance', 'principal') then
    -- A staff reply acknowledges all earlier Parent messages in that exact
    -- conversation. It cannot clear a message intended for Guidance or the
    -- Principal while an Adviser is replying in the Adviser thread.
    update public.parent_adviser_report_messages
    set read_by_adviser = true
    where report_id = p_report_id
      and sender_role in ('parent', 'subject_teacher')
      and coalesce(thread_type, 'adviser') = p_thread_type;

    v_next_status := 'replied';
  else
    -- Parent messages make previously replied Adviser conversations active
    -- again. Escalated Guidance/Principal workflow is deliberately retained.
    if p_thread_type = 'adviser' and lower(coalesce(v_report.status, '')) = 'replied' then
      v_next_status := 'ongoing';
    end if;

    -- Every Principal gets a fresh receipt requirement for a new Parent
    -- message, just as the legacy API path did.
    delete from public.principal_notification_reads
    where notif_key = 'principal-report-read-' || p_report_id;

    update public.parent_adviser_report_messages
    set read_by_parent = true
    where report_id = p_report_id
      and sender_role in ('adviser', 'guidance', 'principal');
  end if;

  update public.parent_adviser_reports
  set status = coalesce(v_next_status, status),
      updated_at = v_now,
      last_message_at = v_now,
      status_updated_at = case when v_next_status is null then status_updated_at else v_now end,
      parent_seen_at = case when p_sender_role = 'parent' then v_now else parent_seen_at end
  where id = p_report_id
  returning status into v_next_status;

  return query
  select v_message_id, v_message_created_at, v_next_status, false;
end;
$$;


ALTER FUNCTION "public"."append_parent_adviser_report_message"("p_report_id" bigint, "p_sender_role" "text", "p_sender_name" "text", "p_body" "text", "p_attachments" "jsonb", "p_thread_type" "text", "p_idempotency_key" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_attendance_class_session"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student_grade text;
  v_session_grade text;
  v_session_date date;
  v_session_type text;
  v_session_start time;
BEGIN
  IF NEW.student_db_id IS NOT NULL THEN
    SELECT grade
    INTO v_student_grade
    FROM public.students
    WHERE id = NEW.student_db_id;
  END IF;

  IF NEW.class_session_id IS NULL THEN
    SELECT id, grade, session_date, session_type, scheduled_start
    INTO NEW.class_session_id, v_session_grade, v_session_date, v_session_type, v_session_start
    FROM public.class_sessions
    WHERE session_date = NEW.attendance_date
      AND session_type = NEW.session_type
      AND (grade = v_student_grade OR grade IS NULL)
    ORDER BY CASE WHEN grade = v_student_grade THEN 0 ELSE 1 END
    LIMIT 1;
  ELSE
    SELECT grade, session_date, session_type, scheduled_start
    INTO v_session_grade, v_session_date, v_session_type, v_session_start
    FROM public.class_sessions
    WHERE id = NEW.class_session_id;
  END IF;

  IF NEW.class_session_id IS NOT NULL THEN
    IF v_session_date <> NEW.attendance_date OR v_session_type <> NEW.session_type THEN
      RAISE EXCEPTION 'Attendance log session does not match its date and session type.'
        USING ERRCODE = '23514';
    END IF;
    IF v_session_grade IS NOT NULL
      AND v_student_grade IS NOT NULL
      AND v_session_grade <> v_student_grade THEN
      RAISE EXCEPTION 'Attendance log session grade does not match the student grade.'
        USING ERRCODE = '23514';
    END IF;
    -- Approved excuses are server-side inserts. Ensure their displayed time
    -- comes from the same grade-specific session as the attendance record.
    IF NEW.status = 'Excused' AND NEW.via = 'Manual' THEN
      NEW.time_logged := v_session_start;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_attendance_class_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_parent_report_with_cooldown"("p_report_id" bigint, "p_parent_id" bigint) RETURNS TABLE("cancelled_at" timestamp with time zone, "cooldown_until" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_report public.parent_adviser_reports%rowtype;
  v_opening_sender text;
  v_now timestamptz := clock_timestamp();
  v_cooldown_until timestamptz := v_now + interval '5 minutes';
begin
  select *
  into v_report
  from public.parent_adviser_reports
  where id = p_report_id
    and parent_id = p_parent_id
  for update;

  if not found then
    raise exception 'Report not found.' using errcode = 'P0001';
  end if;
  if v_report.cancelled_at is not null or lower(coalesce(v_report.status, '')) = 'cancelled' then
    raise exception 'This report has already been cancelled.' using errcode = 'P0001';
  end if;
  if lower(coalesce(v_report.status, '')) = 'resolved' then
    raise exception 'Resolved reports cannot be cancelled.' using errcode = 'P0001';
  end if;

  select sender_role
  into v_opening_sender
  from public.parent_adviser_report_messages
  where report_id = p_report_id
  order by created_at asc, id asc
  limit 1;
  if v_opening_sender is distinct from 'parent' then
    raise exception 'Only reports submitted by the Parent can be cancelled.' using errcode = 'P0001';
  end if;

  update public.parent_adviser_reports
  set status = 'cancelled',
      cancelled_at = v_now,
      cancelled_by_parent_id = p_parent_id,
      status_updated_at = v_now,
      updated_at = v_now,
      last_message_at = v_now
  where id = p_report_id;

  -- A pending ticket can no longer be actioned once its source report is
  -- cancelled. Accepted/rejected tickets retain their decision history.
  update public.parent_report_guidance_tickets
  set status = 'rejected',
      rejection_reason = 'Parent cancelled the linked report.',
      decided_at = v_now,
      updated_at = v_now
  where report_id = p_report_id
    and status = 'pending';

  update public.parents
  set report_submission_cooldown_until = v_cooldown_until
  where id = p_parent_id;

  return query select v_now, v_cooldown_until;
end;
$$;


ALTER FUNCTION "public"."cancel_parent_report_with_cooldown"("p_report_id" bigint, "p_parent_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_attendance_student_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.student_db_id IS NOT NULL
    AND (NEW.student_grade_snapshot IS NULL OR NEW.student_section_snapshot IS NULL) THEN
    SELECT
      COALESCE(NEW.student_grade_snapshot, grade),
      COALESCE(NEW.student_section_snapshot, section)
    INTO NEW.student_grade_snapshot, NEW.student_section_snapshot
    FROM public.students
    WHERE id = NEW.student_db_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."capture_attendance_student_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") RETURNS TABLE("failed_attempts" smallint, "locked_until" timestamp with time zone, "captcha_required" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':' || p_subject_hash, 0));
  DELETE FROM public.login_attempt_guards WHERE role = p_role AND subject_hash = p_subject_hash;
  RETURN QUERY SELECT 0::smallint, NULL::timestamptz, false;
END;
$$;


ALTER FUNCTION "public"."clear_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") RETURNS TABLE("failed_attempts" integer, "lockout_level" integer, "locked_until" timestamp with time zone, "captcha_required" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
BEGIN
  IF p_role NOT IN ('parent', 'adviser', 'guidance', 'principal', 'ict')
    OR p_account_hash !~ '^[0-9a-f]{64}$'
    OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login guard parameters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':account:' || p_account_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':ip:' || p_ip_hash, 0));

  UPDATE public.login_attempt_guards
  SET failed_attempts = 0,
      lockout_level = 0,
      locked_until = NULL,
      last_failed_at = NULL,
      updated_at = now()
  WHERE role = p_role
    AND ((scope = 'account' AND subject_hash = p_account_hash)
      OR (scope = 'ip' AND subject_hash = p_ip_hash));

  RETURN QUERY SELECT 0, 0, NULL::timestamptz, false;
END;
$_$;


ALTER FUNCTION "public"."clear_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_parent_password_reset_rate_limit"("p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS TABLE("allowed" boolean, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  limiter public.parent_password_reset_rate_limits%ROWTYPE;
  remaining_seconds integer;
BEGIN
  IF p_subject_hash !~ '^[a-f0-9]{64}$'
    OR p_limit < 1 OR p_limit > 20
    OR p_window_seconds < 60 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid password-reset rate-limit request.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO limiter
  FROM public.parent_password_reset_rate_limits
  WHERE subject_hash = p_subject_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.parent_password_reset_rate_limits (subject_hash, window_started_at, request_count)
    VALUES (p_subject_hash, now(), 1);
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  IF limiter.window_started_at + make_interval(secs => p_window_seconds) <= now() THEN
    UPDATE public.parent_password_reset_rate_limits
    SET window_started_at = now(), request_count = 1
    WHERE subject_hash = p_subject_hash;
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  remaining_seconds := GREATEST(
    1,
    CEIL(EXTRACT(EPOCH FROM (limiter.window_started_at + make_interval(secs => p_window_seconds) - now())))::integer
  );
  IF limiter.request_count >= p_limit THEN
    RETURN QUERY SELECT false, remaining_seconds;
    RETURN;
  END IF;

  UPDATE public.parent_password_reset_rate_limits
  SET request_count = request_count + 1
  WHERE subject_hash = p_subject_hash;
  RETURN QUERY SELECT true, remaining_seconds;
END;
$_$;


ALTER FUNCTION "public"."consume_parent_password_reset_rate_limit"("p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_public_api_rate_limit"("p_scope" "text", "p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS TABLE("allowed" boolean, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if coalesce(length(trim(p_scope)), 0) = 0
     or coalesce(length(trim(p_subject_hash)), 0) = 0
     or p_limit < 1
     or p_window_seconds < 1 then
    raise exception 'Invalid public rate-limit request.' using errcode = '22023';
  end if;

  insert into public.public_api_rate_limits as limits (
    scope, subject_hash, window_started_at, request_count, updated_at
  )
  values (p_scope, p_subject_hash, v_now, 1, v_now)
  on conflict (scope, subject_hash) do update
  set window_started_at = case
        when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
          then v_now
        else limits.window_started_at
      end,
      request_count = case
        when limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
          then 1
        else limits.request_count + 1
      end,
      updated_at = v_now
  returning limits.window_started_at, limits.request_count
  into v_window_started_at, v_request_count;

  return query
  select v_request_count <= p_limit,
         greatest(
           1,
           ceil(extract(epoch from (
             v_window_started_at + make_interval(secs => p_window_seconds) - v_now
           )))::integer
         );
end;
$$;


ALTER FUNCTION "public"."consume_public_api_rate_limit"("p_scope" "text", "p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_subject_teacher_report_otp"("p_email" "text", "p_otp_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  otp_record public.subject_teacher_report_otps%ROWTYPE;
BEGIN
  SELECT *
  INTO otp_record
  FROM public.subject_teacher_report_otps
  WHERE email = lower(btrim(p_email))
  FOR UPDATE;

  IF NOT FOUND
    OR otp_record.expires_at <= now()
    OR otp_record.attempts >= 5 THEN
    RETURN false;
  END IF;

  IF otp_record.otp_hash <> p_otp_hash THEN
    UPDATE public.subject_teacher_report_otps
    SET attempts = LEAST(attempts + 1, 5)
    WHERE email = otp_record.email;
    RETURN false;
  END IF;

  DELETE FROM public.subject_teacher_report_otps
  WHERE email = otp_record.email
    AND otp_hash = otp_record.otp_hash
    AND expires_at > now()
    AND attempts < 5;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."consume_subject_teacher_report_otp"("p_email" "text", "p_otp_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_excuse_letter"("p_letter_id" bigint, "p_adviser_id" bigint, "p_status" "text", "p_decline_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("id" bigint, "status" "text", "student_id" "text", "parent_id" bigint, "date_from" "date", "date_to" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."decide_excuse_letter"("p_letter_id" bigint, "p_adviser_id" bigint, "p_status" "text", "p_decline_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_subject_teacher_report_daily_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  reports_today integer;
BEGIN
  IF NEW.subject_teacher_email IS NULL OR btrim(NEW.subject_teacher_email) = '' THEN
    RETURN NEW;
  END IF;

  NEW.subject_teacher_email := lower(btrim(NEW.subject_teacher_email));
  NEW.subject_teacher_report_date_manila := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Manila')::date;

  -- Serialize requests for the same teacher and Manila calendar date.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.subject_teacher_email || ':' || NEW.subject_teacher_report_date_manila::text, 0));

  SELECT count(*) INTO reports_today
  FROM public.parent_adviser_reports
  WHERE subject_teacher_email = NEW.subject_teacher_email
    AND subject_teacher_report_date_manila = NEW.subject_teacher_report_date_manila;

  IF reports_today >= 2 THEN
    RAISE EXCEPTION 'SUBJECT_TEACHER_DAILY_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_subject_teacher_report_daily_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_subject_teacher_student_report_daily_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  report_count integer;
BEGIN
  IF NEW.report_source <> 'subject_teacher' THEN
    RETURN NEW;
  END IF;

  IF coalesce(btrim(NEW.subject_teacher_email), '') = ''
    OR NEW.subject_teacher_report_date_manila IS NULL
    OR NEW.subject_teacher_submission_key IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Subject Teacher reports require verified sender metadata.';
  END IF;

  -- Serialize the count for one teacher and one Manila calendar day so two
  -- concurrent browser submissions cannot bypass the maximum of two reports.
  PERFORM pg_advisory_xact_lock(
    hashtext(lower(btrim(NEW.subject_teacher_email)) || ':' || NEW.subject_teacher_report_date_manila::text)
  );

  SELECT count(*)::integer
  INTO report_count
  FROM public.student_reports AS report
  WHERE report.report_source = 'subject_teacher'
    AND lower(btrim(report.subject_teacher_email)) = lower(btrim(NEW.subject_teacher_email))
    AND report.subject_teacher_report_date_manila = NEW.subject_teacher_report_date_manila;

  IF report_count >= 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUBJECT_TEACHER_DAILY_LIMIT';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_subject_teacher_student_report_daily_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_attendance_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
declare
  v_student_name text;
  v_message text;
begin
  if new.via is distinct from 'RFID'
     or new.type not in ('Time In', 'Time Out')
     or new.status = 'Absent'
     or not coalesce((select email_enabled from public.attendance_notification_settings where id = true), false) then
    return new;
  end if;

  select concat_ws(' ', first_name, middle_name, last_name, suffix)
  into v_student_name
  from public.students
  where id = new.student_db_id;

  v_message := format(
    E'Your child, %s, recorded attendance at Santiago Elementary School.\\nDate: %s\\nTime: %s',
    coalesce(nullif(v_student_name, ''), new.student_id),
    to_char(new.attendance_date, 'FMMonth FMDD, YYYY'),
    to_char(new.time_logged, 'FMHH12:MI AM')
  );

  with candidates as (
    select p.id, p.email, p.status, p.archive_status, p.attendance_email_notifications
    from public.parents p
    where p.student_id = new.student_id

    union

    select p.id, p.email, p.status, p.archive_status, p.attendance_email_notifications
    from public.parent_student_links link
    join public.parents p on p.id = link.parent_id
    where link.student_id = new.student_id
  ), eligible as (
    select id, lower(trim(email)) as email
    from candidates
    where attendance_email_notifications
      and trim(coalesce(email, '')) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and coalesce(lower(archive_status), '') not in ('archived', 'deleted')
      and lower(trim(regexp_replace(regexp_replace(coalesce(status, ''), '[_-]+', ' ', 'g'), E'\\s+', ' ', 'g'))) not in (
        'deletion pending', 'pending deletion', 'pending', 'pending approval', 'awaiting approval',
        'unapproved', 'rejected', 'denied', 'waiting period', 'suspended', 'blocked', 'deleted',
        'inactive', 'deactivated', 'disabled'
      )
  )
  insert into public.attendance_email_jobs (
    attendance_log_id, parent_id, recipient_email, recipient_key, subject, message,
    status, available_at, last_error
  )
  select new.id, eligible.id, eligible.email,
    'attendance-log:' || new.id || ':parent:' || eligible.id,
    'Attendance recorded', v_message, 'pending', now(), null
  from (
    select distinct on (id) id, email
    from eligible
    order by id
  ) as eligible
  on conflict (attendance_log_id, parent_id) do nothing;

  return new;
end;
$_$;


ALTER FUNCTION "public"."enqueue_attendance_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_attendance_sms_job"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
declare
  v_student_name text;
  v_message text;
begin
  if new.via is distinct from 'RFID'
     or new.type not in ('Time In', 'Time Out')
     or new.status = 'Absent'
     or not coalesce((select sms_enabled from public.attendance_notification_settings where id = true), true) then
    return new;
  end if;

  select concat_ws(' ', first_name, middle_name, last_name, suffix)
  into v_student_name
  from public.students
  where id = new.student_db_id;

  v_message := format(
    'PConnect: Your child, %s, recorded attendance at Santiago Elementary School on %s at %s.',
    coalesce(nullif(v_student_name, ''), new.student_id),
    to_char(new.attendance_date, 'FMMonth FMDD, YYYY'),
    to_char(new.time_logged, 'FMHH12:MI AM')
  );

  with candidates as (
    select p.id, p.contact_number, p.status, p.archive_status, p.attendance_sms_notifications
    from public.parents p
    where p.student_id = new.student_id

    union

    select p.id, p.contact_number, p.status, p.archive_status, p.attendance_sms_notifications
    from public.parent_student_links link
    join public.parents p on p.id = link.parent_id
    where link.student_id = new.student_id
  ), eligible as (
    select id,
      case
        when regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') ~ '^09[0-9]{9}$'
          then regexp_replace(contact_number, '\D', '', 'g')
        when regexp_replace(coalesce(contact_number, ''), '\D', '', 'g') ~ '^639[0-9]{9}$'
          then '0' || substring(regexp_replace(contact_number, '\D', '', 'g') from 3)
      end as phone
    from candidates
    where attendance_sms_notifications
      and coalesce(lower(archive_status), '') not in ('archived', 'deleted')
      and lower(trim(regexp_replace(regexp_replace(coalesce(status, ''), '[_-]+', ' ', 'g'), E'\\s+', ' ', 'g'))) not in (
        'deletion pending', 'pending deletion', 'pending', 'pending approval', 'awaiting approval',
        'unapproved', 'rejected', 'denied', 'waiting period', 'suspended', 'blocked', 'deleted',
        'inactive', 'deactivated', 'disabled'
      )
  )
  insert into public.attendance_sms_jobs (
    attendance_log_id, parent_id, recipient_phone, recipient_key, message,
    status, available_at, last_error
  )
  select new.id, eligible.id, eligible.phone,
    'attendance-log:' || new.id || ':parent:' || eligible.id,
    v_message, 'pending', now(), null
  from (
    select distinct on (id) id, phone
    from eligible
    where phone is not null
    order by id
  ) as eligible
  on conflict (attendance_log_id, parent_id) do nothing;

  return new;
end;
$_$;


ALTER FUNCTION "public"."enqueue_attendance_sms_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") RETURNS TABLE("failed_attempts" smallint, "locked_until" timestamp with time zone, "captcha_required" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  guard public.login_attempt_guards%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':' || p_subject_hash, 0));
  SELECT * INTO guard FROM public.login_attempt_guards WHERE role = p_role AND subject_hash = p_subject_hash FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::smallint, NULL::timestamptz, false;
    RETURN;
  END IF;

  IF guard.locked_until IS NOT NULL AND guard.locked_until <= now() THEN
    UPDATE public.login_attempt_guards
    SET failed_attempts = 0, locked_until = NULL, updated_at = now()
    WHERE role = p_role AND subject_hash = p_subject_hash;
    RETURN QUERY SELECT 0::smallint, NULL::timestamptz, false;
    RETURN;
  END IF;

  RETURN QUERY SELECT guard.failed_attempts, guard.locked_until, guard.failed_attempts >= 3;
END;
$$;


ALTER FUNCTION "public"."get_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") RETURNS TABLE("failed_attempts" integer, "lockout_level" integer, "locked_until" timestamp with time zone, "captcha_required" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  account_guard public.login_attempt_guards%ROWTYPE;
  ip_guard public.login_attempt_guards%ROWTYPE;
  account_attempts integer := 0;
  ip_attempts integer := 0;
  account_level integer := 0;
  ip_level integer := 0;
  current_lock timestamptz;
BEGIN
  IF p_role NOT IN ('parent', 'adviser', 'guidance', 'principal', 'ict')
    OR p_account_hash !~ '^[0-9a-f]{64}$'
    OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login guard parameters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':account:' || p_account_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':ip:' || p_ip_hash, 0));

  SELECT * INTO account_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'account' AND subject_hash = p_account_hash
  FOR UPDATE;

  SELECT * INTO ip_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'ip' AND subject_hash = p_ip_hash
  FOR UPDATE;

  -- An expired lock starts a fresh five-attempt batch. The level is retained:
  -- level 1 is the original 10-minute lock; level 2 is every later 20-minute
  -- lock. This writes the reset atomically for status checks and page reloads.
  IF account_guard.locked_until IS NOT NULL AND account_guard.locked_until <= now() THEN
    account_guard.failed_attempts := 0;
    account_guard.locked_until := NULL;
    UPDATE public.login_attempt_guards
    SET failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE role = p_role AND scope = 'account' AND subject_hash = p_account_hash;
  END IF;
  IF ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until <= now() THEN
    ip_guard.failed_attempts := 0;
    ip_guard.locked_until := NULL;
    UPDATE public.login_attempt_guards
    SET failed_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE role = p_role AND scope = 'ip' AND subject_hash = p_ip_hash;
  END IF;

  -- Retain the established quiet-period behavior for the next lock duration.
  IF account_guard.last_failed_at IS NOT NULL
    AND account_guard.last_failed_at <= now() - interval '24 hours' THEN
    account_guard.lockout_level := 0;
    account_guard.locked_until := NULL;
  END IF;
  IF ip_guard.last_failed_at IS NOT NULL
    AND ip_guard.last_failed_at <= now() - interval '24 hours' THEN
    ip_guard.lockout_level := 0;
    ip_guard.locked_until := NULL;
  END IF;

  account_attempts := COALESCE(account_guard.failed_attempts, 0);
  ip_attempts := COALESCE(ip_guard.failed_attempts, 0);
  account_level := COALESCE(account_guard.lockout_level, 0);
  ip_level := COALESCE(ip_guard.lockout_level, 0);
  current_lock := CASE
    WHEN account_guard.locked_until IS NULL THEN ip_guard.locked_until
    WHEN ip_guard.locked_until IS NULL THEN account_guard.locked_until
    ELSE GREATEST(account_guard.locked_until, ip_guard.locked_until)
  END;

  RETURN QUERY SELECT
    GREATEST(account_attempts, ip_attempts),
    GREATEST(account_level, ip_level),
    current_lock,
    account_attempts >= 3 OR ip_attempts >= 3;
END;
$_$;


ALTER FUNCTION "public"."get_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_students_with_attendance"("p_grade" "text", "p_section" "text", "p_search" "text", "p_filter" "text", "p_limit" integer, "p_offset" integer) RETURNS TABLE("id" integer, "student_id" "text", "full_name" "text", "first_name" "text", "last_name" "text", "gender" "text", "grade" "text", "section" "text", "rfid_card" "text", "created_at" timestamp with time zone, "parent_first_name" "text", "parent_last_name" "text", "relationship" "text", "contact_number" "text", "parent_email" "text", "parent_status" "text", "password_set" integer, "today_status" "text", "attendance_rate" numeric, "total_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
  with today_att as (
    select
      student_db_id,
      max(case
        when type = 'Time In' and status = 'Late'    then 2
        when type = 'Time In' and status = 'On Time' then 1
        else 0
      end) as score
    from attendance_logs
    where attendance_date = current_date
    group by student_db_id
  ),
  att_rate as (
    select
      student_db_id,
      round(
        count(distinct case
          when type = 'Time In' and status in ('On Time', 'Late')
          then attendance_date end) * 100.0
        / nullif(count(distinct attendance_date), 0),
        1
      ) as attendance_rate
    from attendance_logs
    group by student_db_id
  ),
  filtered as (
    select
      s.id,
      s.student_id,
      trim(concat_ws(' ',
        s.first_name,
        nullif(s.middle_name, ''),
        s.last_name,
        nullif(s.suffix, '')
      )) as full_name,
      s.first_name,
      s.last_name,
      s.gender,
      s.grade,
      s.section,
      s.rfid_card,
      s.created_at,
      p.parent_first_name,
      p.parent_last_name,
      p.relationship,
      p.contact_number,
      p.email        as parent_email,
      p.status       as parent_status,
      p.password_set,
      case
        when coalesce(ta.score, 0) >= 2 then 'Late'
        when coalesce(ta.score, 0) >= 1 then 'Present'
        else 'Absent'
      end as today_status,
      coalesce(ar.attendance_rate, 0) as attendance_rate,
      count(*) over () as total_count
    from students s
    left join parents p          on s.student_id = p.student_id
    left join today_att ta       on s.id = ta.student_db_id
    left join att_rate ar        on s.id = ar.student_db_id
    where
      (p_grade    = '' or s.grade   = p_grade)
      and (p_section = '' or s.section = p_section)
      and (
        p_search = ''
        or s.first_name  ilike '%' || p_search || '%'
        or s.last_name   ilike '%' || p_search || '%'
        or s.student_id  ilike '%' || p_search || '%'
      )
      and (
        p_filter = 'All'
        or (p_filter = 'Present' and coalesce(ta.score, 0) = 1)
        or (p_filter = 'Late'    and coalesce(ta.score, 0) >= 2)
        or (p_filter = 'Absent'  and coalesce(ta.score, 0) = 0)
      )
    order by s.last_name asc, s.first_name asc
    limit p_limit offset p_offset
  )
  select * from filtered;
$$;


ALTER FUNCTION "public"."get_students_with_attendance"("p_grade" "text", "p_section" "text", "p_search" "text", "p_filter" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_parent_verification_otp"("p_challenge_id" "uuid", "p_parent_id" integer, "p_purpose" "text", "p_channel" "text", "p_otp_hash" "text", "p_expires_at" timestamp with time zone, "p_resend_available_at" timestamp with time zone, "p_replace_existing" boolean DEFAULT false) RETURNS TABLE("result" "text", "expires_at" timestamp with time zone, "resend_available_at" timestamp with time zone, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_existing public.parent_verification_otps%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_challenge_id IS NULL
    OR p_purpose NOT IN ('signup', 'password_reset')
    OR p_channel NOT IN ('email', 'sms')
    OR coalesce(btrim(p_otp_hash), '') = ''
    OR p_expires_at <= v_now
    OR p_resend_available_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Parent verification challenge.';
  END IF;
  IF (p_purpose = 'signup') <> (p_parent_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid Parent verification challenge owner.';
  END IF;

  IF p_parent_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.parent_verification_otps
    WHERE challenge_id = p_challenge_id
    FOR UPDATE;
  ELSE
    SELECT * INTO v_existing
    FROM public.parent_verification_otps
    WHERE parent_id = p_parent_id
      AND purpose = p_purpose
    FOR UPDATE;
  END IF;

  IF FOUND THEN
    -- Check the failed-code lock before accepting a different email/SMS
    -- request. This survives refreshes, new browser sessions, and switches.
    IF v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
      RETURN QUERY SELECT
        'locked'::text,
        v_existing.expires_at,
        v_existing.resend_available_at,
        greatest(1, ceil(extract(epoch FROM v_existing.locked_until - v_now))::integer);
      RETURN;
    END IF;
    IF p_parent_id IS NOT NULL
      AND v_existing.challenge_id <> p_challenge_id
      AND NOT p_replace_existing THEN
      RETURN QUERY SELECT 'stale'::text, v_existing.expires_at, v_existing.resend_available_at, 0;
      RETURN;
    END IF;
    IF v_existing.resend_available_at > v_now THEN
      RETURN QUERY SELECT
        'cooldown'::text,
        v_existing.expires_at,
        v_existing.resend_available_at,
        greatest(1, ceil(extract(epoch FROM v_existing.resend_available_at - v_now))::integer);
      RETURN;
    END IF;

    UPDATE public.parent_verification_otps
    SET challenge_id = p_challenge_id,
        parent_id = p_parent_id,
        purpose = p_purpose,
        channel = p_channel,
        otp_hash = p_otp_hash,
        expires_at = p_expires_at,
        resend_available_at = p_resend_available_at,
        attempts = 0,
        locked_until = NULL,
        used_at = NULL,
        requested_at = v_now,
        updated_at = v_now
    WHERE challenge_id = v_existing.challenge_id;
  ELSE
    INSERT INTO public.parent_verification_otps (
      challenge_id, parent_id, purpose, channel, otp_hash, expires_at, resend_available_at
    ) VALUES (
      p_challenge_id, p_parent_id, p_purpose, p_channel, p_otp_hash, p_expires_at, p_resend_available_at
    );
  END IF;

  RETURN QUERY SELECT 'issued'::text, p_expires_at, p_resend_available_at, 0;
END;
$$;


ALTER FUNCTION "public"."issue_parent_verification_otp"("p_challenge_id" "uuid", "p_parent_id" integer, "p_purpose" "text", "p_channel" "text", "p_otp_hash" "text", "p_expires_at" timestamp with time zone, "p_resend_available_at" timestamp with time zone, "p_replace_existing" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_attendance_sms_job_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  attendance_type text;
  attendance_date date;
  attendance_time time;
  student_name text;
BEGIN
  SELECT
    attendance_log.type,
    attendance_log.attendance_date::date,
    attendance_log.time_logged::time,
    concat_ws(
      ' ',
      nullif(btrim(student.first_name), ''),
      nullif(btrim(coalesce(student.middle_name, '')), ''),
      nullif(btrim(student.last_name), ''),
      nullif(btrim(coalesce(student.suffix, '')), '')
    )
  INTO attendance_type, attendance_date, attendance_time, student_name
  FROM public.attendance_logs AS attendance_log
  INNER JOIN public.students AS student
    ON student.id = attendance_log.student_db_id
  WHERE attendance_log.id = NEW.attendance_log_id;

  IF NOT FOUND OR attendance_type NOT IN ('Time In', 'Time Out') THEN
    RETURN NEW;
  END IF;

  NEW.message := concat(
    'PConnect: Good Day! ',
    student_name,
    CASE
      WHEN attendance_type = 'Time Out' THEN ' scanned their RFID tag upon leaving the classroom on '
      ELSE ' scanned their RFID tag upon entering the classroom on '
    END,
    btrim(to_char(attendance_date, 'Month')),
    ' ',
    extract(day FROM attendance_date)::integer,
    ', ',
    extract(year FROM attendance_date)::integer,
    ', at ',
    to_char(attendance_time, 'FMHH12:MI AM'),
    '.'
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normalize_attendance_sms_job_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_parent_login_contact_number"("p_value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public'
    AS $_$
  WITH normalized AS (
    SELECT nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g'), '') AS digits
  )
  SELECT CASE
    WHEN digits ~ '^09[0-9]{9}$' THEN digits
    WHEN digits ~ '^9[0-9]{9}$' THEN '0' || digits
    WHEN digits ~ '^639[0-9]{9}$' THEN '0' || substr(digits, 3)
    ELSE NULL
  END
  FROM normalized;
$_$;


ALTER FUNCTION "public"."normalize_parent_login_contact_number"("p_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_principal_announcement_publish"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_sender_name TEXT;
BEGIN
  IF NEW.status = 'Published' AND OLD.status = 'Scheduled' THEN

    -- Get sender name from principals table
    SELECT COALESCE(first_name || ' ' || last_name, 'Principal')
    INTO v_sender_name
    FROM principals
    WHERE id = NEW.sender_id::integer
    LIMIT 1;

    -- Notify parents (Everyone or Parents)
    IF NEW.audience = 'Everyone' OR NEW.audience = 'Parents' THEN
      INSERT INTO parent_announcement_notifications (
        source, announcement_id, parent_id, student_id,
        title, message, sender_name, tab, unread
      )
      SELECT
        'principal',
        NEW.id,
        psl.parent_id,
        psl.student_id::text,
        NEW.title,
        NEW.message,
        v_sender_name,
        'Principal',
        true
      FROM parent_student_links psl
      ON CONFLICT (source, announcement_id, parent_id) DO NOTHING;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_principal_announcement_publish"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_parents_on_principal_announcement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if NEW.status = 'Published' and (OLD.status is distinct from 'Published') then
    insert into public.parent_announcement_notifications 
      (announcement_id, parent_id, student_id, grade, section, created_at, source)
    select
      NEW.id,
      p.id,
      s.student_id,
      s.grade,
      s.section,
      now(),
      'principal'
    from public.parents p
    join public.students s on s.id = p.student_id
    where
      NEW.audience = 'Everyone'
      or NEW.audience = 'Parents';
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."notify_parents_on_principal_announcement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_parents_on_publish"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only fire when status changes TO 'Published'
  IF NEW.status = 'Published' AND OLD.status = 'Scheduled' THEN
    INSERT INTO parent_announcement_notifications (
      source,
      announcement_id,
      parent_id,
      title,
      message,
      sender_name,
      tab,
      unread
    )
    SELECT
      'guidance',
      NEW.id,
      p.id,
      NEW.title,
      NEW.message,
      NEW.guidance_name,
      'Guidance',
      true
    FROM parents p
    WHERE
      NEW.audience = 'Both' OR NEW.audience = 'Parents'
    ON CONFLICT (source, announcement_id, parent_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_parents_on_publish"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_archivable_hard_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion is disabled; archive the selected record instead.';
END;
$$;


ALTER FUNCTION "public"."prevent_archivable_hard_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_audit_log_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END;
$$;


ALTER FUNCTION "public"."prevent_audit_log_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_occupied_section_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  active_student_count integer;
BEGIN
  SELECT count(*)::integer
  INTO active_student_count
  FROM public.students AS student
  WHERE student.grade = OLD.grade
    AND student.section = OLD.name
    AND lower(coalesce(student.archive_status, 'active')) NOT IN ('archived', 'deleted');

  IF active_student_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = format(
        'Cannot delete section "%s" for %s: %s student(s) are still assigned. Remove or reassign them first.',
        OLD.name,
        OLD.grade,
        active_student_count
      );
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_occupied_section_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_attendance_absences"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  manila_now timestamp := timezone('Asia/Manila', now());
  today_date date := timezone('Asia/Manila', now())::date;
  inserted_count integer := 0;
begin
  -- No attendance automation on weekends or outside the active school year.
  if extract(dow from today_date) in (0, 6)
     or not exists (
       select 1 from public.school_year_config
       where is_active = true
         and today_date between start_date and end_date
     ) then
    return 0;
  end if;

  -- Create today's two records once, inheriting the last saved ICT schedule.
  -- The unique (session_date, session_type) index makes this safe on every run.
  insert into public.class_sessions (
    session_date, session_type, scheduled_start, scheduled_end,
    late_after, absent_after, status
  )
  select
    today_date,
    template.session_type,
    template.scheduled_start,
    template.scheduled_end,
    template.late_after,
    template.absent_after,
    'Not Started'
  from (
    select distinct on (session_type)
      session_type, scheduled_start, scheduled_end,
      coalesce(late_after, scheduled_start + interval '30 minutes')::time as late_after,
      coalesce(absent_after, scheduled_end) as absent_after
    from public.class_sessions
    where session_date < today_date
    order by session_type, session_date desc
  ) template
  on conflict (session_date, session_type) do nothing;

  -- Only students with no Time In are marked Absent, and only after the
  -- ICT-configured cutoff for their section's assigned session.
  insert into public.attendance_logs (
    student_db_id, student_id, attendance_date, time_logged,
    type, session_type, status, via, remark
  )
  select
    student.id,
    student.student_id,
    today_date,
    session.absent_after,
    'Time In',
    session.session_type,
    'Absent',
    'Auto',
    'Auto-marked absent after the configured class-session cutoff'
  from public.students student
  join public.sections section
    on section.name = student.section
   and section.grade = student.grade
  join public.class_sessions session
    on session.session_date = today_date
   and session.session_type = section.class_session
  where manila_now::time >= coalesce(session.absent_after, session.scheduled_end)
    -- A student becomes eligible on the Manila calendar date their profile was
    -- created/activated. Never create a retroactive absence before enrollment.
    and timezone('Asia/Manila', student.created_at)::date <= today_date
    and not exists (
      select 1 from public.attendance_logs log
      where log.student_db_id = student.id
        and log.attendance_date = today_date
        and log.session_type = session.session_type
        and log.type = 'Time In'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;


ALTER FUNCTION "public"."process_attendance_absences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_due_adviser_transfers"() RETURNS TABLE("transfer_id" bigint, "outgoing_adviser_id" integer, "incoming_adviser_id" integer, "grade" "text", "section" "text", "completed" boolean, "failure_reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  transfer_row public.scheduled_adviser_transfers%rowtype;
  outgoing_row public.advisers%rowtype;
  incoming_row public.advisers%rowtype;
  outgoing_sections text[];
  incoming_sections text[];
  next_outgoing_sections text[];
  next_incoming_sections text[];
  problem text;
begin
  for transfer_row in
    select *
    from public.scheduled_adviser_transfers
    where status = 'Scheduled' and effective_at <= now()
    order by effective_at, id
    for update skip locked
  loop
    problem := null;

    select * into outgoing_row from public.advisers where id = transfer_row.outgoing_adviser_id for update;
    select * into incoming_row from public.advisers where id = transfer_row.incoming_adviser_id for update;

    if not found or outgoing_row.id is null or incoming_row.id is null then
      problem := 'The outgoing or incoming adviser account no longer exists.';
    elsif outgoing_row.status <> 'active' or coalesce(outgoing_row.archive_status, 'active') <> 'active' then
      problem := 'The outgoing adviser is no longer active.';
    elsif incoming_row.status <> 'active' or coalesce(incoming_row.archive_status, 'active') <> 'active' then
      problem := 'The incoming adviser is no longer active.';
    else
      outgoing_sections := case
        when coalesce(cardinality(outgoing_row.sections), 0) > 0 then outgoing_row.sections
        when outgoing_row.section is not null then array[outgoing_row.section]
        else array[]::text[]
      end;
      incoming_sections := case
        when coalesce(cardinality(incoming_row.sections), 0) > 0 then incoming_row.sections
        when incoming_row.section is not null then array[incoming_row.section]
        else array[]::text[]
      end;

      if outgoing_row.grade is distinct from transfer_row.grade or not (transfer_row.section = any(outgoing_sections)) then
        problem := 'The outgoing adviser no longer owns this grade and section.';
      elsif coalesce(cardinality(incoming_sections), 0) > 0
        and incoming_row.grade is distinct from transfer_row.grade
        and not transfer_row.release_incoming_assignment then
        problem := 'The incoming adviser is assigned to a different grade.';
      elsif not (transfer_row.section = any(incoming_sections))
        and cardinality(incoming_sections) >= 2
        and not (incoming_row.grade is distinct from transfer_row.grade and transfer_row.release_incoming_assignment) then
        problem := 'The incoming adviser already has the maximum of two sections.';
      end if;
    end if;

    if problem is not null then
      update public.scheduled_adviser_transfers
      set status = 'Failed', failure_reason = problem
      where id = transfer_row.id;

      transfer_id := transfer_row.id;
      outgoing_adviser_id := transfer_row.outgoing_adviser_id;
      incoming_adviser_id := transfer_row.incoming_adviser_id;
      grade := transfer_row.grade;
      section := transfer_row.section;
      completed := false;
      failure_reason := problem;
      return next;
      continue;
    end if;

    next_outgoing_sections := array_remove(outgoing_sections, transfer_row.section);
    next_incoming_sections := case
      -- A confirmed relocation releases all of the incoming adviser's former
      -- grade-level sections before assigning the new section.
      when incoming_row.grade is distinct from transfer_row.grade and transfer_row.release_incoming_assignment
        then array[transfer_row.section]
      when transfer_row.section = any(incoming_sections) then incoming_sections
      else array_append(incoming_sections, transfer_row.section)
    end;

    update public.advisers
    set
      grade = case when cardinality(next_outgoing_sections) = 0 then null else outgoing_row.grade end,
      section = next_outgoing_sections[1],
      sections = next_outgoing_sections,
      updated_at = now()
    where id = outgoing_row.id;

    update public.advisers
    set
      grade = transfer_row.grade,
      section = next_incoming_sections[1],
      sections = next_incoming_sections,
      updated_at = now()
    where id = incoming_row.id;

    update public.scheduled_adviser_transfers
    set status = 'Completed', completed_at = now(), failure_reason = null
    where id = transfer_row.id;

    transfer_id := transfer_row.id;
    outgoing_adviser_id := transfer_row.outgoing_adviser_id;
    incoming_adviser_id := transfer_row.incoming_adviser_id;
    grade := transfer_row.grade;
    section := transfer_row.section;
    completed := true;
    failure_reason := null;
    return next;
  end loop;
end;
$$;


ALTER FUNCTION "public"."process_due_adviser_transfers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_failed_login_attempt"("p_role" "text", "p_subject_hash" "text") RETURNS TABLE("failed_attempts" smallint, "locked_until" timestamp with time zone, "captcha_required" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  guard public.login_attempt_guards%ROWTYPE;
  next_attempts smallint;
  next_lock timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':' || p_subject_hash, 0));
  SELECT * INTO guard FROM public.login_attempt_guards WHERE role = p_role AND subject_hash = p_subject_hash FOR UPDATE;

  IF NOT FOUND THEN
    next_attempts := 1;
  ELSIF guard.locked_until IS NOT NULL AND guard.locked_until > now() THEN
    RETURN QUERY SELECT guard.failed_attempts, guard.locked_until, true;
    RETURN;
  ELSIF guard.locked_until IS NOT NULL AND guard.locked_until <= now() THEN
    next_attempts := 1;
  ELSE
    next_attempts := LEAST(guard.failed_attempts + 1, 5);
  END IF;

  next_lock := CASE WHEN next_attempts >= 5 THEN now() + interval '10 minutes' ELSE NULL END;

  INSERT INTO public.login_attempt_guards(role, subject_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_role, p_subject_hash, next_attempts, next_lock, now())
  ON CONFLICT (role, subject_hash) DO UPDATE
  SET failed_attempts = EXCLUDED.failed_attempts,
      locked_until = EXCLUDED.locked_until,
      updated_at = EXCLUDED.updated_at;

  RETURN QUERY SELECT next_attempts, next_lock, next_attempts >= 3;
END;
$$;


ALTER FUNCTION "public"."record_failed_login_attempt"("p_role" "text", "p_subject_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_failed_login_attempt_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") RETURNS TABLE("failed_attempts" integer, "lockout_level" integer, "locked_until" timestamp with time zone, "captcha_required" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  account_guard public.login_attempt_guards%ROWTYPE;
  ip_guard public.login_attempt_guards%ROWTYPE;
  account_attempts integer := 0;
  ip_attempts integer := 0;
  account_level integer := 0;
  ip_level integer := 0;
  account_lock timestamptz;
  ip_lock timestamptz;
  current_lock timestamptz;
BEGIN
  IF p_role NOT IN ('parent', 'adviser', 'guidance', 'principal', 'ict')
    OR p_account_hash !~ '^[0-9a-f]{64}$'
    OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid login guard parameters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':account:' || p_account_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_role || ':ip:' || p_ip_hash, 0));

  SELECT * INTO account_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'account' AND subject_hash = p_account_hash
  FOR UPDATE;

  SELECT * INTO ip_guard
  FROM public.login_attempt_guards
  WHERE role = p_role AND scope = 'ip' AND subject_hash = p_ip_hash
  FOR UPDATE;

  -- A new failure after an expired lock is the first of a new batch. This is
  -- intentionally evaluated with database time before checking for a lock.
  IF account_guard.locked_until IS NOT NULL AND account_guard.locked_until <= now() THEN
    account_guard.failed_attempts := 0;
    account_guard.locked_until := NULL;
  END IF;
  IF ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until <= now() THEN
    ip_guard.failed_attempts := 0;
    ip_guard.locked_until := NULL;
  END IF;

  IF account_guard.last_failed_at IS NOT NULL
    AND account_guard.last_failed_at <= now() - interval '24 hours' THEN
    account_guard.lockout_level := 0;
    account_guard.locked_until := NULL;
  END IF;
  IF ip_guard.last_failed_at IS NOT NULL
    AND ip_guard.last_failed_at <= now() - interval '24 hours' THEN
    ip_guard.lockout_level := 0;
    ip_guard.locked_until := NULL;
  END IF;

  IF (account_guard.locked_until IS NOT NULL AND account_guard.locked_until > now())
    OR (ip_guard.locked_until IS NOT NULL AND ip_guard.locked_until > now()) THEN
    current_lock := CASE
      WHEN account_guard.locked_until IS NULL THEN ip_guard.locked_until
      WHEN ip_guard.locked_until IS NULL THEN account_guard.locked_until
      ELSE GREATEST(account_guard.locked_until, ip_guard.locked_until)
    END;
    RETURN QUERY SELECT
      GREATEST(COALESCE(account_guard.failed_attempts, 0), COALESCE(ip_guard.failed_attempts, 0)),
      GREATEST(COALESCE(account_guard.lockout_level, 0), COALESCE(ip_guard.lockout_level, 0)),
      current_lock,
      true;
    RETURN;
  END IF;

  account_attempts := COALESCE(account_guard.failed_attempts, 0) + 1;
  ip_attempts := COALESCE(ip_guard.failed_attempts, 0) + 1;
  account_level := CASE
    WHEN account_attempts >= 5 THEN
      CASE WHEN COALESCE(account_guard.lockout_level, 0) >= 1 THEN 2 ELSE 1 END
    ELSE COALESCE(account_guard.lockout_level, 0)
  END;
  ip_level := CASE
    WHEN ip_attempts >= 5 THEN
      CASE WHEN COALESCE(ip_guard.lockout_level, 0) >= 1 THEN 2 ELSE 1 END
    ELSE COALESCE(ip_guard.lockout_level, 0)
  END;
  account_lock := CASE
    WHEN account_attempts >= 5 THEN now() + make_interval(mins => account_level * 10)
    ELSE NULL
  END;
  ip_lock := CASE
    WHEN ip_attempts >= 5 THEN now() + make_interval(mins => ip_level * 10)
    ELSE NULL
  END;

  INSERT INTO public.login_attempt_guards(
    role, scope, subject_hash, failed_attempts, lockout_level, locked_until, updated_at, last_failed_at
  ) VALUES
    (p_role, 'account', p_account_hash, account_attempts, account_level, account_lock, now(), now()),
    (p_role, 'ip', p_ip_hash, ip_attempts, ip_level, ip_lock, now(), now())
  ON CONFLICT (role, scope, subject_hash) DO UPDATE
  SET failed_attempts = EXCLUDED.failed_attempts,
      lockout_level = EXCLUDED.lockout_level,
      locked_until = EXCLUDED.locked_until,
      updated_at = EXCLUDED.updated_at,
      last_failed_at = EXCLUDED.last_failed_at;

  current_lock := CASE
    WHEN account_lock IS NULL THEN ip_lock
    WHEN ip_lock IS NULL THEN account_lock
    ELSE GREATEST(account_lock, ip_lock)
  END;

  RETURN QUERY SELECT
    GREATEST(account_attempts, ip_attempts),
    GREATEST(account_level, ip_level),
    current_lock,
    account_attempts >= 3 OR ip_attempts >= 3;
END;
$_$;


ALTER FUNCTION "public"."record_failed_login_attempt_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_manual_excuse"("p_student_id" "text", "p_adviser_id" bigint, "p_date_from" "date", "p_date_to" "date", "p_reason" "text") RETURNS TABLE("excuse_letter_id" bigint, "student_db_id" bigint, "student_id" "text", "date_from" "date", "date_to" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_school_year public.school_year_config%ROWTYPE;
  v_excuse_letter_id bigint;
  v_reason text;
BEGIN
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF nullif(btrim(coalesce(p_student_id, '')), '') IS NULL
    OR p_adviser_id IS NULL
    OR p_date_from IS NULL
    OR p_date_to IS NULL
    OR v_reason IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Student, reason, start date, and end date are required.';
  END IF;
  IF p_date_to < p_date_from THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'End date cannot be before start date.';
  END IF;

  SELECT student.*
  INTO v_student
  FROM public.students AS student
  WHERE student.student_id = btrim(p_student_id)
    AND coalesce(student.archive_status, 'active') = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Student not found.';
  END IF;

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

  SELECT school_year.*
  INTO v_school_year
  FROM public.school_year_config AS school_year
  WHERE school_year.is_active = true
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'An active school year is required before recording an excuse.';
  END IF;
  IF p_date_from < v_school_year.start_date OR p_date_to > v_school_year.end_date THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = format(
        'Excuse dates must fall within the active school year (%s to %s).',
        v_school_year.start_date,
        v_school_year.end_date
      );
  END IF;

  -- Repeating the same save is idempotent: return the original manual
  -- excuse and do not create another letter or attendance row.
  SELECT excuse_letter.id
  INTO v_excuse_letter_id
  FROM public.excuse_letters AS excuse_letter
  WHERE excuse_letter.student_id = v_student.student_id
    AND excuse_letter.status = 'Approved'
    AND excuse_letter.date_from = p_date_from
    AND excuse_letter.date_to = p_date_to
    AND excuse_letter.message = v_reason
    AND excuse_letter.submitted_by_role = 'Adviser'
    AND excuse_letter.submitted_by_id = p_adviser_id
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_excuse_letter_id, v_student.id, v_student.student_id, p_date_from, p_date_to;
    RETURN;
  END IF;

  INSERT INTO public.excuse_letters (
    student_id,
    parent_id,
    date_from,
    date_to,
    message,
    status,
    submitted_by_role,
    submitted_by_id
  ) VALUES (
    v_student.student_id,
    NULL,
    p_date_from,
    p_date_to,
    v_reason,
    'Pending',
    'Adviser',
    p_adviser_id
  )
  RETURNING id INTO v_excuse_letter_id;

  -- Use the exact decision routine from the Adviser Approval modal. This
  -- applies the configured weekday range, holidays, session assignment,
  -- existing-absence replacement, and no-duplicate safeguards in one place.
  PERFORM public.decide_excuse_letter(
    v_excuse_letter_id,
    p_adviser_id,
    'Approved',
    NULL
  );

  RETURN QUERY SELECT v_excuse_letter_id, v_student.id, v_student.student_id, p_date_from, p_date_to;
END;
$$;


ALTER FUNCTION "public"."record_manual_excuse"("p_student_id" "text", "p_adviser_id" bigint, "p_date_from" "date", "p_date_to" "date", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_staff_employee_id_registry"("p_employee_id_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.staff_employee_ids
  WHERE employee_id_key = p_employee_id_key;

  INSERT INTO public.staff_employee_ids (
    employee_id_key, employee_id, account_role, account_id, updated_at
  )
  SELECT employee_id_key, employee_id, account_role, account_id, now()
  FROM (
    SELECT lower(btrim(employee_id)) AS employee_id_key, btrim(employee_id) AS employee_id,
      'Adviser'::text AS account_role, id::bigint AS account_id, 1 AS role_order
    FROM public.advisers
    WHERE btrim(coalesce(employee_id, '')) <> ''
    UNION ALL
    SELECT lower(btrim(employee_id)), btrim(employee_id), 'ICT'::text, id::bigint, 2
    FROM public.ict_admins
    WHERE btrim(coalesce(employee_id, '')) <> ''
    UNION ALL
    SELECT lower(btrim(employee_id)), btrim(employee_id), 'Guidance'::text, id::bigint, 3
    FROM public.guidance_counselors
    WHERE btrim(coalesce(employee_id, '')) <> ''
    UNION ALL
    SELECT lower(btrim(employee_id)), btrim(employee_id), 'Principal'::text, id::bigint, 4
    FROM public.principals
    WHERE btrim(coalesce(employee_id, '')) <> ''
  ) AS staff_records
  WHERE employee_id_key = p_employee_id_key
  ORDER BY role_order, account_id
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."refresh_staff_employee_id_registry"("p_employee_id_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_sensitive_audit_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE audit_text text := lower(coalesce(NEW.details, '') || ' ' || coalesce(NEW.metadata::text, '') || ' ' || coalesce(NEW.changes::text, ''));
BEGIN
  IF audit_text ~ '"[^" ]*(password|otp|captcha|token|secret|authorization|cookie|credential)[^" ]*"\\s*:' THEN
    RAISE EXCEPTION 'sensitive credential fields are not permitted in audit_log';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reject_sensitive_audit_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_attendance_sms_dispatch_lease"("p_owner_token" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Only the invocation that acquired the lease may release it.  This avoids
  -- a late-finishing worker unlocking a newer worker's lease.
  UPDATE public.attendance_sms_dispatch_leases
  SET
    owner_token = NULL,
    locked_until = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE lease_name = 'attendance-sms-dispatch'
    AND owner_token = p_owner_token;
END;
$$;


ALTER FUNCTION "public"."release_attendance_sms_dispatch_lease"("p_owner_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_section"("p_section_id" integer, "p_grade" "text", "p_old_name" "text", "p_new_name" "text") RETURNS TABLE("id" integer, "name" "text", "grade" "text", "class_session" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_section public.sections%ROWTYPE;
  v_grade text := btrim(coalesce(p_grade, ''));
  v_old_name text := btrim(coalesce(p_old_name, ''));
  v_new_name text := btrim(coalesce(p_new_name, ''));
BEGIN
  IF p_section_id IS NULL OR p_section_id <= 0
    OR v_grade = '' OR v_old_name = '' OR v_new_name = '' THEN
    RAISE EXCEPTION 'SECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Lock and verify the exact original row. Qualifying every table column is
  -- required because id, name, grade, and class_session are output variables.
  SELECT section_row.* INTO v_section
  FROM public.sections AS section_row
  WHERE section_row.id = p_section_id
    AND section_row.grade = v_grade
    AND section_row.name = v_old_name
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sections AS candidate
    WHERE lower(btrim(candidate.grade)) = lower(v_grade)
      AND lower(btrim(candidate.name)) = lower(v_new_name)
      AND candidate.id <> p_section_id
  ) THEN
    RAISE EXCEPTION 'SECTION_NAME_EXISTS' USING ERRCODE = '23505';
  END IF;

  -- Keep the existing row and its class session; the students foreign key
  -- cascades the renamed canonical section assignment.
  UPDATE public.sections AS section_row
  SET name = v_new_name
  WHERE section_row.id = p_section_id
  RETURNING section_row.* INTO v_section;

  -- Update display-only section labels that are not foreign-key backed.
  UPDATE public.students AS student_row
  SET target_section = v_new_name
  WHERE student_row.target_grade = v_grade
    AND student_row.target_section = v_old_name;

  UPDATE public.advisers AS adviser_row
  SET section = CASE WHEN adviser_row.section = v_old_name THEN v_new_name ELSE adviser_row.section END,
      sections = CASE
        WHEN v_old_name = ANY(COALESCE(adviser_row.sections, '{}'::text[]))
          THEN array_replace(adviser_row.sections, v_old_name, v_new_name)
        ELSE adviser_row.sections
      END
  WHERE adviser_row.grade = v_grade
    AND (
      adviser_row.section = v_old_name
      OR v_old_name = ANY(COALESCE(adviser_row.sections, '{}'::text[]))
    );

  UPDATE public.parent_adviser_reports AS report_row
  SET section = v_new_name
  WHERE report_row.grade = v_grade
    AND report_row.section = v_old_name;

  UPDATE public.student_reports AS report_row
  SET section = v_new_name
  WHERE report_row.grade = v_grade
    AND report_row.section = v_old_name;

  UPDATE public.parent_announcement_notifications AS notification_row
  SET section = v_new_name
  WHERE notification_row.grade = v_grade
    AND notification_row.section = v_old_name;

  UPDATE public.adviser_announcements AS announcement_row
  SET sections = array_replace(announcement_row.sections, v_old_name, v_new_name)
  WHERE announcement_row.grade = v_grade
    AND v_old_name = ANY(COALESCE(announcement_row.sections, '{}'::text[]));

  UPDATE public.scheduled_adviser_transfers AS transfer_row
  SET section = v_new_name
  WHERE transfer_row.grade = v_grade
    AND transfer_row.section = v_old_name;

  RETURN QUERY
  SELECT v_section.id, v_section.name, v_section.grade, v_section.class_session;
END;
$$;


ALTER FUNCTION "public"."rename_section"("p_section_id" integer, "p_grade" "text", "p_old_name" "text", "p_new_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_sections"("p_renames" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_rename jsonb;
BEGIN
  IF jsonb_typeof(p_renames) <> 'array' THEN
    RAISE EXCEPTION 'SECTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR v_rename IN SELECT value FROM jsonb_array_elements(p_renames)
  LOOP
    PERFORM public.rename_section(
      (v_rename ->> 'id')::integer,
      v_rename ->> 'grade',
      v_rename ->> 'old_name',
      v_rename ->> 'new_name'
    );
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rename_sections"("p_renames" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_student_lrn"("p_student_db_id" integer, "p_new_student_id" "text") RETURNS TABLE("id" integer, "student_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_student public.students%rowtype;
  v_new_student_id text := regexp_replace(coalesce(p_new_student_id, ''), '\D', '', 'g');
begin
  if v_new_student_id !~ '^\d{12}$' then
    raise exception 'An LRN must contain exactly 12 digits.' using errcode = '22023';
  end if;

  select * into v_student
  from public.students
  where students.id = p_student_db_id
  for update;

  if not found then
    raise exception 'Student record not found.' using errcode = 'P0002';
  end if;

  if v_student.student_id = v_new_student_id then
    return query select v_student.id, v_student.student_id;
    return;
  end if;

  if exists (
    select 1 from public.students
    where students.student_id = v_new_student_id
      and students.id <> p_student_db_id
  ) then
    raise exception 'The replacement LRN is already assigned to another student.' using errcode = '23505';
  end if;

  update public.students
  set student_id = v_new_student_id
  where students.id = p_student_db_id;

  return query
  select students.id, students.student_id
  from public.students
  where students.id = p_student_db_id;
end;
$_$;


ALTER FUNCTION "public"."rename_student_lrn"("p_student_db_id" integer, "p_new_student_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_parent_password_with_otp"("p_parent_id" bigint, "p_otp_hash" "text", "p_password_hash" "text", "p_parent_name" "text", "p_parent_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  otp_record public.parent_password_reset_otps%ROWTYPE;
  updated_rows integer;
BEGIN
  IF p_parent_id IS NULL
    OR coalesce(btrim(p_otp_hash), '') = ''
    OR coalesce(btrim(p_password_hash), '') = '' THEN
    RAISE EXCEPTION 'Invalid password-reset request.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO otp_record
  FROM public.parent_password_reset_otps
  WHERE parent_id = p_parent_id
  FOR UPDATE;

  IF NOT FOUND
    OR otp_record.expires_at <= now()
    OR otp_record.attempts >= 5 THEN
    RETURN false;
  END IF;

  IF otp_record.otp_hash <> p_otp_hash THEN
    UPDATE public.parent_password_reset_otps
    SET attempts = LEAST(attempts + 1, 5)
    WHERE parent_id = p_parent_id;
    RETURN false;
  END IF;

  UPDATE public.parents
  SET password = p_password_hash,
      -- The existing deployments use either a boolean or integer flag. The
      -- unknown literal is coerced by PostgreSQL to the column's real type.
      password_set = '1',
      temp_password = NULL,
      temporary_password_expires_at = NULL,
      reset_token = NULL,
      reset_token_expiry = NULL
  WHERE id = p_parent_id
    AND lower(coalesce(password_set::text, '')) IN ('1', 'true');
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RETURN false;
  END IF;

  -- This marker and the password replacement commit together. Middleware and
  -- protected APIs reject every token issued at or before this timestamp.
  INSERT INTO public.audit_log (
    action, performed_by, performed_by_role,
    target_user, target_role, target_email, target_type, target_id,
    module, details
  ) VALUES (
    'Password Session Revoked', p_parent_name, 'Parent',
    p_parent_name, 'Parent', p_parent_email, 'user', p_parent_id::text,
    'Auth', 'Password reset completed after email OTP verification; all earlier sessions were revoked.'
  );

  DELETE FROM public.parent_password_reset_otps
  WHERE parent_id = p_parent_id
    AND otp_hash = otp_record.otp_hash;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."reset_parent_password_with_otp"("p_parent_id" bigint, "p_otp_hash" "text", "p_password_hash" "text", "p_parent_name" "text", "p_parent_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_attendance_sms_job_idempotency_key"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
    NEW.idempotency_key := 'attendance-sms:v1:' || COALESCE(
      NULLIF(NEW.recipient_key, ''),
      'attendance-log:' || NEW.attendance_log_id::text || ':legacy-job:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_attendance_sms_job_idempotency_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_student_report_date_manila"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.report_date_manila := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Manila')::date;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_student_report_date_manila"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."parent_adviser_reports" (
    "id" bigint NOT NULL,
    "parent_id" bigint,
    "parent_email" "text" NOT NULL,
    "parent_name" "text" NOT NULL,
    "adviser_id" bigint,
    "adviser_name" "text" NOT NULL,
    "student_id" "text" NOT NULL,
    "student_name" "text" NOT NULL,
    "grade" "text",
    "section" "text",
    "subject" "text" NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "concern_level" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "escalated_to_guidance" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_seen_at" timestamp with time zone,
    "status_updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "escalated_to_principal" boolean DEFAULT false NOT NULL,
    "guidance_seen_at" timestamp with time zone,
    "allow_history_access" boolean,
    "subject_teacher_email" "text",
    "subject_teacher_report_date_manila" "date",
    "cancelled_at" timestamp with time zone,
    "cancelled_by_parent_id" bigint,
    "subject_teacher_submission_key" "uuid",
    "resolved_by_role" "text",
    CONSTRAINT "parent_adviser_reports_resolved_by_role_check" CHECK ((("resolved_by_role" IS NULL) OR ("resolved_by_role" = ANY (ARRAY['Adviser'::"text", 'Guidance'::"text", 'Principal'::"text"]))))
);


ALTER TABLE "public"."parent_adviser_reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."parent_adviser_reports"."allow_history_access" IS 'True permits Principal history access; false denies it; null means a forwarded Student Concern is awaiting the parent choice.';



COMMENT ON COLUMN "public"."parent_adviser_reports"."cancelled_at" IS 'When the reporting parent cancelled this report. Cancelled reports remain available to authorized staff.';



COMMENT ON COLUMN "public"."parent_adviser_reports"."cancelled_by_parent_id" IS 'The parent account that cancelled the report for audit and authorization purposes.';



COMMENT ON COLUMN "public"."parent_adviser_reports"."resolved_by_role" IS 'The staff role that actually resolved a report: Adviser, Guidance, or Principal.';



CREATE OR REPLACE FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_created_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."parent_adviser_reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_report public.parent_adviser_reports;
BEGIN
  IF btrim(coalesce(p_concern, '')) = '' OR btrim(coalesce(p_teacher_name, '')) = '' THEN
    RAISE EXCEPTION 'A Subject Teacher name and concern are required.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.parent_adviser_reports (
    parent_id, parent_email, parent_name, adviser_id, adviser_name,
    student_id, student_name, grade, section, subject, categories,
    concern_level, status, escalated_to_guidance, escalated_to_principal,
    parent_seen_at, subject_teacher_email, status_updated_at, updated_at,
    last_message_at, created_at
  ) VALUES (
    p_parent_id, p_parent_email, p_parent_name, p_adviser_id, p_adviser_name,
    p_student_id, p_student_name, p_grade, p_section, p_subject, ARRAY['Subject Teacher'],
    0, 'new', false, false,
    NULL, lower(btrim(p_subject_teacher_email)), p_created_at, p_created_at,
    p_created_at, p_created_at
  ) RETURNING * INTO new_report;

  INSERT INTO public.parent_adviser_report_messages (
    report_id, sender_role, sender_name, body, thread_type, read_by_parent, read_by_adviser
  ) VALUES (
    new_report.id, 'subject_teacher', p_teacher_name, p_concern, 'adviser', false, false
  );

  RETURN new_report;
END;
$$;


ALTER FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_created_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."parent_adviser_reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_report public.parent_adviser_reports;
BEGIN
  IF p_submission_key IS NULL THEN
    RAISE EXCEPTION 'A submission key is required.' USING ERRCODE = '22023';
  END IF;

  IF btrim(coalesce(p_concern, '')) = '' OR btrim(coalesce(p_teacher_name, '')) = '' THEN
    RAISE EXCEPTION 'A Subject Teacher name and concern are required.' USING ERRCODE = '22023';
  END IF;

  -- A retry after a completed request returns the original report before the
  -- daily-limit trigger runs. The unique index below handles concurrent calls.
  SELECT *
  INTO new_report
  FROM public.parent_adviser_reports
  WHERE subject_teacher_submission_key = p_submission_key
  LIMIT 1;
  IF FOUND THEN
    RETURN new_report;
  END IF;

  BEGIN
    INSERT INTO public.parent_adviser_reports (
      parent_id, parent_email, parent_name, adviser_id, adviser_name,
      student_id, student_name, grade, section, subject, categories,
      concern_level, status, escalated_to_guidance, escalated_to_principal,
      parent_seen_at, subject_teacher_email, subject_teacher_submission_key,
      status_updated_at, updated_at, last_message_at, created_at
    ) VALUES (
      p_parent_id, p_parent_email, p_parent_name, p_adviser_id, p_adviser_name,
      p_student_id, p_student_name, p_grade, p_section, p_subject, ARRAY['Subject Teacher'],
      0, 'new', false, false,
      NULL, lower(btrim(p_subject_teacher_email)), p_submission_key,
      p_created_at, p_created_at, p_created_at, p_created_at
    ) RETURNING * INTO new_report;

    INSERT INTO public.parent_adviser_report_messages (
      report_id, sender_role, sender_name, body, thread_type, read_by_parent, read_by_adviser
    ) VALUES (
      new_report.id, 'subject_teacher', p_teacher_name, p_concern, 'adviser', false, false
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO new_report
      FROM public.parent_adviser_reports
      WHERE subject_teacher_submission_key = p_submission_key
      LIMIT 1;
      IF FOUND THEN
        RETURN new_report;
      END IF;
      RAISE;
  END;

  RETURN new_report;
END;
$$;


ALTER FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_categories" "text"[], "p_created_at" timestamp with time zone DEFAULT "now"()) RETURNS "public"."parent_adviser_reports"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_report public.parent_adviser_reports;
  normalized_categories text[];
BEGIN
  IF p_submission_key IS NULL THEN
    RAISE EXCEPTION 'A submission key is required.' USING ERRCODE = '22023';
  END IF;

  IF btrim(coalesce(p_concern, '')) = '' OR btrim(coalesce(p_teacher_name, '')) = '' THEN
    RAISE EXCEPTION 'A Subject Teacher name and concern are required.' USING ERRCODE = '22023';
  END IF;

  IF p_categories IS NULL OR cardinality(p_categories) = 0 OR EXISTS (
    SELECT 1
    FROM unnest(p_categories) AS submitted(category)
    WHERE category IS NULL
      OR category NOT IN (
        'Academic Concern', 'Health/Medical', 'Behavioral Issue', 'Attendance',
        'Other', 'Permission Request', 'General Inquiry'
      )
  ) THEN
    RAISE EXCEPTION 'At least one valid concern category is required.' USING ERRCODE = '22023';
  END IF;

  -- Preserve the order chosen in the form while storing each category once.
  SELECT COALESCE(array_agg(category ORDER BY first_position), ARRAY[]::text[])
  INTO normalized_categories
  FROM (
    SELECT category, MIN(position) AS first_position
    FROM unnest(p_categories) WITH ORDINALITY AS submitted(category, position)
    GROUP BY category
  ) AS distinct_categories;

  -- A retry after a completed request returns the original report before the
  -- daily-limit trigger runs. The unique index handles concurrent calls.
  SELECT *
  INTO new_report
  FROM public.parent_adviser_reports
  WHERE subject_teacher_submission_key = p_submission_key
  LIMIT 1;
  IF FOUND THEN
    RETURN new_report;
  END IF;

  BEGIN
    INSERT INTO public.parent_adviser_reports (
      parent_id, parent_email, parent_name, adviser_id, adviser_name,
      student_id, student_name, grade, section, subject, categories,
      concern_level, status, escalated_to_guidance, escalated_to_principal,
      parent_seen_at, subject_teacher_email, subject_teacher_submission_key,
      status_updated_at, updated_at, last_message_at, created_at
    ) VALUES (
      p_parent_id, p_parent_email, p_parent_name, p_adviser_id, p_adviser_name,
      p_student_id, p_student_name, p_grade, p_section, p_subject, normalized_categories,
      0, 'new', false, false,
      NULL, lower(btrim(p_subject_teacher_email)), p_submission_key,
      p_created_at, p_created_at, p_created_at, p_created_at
    ) RETURNING * INTO new_report;

    INSERT INTO public.parent_adviser_report_messages (
      report_id, sender_role, sender_name, body, thread_type, read_by_parent, read_by_adviser
    ) VALUES (
      new_report.id, 'subject_teacher', p_teacher_name, p_concern, 'adviser', false, false
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO new_report
      FROM public.parent_adviser_reports
      WHERE subject_teacher_submission_key = p_submission_key
      LIMIT 1;
      IF FOUND THEN
        RETURN new_report;
      END IF;
      RAISE;
  END;

  RETURN new_report;
END;
$$;


ALTER FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_categories" "text"[], "p_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_deletion_email_job_items"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  delete from public.deletion_email_job_items
  where deletion_email_job_id = new.id;

  insert into public.deletion_email_job_items (deletion_email_job_id, scheduled_deletion_id)
  select new.id, item.scheduled_deletion_id
  from unnest(new.scheduled_deletion_ids) as item(scheduled_deletion_id);

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_deletion_email_job_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_parent_deletion_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- A Parent must not be notified while an adviser request is PendingICT.
  -- An ICT approval changes the record to Scheduled, which creates exactly
  -- one notification for the matching Parent account.
  if new.target_type = 'parent' and new.status = 'Scheduled' then
    insert into public.parent_deletion_notifications (parent_id, scheduled_deletion_id)
    select parent.id, new.id
    from public.parents as parent
    where parent.id::text = new.target_id
    on conflict (parent_id, scheduled_deletion_id) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_parent_deletion_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_parent_login_contact_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.login_contact_number := public.normalize_parent_login_contact_number(NEW.contact_number);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_parent_login_contact_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_scheduled_deletion_references"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
begin
  delete from public.scheduled_deletion_targets
  where scheduled_deletion_id = new.id;

  if new.target_type = 'student' and new.target_id ~ '^[0-9]+$' then
    insert into public.scheduled_deletion_targets (scheduled_deletion_id, student_id)
    values (new.id, new.target_id::bigint);
  elsif new.target_type = 'parent' and new.target_id ~ '^[0-9]+$' then
    insert into public.scheduled_deletion_targets (scheduled_deletion_id, parent_id)
    values (new.id, new.target_id::bigint);
  elsif new.target_type = 'adviser' and new.target_id ~ '^[0-9]+$' then
    insert into public.scheduled_deletion_targets (scheduled_deletion_id, adviser_id)
    values (new.id, new.target_id::bigint);
  elsif new.target_type = 'ict' and new.target_id ~ '^[0-9]+$' then
    insert into public.scheduled_deletion_targets (scheduled_deletion_id, ict_admin_id)
    values (new.id, new.target_id::bigint);
  else
    raise exception 'Invalid scheduled-deletion target: type %, id %', new.target_type, new.target_id;
  end if;

  delete from public.scheduled_deletion_requesters
  where scheduled_deletion_id = new.id;

  if new.requested_by_role = 'Adviser' then
    insert into public.scheduled_deletion_requesters (scheduled_deletion_id, adviser_id)
    values (new.id, new.requested_by_id);
  elsif new.requested_by_role = 'ICT' then
    insert into public.scheduled_deletion_requesters (scheduled_deletion_id, ict_admin_id)
    values (new.id, new.requested_by_id);
  else
    raise exception 'Invalid scheduled-deletion requester role: %', new.requested_by_role;
  end if;

  return new;
end;
$_$;


ALTER FUNCTION "public"."sync_scheduled_deletion_references"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_staff_employee_id_registry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_employee_id_key text;
  old_employee_id_key text;
  existing_role text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_employee_id_key := lower(btrim(coalesce(OLD.employee_id, '')));
    IF old_employee_id_key <> '' THEN
      DELETE FROM public.staff_employee_ids
      WHERE employee_id_key = old_employee_id_key
        AND account_role = TG_ARGV[0]
        AND account_id = OLD.id;

      IF FOUND THEN
        PERFORM public.refresh_staff_employee_id_registry(old_employee_id_key);
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  new_employee_id_key := lower(btrim(coalesce(NEW.employee_id, '')));
  old_employee_id_key := '';
  IF TG_OP = 'UPDATE' THEN
    old_employee_id_key := lower(btrim(coalesce(OLD.employee_id, '')));
  END IF;

  -- Legacy blank IDs are not claimed by the registry. New server endpoints
  -- require a non-empty Employee ID before a row can be created or edited.
  IF new_employee_id_key = '' THEN
    IF TG_OP = 'UPDATE' AND old_employee_id_key <> '' THEN
      DELETE FROM public.staff_employee_ids
      WHERE employee_id_key = old_employee_id_key
        AND account_role = TG_ARGV[0]
        AND account_id = OLD.id;
      IF FOUND THEN
        PERFORM public.refresh_staff_employee_id_registry(old_employee_id_key);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.staff_employee_ids (
    employee_id_key, employee_id, account_role, account_id, updated_at
  ) VALUES (
    new_employee_id_key, btrim(NEW.employee_id), TG_ARGV[0], NEW.id, now()
  )
  ON CONFLICT (employee_id_key) DO UPDATE
  SET employee_id = EXCLUDED.employee_id,
      updated_at = now()
  WHERE public.staff_employee_ids.account_role = EXCLUDED.account_role
    AND public.staff_employee_ids.account_id = EXCLUDED.account_id;

  IF NOT FOUND THEN
    SELECT account_role
    INTO existing_role
    FROM public.staff_employee_ids
    WHERE employee_id_key = new_employee_id_key;

    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = format(
        'Employee ID "%s" is already assigned to a %s account.',
        btrim(NEW.employee_id),
        coalesce(existing_role, 'staff')
      );
  END IF;

  IF TG_OP = 'UPDATE'
    AND old_employee_id_key <> ''
    AND old_employee_id_key <> new_employee_id_key THEN
    DELETE FROM public.staff_employee_ids
    WHERE employee_id_key = old_employee_id_key
      AND account_role = TG_ARGV[0]
      AND account_id = OLD.id;
    IF FOUND THEN
      PERFORM public.refresh_staff_employee_id_registry(old_employee_id_key);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_staff_employee_id_registry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_attendance_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_attendance_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_attendance_notification_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_attendance_notification_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_attendance_sms_job"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_attendance_sms_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_deletion_email_job"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_deletion_email_job"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."try_acquire_attendance_sms_dispatch_lease"("p_owner_token" "uuid", "p_lease_seconds" integer DEFAULT 120) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  -- Keep the lease bounded even if an environment variable or caller is
  -- misconfigured.  A crashed Vercel invocation then self-recovers.
  UPDATE public.attendance_sms_dispatch_leases
  SET
    owner_token = p_owner_token,
    locked_until = clock_timestamp() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 30), 240)),
    updated_at = clock_timestamp()
  WHERE lease_name = 'attendance-sms-dispatch'
    AND locked_until <= clock_timestamp()
  RETURNING true INTO v_acquired;

  RETURN v_acquired;
END;
$$;


ALTER FUNCTION "public"."try_acquire_attendance_sms_dispatch_lease"("p_owner_token" "uuid", "p_lease_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_parent_verification_otp"("p_challenge_id" "uuid", "p_purpose" "text", "p_otp_hash" "text") RETURNS TABLE("result" "text", "parent_id" integer, "channel" "text", "expires_at" timestamp with time zone, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_challenge public.parent_verification_otps%ROWTYPE;
  v_now timestamptz := now();
  v_attempts smallint;
  v_wait interval;
  v_locked_until timestamptz;
BEGIN
  SELECT * INTO v_challenge
  FROM public.parent_verification_otps
  WHERE challenge_id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND OR v_challenge.purpose <> p_purpose THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::integer, NULL::text, NULL::timestamptz, 0;
    RETURN;
  END IF;
  IF v_challenge.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 'used'::text, v_challenge.parent_id, v_challenge.channel, v_challenge.expires_at, 0;
    RETURN;
  END IF;
  IF v_challenge.expires_at <= v_now THEN
    RETURN QUERY SELECT 'expired'::text, v_challenge.parent_id, v_challenge.channel, v_challenge.expires_at, 0;
    RETURN;
  END IF;
  IF v_challenge.locked_until IS NOT NULL AND v_challenge.locked_until > v_now THEN
    RETURN QUERY SELECT
      'locked'::text,
      v_challenge.parent_id,
      v_challenge.channel,
      v_challenge.expires_at,
      greatest(1, ceil(extract(epoch FROM v_challenge.locked_until - v_now))::integer);
    RETURN;
  END IF;
  IF v_challenge.otp_hash <> p_otp_hash THEN
    v_attempts := v_challenge.attempts + 1;
    v_wait := CASE
      WHEN v_attempts = 1 THEN interval '1 minute'
      WHEN v_attempts = 2 THEN interval '2 minutes'
      WHEN v_attempts = 3 THEN interval '3 minutes'
      ELSE interval '10 minutes'
    END;
    v_locked_until := v_now + v_wait;
    UPDATE public.parent_verification_otps
    SET attempts = v_attempts,
        locked_until = v_locked_until,
        updated_at = v_now
    WHERE challenge_id = v_challenge.challenge_id;
    RETURN QUERY SELECT
      'incorrect'::text,
      v_challenge.parent_id,
      v_challenge.channel,
      v_challenge.expires_at,
      ceil(extract(epoch FROM v_wait))::integer;
    RETURN;
  END IF;

  UPDATE public.parent_verification_otps
  SET used_at = v_now,
      locked_until = NULL,
      updated_at = v_now
  WHERE challenge_id = v_challenge.challenge_id;

  RETURN QUERY SELECT 'verified'::text, v_challenge.parent_id, v_challenge.channel, v_challenge.expires_at, 0;
END;
$$;


ALTER FUNCTION "public"."verify_parent_verification_otp"("p_challenge_id" "uuid", "p_purpose" "text", "p_otp_hash" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."adviser_announcements" (
    "id" bigint NOT NULL,
    "adviser_id" bigint NOT NULL,
    "adviser_name" "text" NOT NULL,
    "grade" "text",
    "sections" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'Published'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "adviser_announcements_status_check" CHECK (("status" = ANY (ARRAY['Published'::"text", 'Scheduled'::"text", 'Cancelled'::"text"])))
);


ALTER TABLE "public"."adviser_announcements" OWNER TO "postgres";


ALTER TABLE "public"."adviser_announcements" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."adviser_announcements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."adviser_assignment_history" (
    "id" bigint NOT NULL,
    "adviser_id" integer NOT NULL,
    "request_id" bigint,
    "previous_grade" "text",
    "previous_sections" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "new_grade" "text",
    "new_sections" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "approved_by_ict_id" integer,
    "effective_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."adviser_assignment_history" OWNER TO "postgres";


ALTER TABLE "public"."adviser_assignment_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."adviser_assignment_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."adviser_change_requests" (
    "id" bigint NOT NULL,
    "adviser_id" integer NOT NULL,
    "adviser_name" "text" NOT NULL,
    "adviser_email" "text" NOT NULL,
    "adviser_initials" "text" NOT NULL,
    "class_grade" "text" NOT NULL,
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "changes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "note" "text",
    "reviewed_at" timestamp with time zone,
    "review_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by_ict_id" integer,
    CONSTRAINT "adviser_change_requests_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Rejected'::"text"])))
);


ALTER TABLE "public"."adviser_change_requests" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."adviser_change_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."adviser_change_requests_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."adviser_change_requests_id_seq" OWNED BY "public"."adviser_change_requests"."id";



CREATE TABLE IF NOT EXISTS "public"."adviser_notification_reads" (
    "id" bigint NOT NULL,
    "adviser_id" bigint NOT NULL,
    "notif_key" "text" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."adviser_notification_reads" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."adviser_notification_reads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."adviser_notification_reads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."adviser_notification_reads_id_seq" OWNED BY "public"."adviser_notification_reads"."id";



CREATE TABLE IF NOT EXISTS "public"."adviser_principal_messages" (
    "id" bigint NOT NULL,
    "adviser_id" bigint NOT NULL,
    "adviser_name" "text" NOT NULL,
    "adviser_email" "text",
    "principal_id" bigint NOT NULL,
    "subject" "text" NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'unread'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_staff_message_id" bigint,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."adviser_principal_messages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."adviser_principal_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."adviser_principal_messages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."adviser_principal_messages_id_seq" OWNED BY "public"."adviser_principal_messages"."id";



CREATE TABLE IF NOT EXISTS "public"."adviser_report_favorites" (
    "adviser_id" integer NOT NULL,
    "report_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."adviser_report_favorites" OWNER TO "postgres";


COMMENT ON TABLE "public"."adviser_report_favorites" IS 'Private Adviser report favorites; intentionally separate from report state and read receipts.';



CREATE TABLE IF NOT EXISTS "public"."advisers" (
    "id" integer NOT NULL,
    "employee_id" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "grade" "text",
    "section" "text",
    "status" "text" DEFAULT 'active'::"text",
    "password_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sections" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "middle_name" "text",
    "password_set" boolean DEFAULT false,
    "suffix" "text",
    "class_session" "text",
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_reason" "text",
    "archive_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archive_previous_status" "text",
    "notifications_last_seen_at" timestamp with time zone,
    "adviser_attendance_guide_completed_at" timestamp with time zone,
    "adviser_reports_guide_completed_at" timestamp with time zone,
    "adviser_dashboard_guide_completed_at" timestamp with time zone,
    CONSTRAINT "advisers_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."advisers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."advisers"."adviser_attendance_guide_completed_at" IS 'Timestamp when the adviser completed the RFID Attendance quick guide.';



COMMENT ON COLUMN "public"."advisers"."adviser_reports_guide_completed_at" IS 'Timestamp when the adviser completed the Reports & Messages quick guide.';



COMMENT ON COLUMN "public"."advisers"."adviser_dashboard_guide_completed_at" IS 'Timestamp when the adviser completed the Dashboard quick guide.';



CREATE SEQUENCE IF NOT EXISTS "public"."advisers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."advisers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."advisers_id_seq" OWNED BY "public"."advisers"."id";



CREATE TABLE IF NOT EXISTS "public"."attendance_email_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attendance_log_id" bigint NOT NULL,
    "parent_id" integer,
    "recipient_email" "text",
    "recipient_key" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "provider" "text",
    "provider_message_id" "text",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_email_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "attendance_email_jobs_provider_check" CHECK (("provider" = 'brevo'::"text")),
    CONSTRAINT "attendance_email_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."attendance_email_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_logs" (
    "id" integer NOT NULL,
    "student_db_id" integer,
    "student_id" "text",
    "attendance_date" "date" NOT NULL,
    "time_logged" time without time zone NOT NULL,
    "type" "text",
    "status" "text",
    "via" "text" DEFAULT 'RFID'::"text",
    "remark" "text",
    "session_type" "text" NOT NULL,
    "class_session_id" integer,
    "scan_request_id" "text",
    "student_grade_snapshot" "text",
    "student_section_snapshot" "text",
    "parent_recording_source" "text",
    CONSTRAINT "attendance_logs_parent_recording_source_check" CHECK ((("parent_recording_source" IS NULL) OR ("parent_recording_source" = ANY (ARRAY['RFID'::"text", 'Manual'::"text"])))),
    CONSTRAINT "attendance_logs_scan_request_id_length" CHECK ((("scan_request_id" IS NULL) OR (("char_length"("scan_request_id") >= 16) AND ("char_length"("scan_request_id") <= 128)))),
    CONSTRAINT "attendance_logs_session_type_check" CHECK (("session_type" = ANY (ARRAY['Morning'::"text", 'Afternoon'::"text"]))),
    CONSTRAINT "attendance_logs_type_check" CHECK (("type" = ANY (ARRAY['Time In'::"text", 'Time Out'::"text"])))
);


ALTER TABLE "public"."attendance_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."attendance_logs"."parent_recording_source" IS 'Immutable Parent attendance source: RFID scans or Today''s Manual Attendance only. Adviser Edit Attendance does not modify this value.';



CREATE SEQUENCE IF NOT EXISTS "public"."attendance_logs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."attendance_logs_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."attendance_logs_id_seq" OWNED BY "public"."attendance_logs"."id";



CREATE TABLE IF NOT EXISTS "public"."attendance_notification_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "sms_enabled" boolean DEFAULT true NOT NULL,
    "email_enabled" boolean DEFAULT false NOT NULL,
    "sms_low_credit_threshold" integer DEFAULT 50 NOT NULL,
    "sms_credit_balance" integer,
    "sms_credits_checked_at" timestamp with time zone,
    "sms_credits_check_error" "text",
    "updated_by_ict_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_notification_settings_id_check" CHECK ("id"),
    CONSTRAINT "attendance_notification_settings_sms_credit_balance_check" CHECK ((("sms_credit_balance" IS NULL) OR ("sms_credit_balance" >= 0))),
    CONSTRAINT "attendance_notification_settings_sms_low_credit_threshold_check" CHECK (("sms_low_credit_threshold" >= 0))
);


ALTER TABLE "public"."attendance_notification_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_sms_dispatch_leases" (
    "lease_name" "text" NOT NULL,
    "owner_token" "uuid",
    "locked_until" timestamp with time zone DEFAULT '-infinity'::timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_sms_dispatch_leases_lease_name_check" CHECK (("lease_name" = 'attendance-sms-dispatch'::"text"))
);


ALTER TABLE "public"."attendance_sms_dispatch_leases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_sms_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attendance_log_id" bigint NOT NULL,
    "parent_id" integer,
    "recipient_phone" "text",
    "recipient_key" "text" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "provider" "text",
    "provider_message_id" "text",
    "provider_status" "text",
    "provider_response" "jsonb",
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_requested_at" timestamp with time zone,
    "provider_accepted_at" timestamp with time zone,
    "idempotency_key" "text" NOT NULL,
    "reconciliation_required_at" timestamp with time zone,
    "reconciled_at" timestamp with time zone,
    "retry_eligible_at" timestamp with time zone,
    "reconciliation_attempts" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "attendance_sms_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "attendance_sms_jobs_provider_check" CHECK (("provider" = ANY (ARRAY['semaphore'::"text", 'unisms'::"text"]))),
    CONSTRAINT "attendance_sms_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text", 'reconciliation_required'::"text", 'retry_eligible'::"text"])))
);


ALTER TABLE "public"."attendance_sms_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_sms_provider_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "attendance_sms_job_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "provider" "text",
    "provider_message_id" "text",
    "provider_status" "text",
    "detail" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attendance_sms_provider_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "action" "text" NOT NULL,
    "target_user" "text" NOT NULL,
    "target_role" "text" NOT NULL,
    "target_email" "text" NOT NULL,
    "performed_by" "text" DEFAULT 'ICT Admin'::"text" NOT NULL,
    "details" "text",
    "changes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text",
    "browser" "text",
    "module" "text",
    "performed_by_role" "text",
    "performed_by_id" "text",
    "performed_by_email" "text",
    "target_type" "text" DEFAULT 'System'::"text" NOT NULL,
    "target_id" "text",
    "previous_status" "text",
    "new_status" "text",
    "related_report_id" "text",
    "related_ticket_id" "text",
    "related_student_id" "text",
    "related_user_id" "text",
    "metadata" "jsonb",
    CONSTRAINT "audit_log_action_check" CHECK (("char_length"(TRIM(BOTH FROM "action")) > 0)),
    CONSTRAINT "audit_log_target_role_check" CHECK (("char_length"(TRIM(BOTH FROM "target_role")) > 0))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."class_sessions" (
    "id" integer NOT NULL,
    "session_date" "date" NOT NULL,
    "session_type" "text" NOT NULL,
    "scheduled_start" time without time zone NOT NULL,
    "scheduled_end" time without time zone NOT NULL,
    "status" "text" DEFAULT 'Not Started'::"text" NOT NULL,
    "actual_start" timestamp with time zone,
    "actual_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "late_after" time without time zone,
    "absent_after" time without time zone,
    "grade" "text",
    CONSTRAINT "class_sessions_session_type_check" CHECK (("session_type" = ANY (ARRAY['Morning'::"text", 'Afternoon'::"text"]))),
    CONSTRAINT "class_sessions_status_check" CHECK (("status" = ANY (ARRAY['Not Started'::"text", 'Active'::"text", 'Ended'::"text"])))
);


ALTER TABLE "public"."class_sessions" OWNER TO "postgres";


ALTER TABLE "public"."class_sessions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."class_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contact_us_messages" (
    "id" bigint NOT NULL,
    "idempotency_key" "uuid" NOT NULL,
    "sender_name" "text" NOT NULL,
    "sender_email" "text" NOT NULL,
    "sender_phone" "text",
    "subject" "text" NOT NULL,
    "message" "text" NOT NULL,
    "notification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "notification_error" "text",
    "notified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_us_messages_notification_status_check" CHECK (("notification_status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."contact_us_messages" OWNER TO "postgres";


ALTER TABLE "public"."contact_us_messages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contact_us_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."excuse_letters" (
    "id" integer NOT NULL,
    "student_id" "text" NOT NULL,
    "parent_id" integer,
    "date_from" "date" NOT NULL,
    "date_to" "date" NOT NULL,
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "decline_reason" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "file_name" "text",
    "file_data" "text",
    "file_type" "text",
    "attachment_uploaded_at" timestamp with time zone,
    "submitted_by_role" "text" DEFAULT 'Parent'::"text" NOT NULL,
    "submitted_by_id" bigint,
    CONSTRAINT "excuse_letters_single_attachment_fields_check" CHECK (((("file_name" IS NULL) AND ("file_type" IS NULL) AND ("file_data" IS NULL)) OR ((("length"("btrim"("file_name")) >= 1) AND ("length"("btrim"("file_name")) <= 180)) AND (("length"("btrim"("file_type")) >= 1) AND ("length"("btrim"("file_type")) <= 120)) AND ("length"("file_data") > 0)))),
    CONSTRAINT "excuse_letters_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Declined'::"text"])))
);


ALTER TABLE "public"."excuse_letters" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."excuse_letters_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."excuse_letters_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."excuse_letters_id_seq" OWNED BY "public"."excuse_letters"."id";



CREATE TABLE IF NOT EXISTS "public"."guidance_announcements" (
    "id" bigint NOT NULL,
    "guidance_id" bigint NOT NULL,
    "guidance_name" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "audience" "text" NOT NULL,
    "status" "text" DEFAULT 'Published'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "emails_sent" boolean DEFAULT false,
    CONSTRAINT "guidance_announcements_audience_check" CHECK (("audience" = ANY (ARRAY['Class Advisers'::"text", 'Parents'::"text", 'Both'::"text"]))),
    CONSTRAINT "guidance_announcements_status_check" CHECK (("status" = ANY (ARRAY['Published'::"text", 'Scheduled'::"text"])))
);


ALTER TABLE "public"."guidance_announcements" OWNER TO "postgres";


ALTER TABLE "public"."guidance_announcements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."guidance_announcements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."guidance_change_requests" (
    "id" bigint NOT NULL,
    "guidance_id" bigint NOT NULL,
    "guidance_name" "text" NOT NULL,
    "guidance_email" "text" NOT NULL,
    "guidance_initials" "text" NOT NULL,
    "changes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by_ict_id" bigint,
    "review_note" "text",
    CONSTRAINT "guidance_change_requests_status_check" CHECK (("status" = ANY (ARRAY['Pending'::"text", 'Approved'::"text", 'Rejected'::"text"])))
);


ALTER TABLE "public"."guidance_change_requests" OWNER TO "postgres";


ALTER TABLE "public"."guidance_change_requests" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."guidance_change_requests_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."guidance_counselors" (
    "id" bigint NOT NULL,
    "employee_id" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text",
    "last_name" "text" NOT NULL,
    "suffix" "text",
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "password_set" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_reason" "text",
    "archive_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archive_previous_status" "text",
    "guidance_reports_guide_completed_at" timestamp with time zone,
    "guidance_dashboard_guide_completed_at" timestamp with time zone,
    CONSTRAINT "guidance_counselors_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."guidance_counselors" OWNER TO "postgres";


COMMENT ON COLUMN "public"."guidance_counselors"."guidance_reports_guide_completed_at" IS 'Timestamp when the Guidance Counselor completed the Reports quick guide.';



COMMENT ON COLUMN "public"."guidance_counselors"."guidance_dashboard_guide_completed_at" IS 'Timestamp when the Guidance Counselor completed the Dashboard quick guide.';



CREATE SEQUENCE IF NOT EXISTS "public"."guidance_counselors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."guidance_counselors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."guidance_counselors_id_seq" OWNED BY "public"."guidance_counselors"."id";



CREATE TABLE IF NOT EXISTS "public"."guidance_notification_reads" (
    "id" integer NOT NULL,
    "guidance_id" integer NOT NULL,
    "notif_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."guidance_notification_reads" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."guidance_notification_reads_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."guidance_notification_reads_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."guidance_notification_reads_id_seq" OWNED BY "public"."guidance_notification_reads"."id";



CREATE TABLE IF NOT EXISTS "public"."guidance_report_favorites" (
    "guidance_id" bigint NOT NULL,
    "report_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guidance_report_favorites" OWNER TO "postgres";


COMMENT ON TABLE "public"."guidance_report_favorites" IS 'Private Guidance report favorites; intentionally separate from report state and read receipts.';



CREATE TABLE IF NOT EXISTS "public"."guidance_ticket_reads" (
    "guidance_id" bigint NOT NULL,
    "ticket_id" bigint NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guidance_ticket_reads" OWNER TO "postgres";


COMMENT ON TABLE "public"."guidance_ticket_reads" IS 'Per-Guidance-counselor receipts for accepted parent-report tickets.';



COMMENT ON COLUMN "public"."guidance_ticket_reads"."read_at" IS 'When this counselor viewed the accepted ticket from the Guidance Reports screen.';



CREATE TABLE IF NOT EXISTS "public"."ict_admins" (
    "id" bigint NOT NULL,
    "employee_id" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text",
    "last_name" "text" NOT NULL,
    "suffix" "text",
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "password_hash" "text" NOT NULL,
    "password_set" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_reason" "text",
    "archive_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archive_previous_status" "text",
    "ict_dashboard_guide_completed_at" timestamp with time zone,
    CONSTRAINT "ict_admins_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ict_admins" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ict_admins"."ict_dashboard_guide_completed_at" IS 'Timestamp when the ICT Administrator completed the Dashboard quick guide.';



CREATE SEQUENCE IF NOT EXISTS "public"."ict_admins_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ict_admins_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ict_admins_id_seq" OWNED BY "public"."ict_admins"."id";



CREATE TABLE IF NOT EXISTS "public"."ict_announcements" (
    "id" bigint NOT NULL,
    "sender_id" bigint NOT NULL,
    "sender_name" "text",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "audience" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "status" "text" DEFAULT 'Published'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "emails_sent" boolean DEFAULT false
);


ALTER TABLE "public"."ict_announcements" OWNER TO "postgres";


ALTER TABLE "public"."ict_announcements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ict_announcements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ict_notification_reads" (
    "id" bigint NOT NULL,
    "ict_id" bigint NOT NULL,
    "notif_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ict_notification_reads" OWNER TO "postgres";


ALTER TABLE "public"."ict_notification_reads" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ict_notification_reads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."login_attempt_guards" (
    "role" "text" NOT NULL,
    "subject_hash" "text" NOT NULL,
    "failed_attempts" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scope" "text" DEFAULT 'account'::"text" NOT NULL,
    "lockout_level" integer DEFAULT 0 NOT NULL,
    "last_failed_at" timestamp with time zone,
    CONSTRAINT "login_attempt_guards_failed_attempts_check" CHECK (("failed_attempts" >= 0)),
    CONSTRAINT "login_attempt_guards_lockout_level_check" CHECK (("lockout_level" >= 0)),
    CONSTRAINT "login_attempt_guards_role_check" CHECK (("role" = ANY (ARRAY['parent'::"text", 'adviser'::"text", 'guidance'::"text", 'principal'::"text", 'ict'::"text"]))),
    CONSTRAINT "login_attempt_guards_scope_check" CHECK (("scope" = ANY (ARRAY['account'::"text", 'ip'::"text"]))),
    CONSTRAINT "login_attempt_guards_subject_hash_check" CHECK (("char_length"("subject_hash") = 64))
);


ALTER TABLE "public"."login_attempt_guards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_account_change_notifications" (
    "id" bigint NOT NULL,
    "parent_id" integer NOT NULL,
    "student_id" "text",
    "change_scope" "text" NOT NULL,
    "changed_fields" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "actor_role" "text" NOT NULL,
    "actor_name" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parent_account_change_notifications_actor_role_check" CHECK (("actor_role" = ANY (ARRAY['Adviser'::"text", 'ICT'::"text"]))),
    CONSTRAINT "parent_account_change_notifications_change_scope_check" CHECK (("change_scope" = ANY (ARRAY['student'::"text", 'parent_account'::"text"])))
);


ALTER TABLE "public"."parent_account_change_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."parent_account_change_notifications" IS 'Durable Parent notification-feed records for adviser or ICT updates to a child or Parent account.';



ALTER TABLE "public"."parent_account_change_notifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."parent_account_change_notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."parent_adviser_report_messages" (
    "id" bigint NOT NULL,
    "report_id" bigint NOT NULL,
    "sender_role" "text" NOT NULL,
    "sender_name" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_by_parent" boolean DEFAULT false NOT NULL,
    "read_by_adviser" boolean DEFAULT false NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "thread_type" "text" DEFAULT 'adviser'::"text" NOT NULL,
    "idempotency_key" "uuid",
    CONSTRAINT "parent_adviser_report_messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['parent'::"text", 'adviser'::"text", 'principal'::"text", 'guidance'::"text", 'subject_teacher'::"text"]))),
    CONSTRAINT "parent_adviser_report_messages_thread_type_check" CHECK (("thread_type" = ANY (ARRAY['adviser'::"text", 'guidance'::"text", 'principal'::"text"])))
);


ALTER TABLE "public"."parent_adviser_report_messages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."parent_adviser_report_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."parent_adviser_report_messages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."parent_adviser_report_messages_id_seq" OWNED BY "public"."parent_adviser_report_messages"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."parent_adviser_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."parent_adviser_reports_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."parent_adviser_reports_id_seq" OWNED BY "public"."parent_adviser_reports"."id";



CREATE TABLE IF NOT EXISTS "public"."parent_announcement_notifications" (
    "id" bigint NOT NULL,
    "announcement_id" bigint NOT NULL,
    "parent_id" bigint NOT NULL,
    "student_id" "text",
    "grade" "text",
    "section" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'adviser'::"text",
    "title" "text",
    "message" "text",
    "sender_name" "text",
    "unread" boolean DEFAULT true NOT NULL,
    "tab" "text" DEFAULT 'Principal'::"text" NOT NULL,
    CONSTRAINT "parent_announcement_notifications_source_check" CHECK (("source" = ANY (ARRAY['adviser'::"text", 'guidance'::"text", 'principal'::"text", 'ict'::"text"])))
);


ALTER TABLE "public"."parent_announcement_notifications" OWNER TO "postgres";


ALTER TABLE "public"."parent_announcement_notifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."parent_announcement_notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."parent_attendance_notification_reads" (
    "parent_id" integer NOT NULL,
    "attendance_log_id" bigint NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parent_attendance_notification_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_deletion_notifications" (
    "id" bigint NOT NULL,
    "parent_id" integer NOT NULL,
    "scheduled_deletion_id" bigint NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parent_deletion_notifications" OWNER TO "postgres";


ALTER TABLE "public"."parent_deletion_notifications" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."parent_deletion_notifications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."parent_password_reset_otps" (
    "parent_id" integer NOT NULL,
    "otp_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parent_password_reset_otps_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 5))),
    CONSTRAINT "parent_password_reset_otps_otp_hash_check" CHECK (("char_length"("otp_hash") = 64))
);


ALTER TABLE "public"."parent_password_reset_otps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_password_reset_rate_limits" (
    "subject_hash" "text" NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "parent_password_reset_rate_limits_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."parent_password_reset_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_report_guidance_tickets" (
    "id" bigint NOT NULL,
    "report_id" bigint NOT NULL,
    "parent_id" bigint NOT NULL,
    "student_id" "text" NOT NULL,
    "adviser_id" bigint,
    "concern" "text" NOT NULL,
    "message" "text" DEFAULT ''::"text" NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "rejection_reason" "text",
    "assigned_guidance_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parent_report_guidance_tickets_rejection_reason" CHECK ((("status" <> 'rejected'::"text") OR (NULLIF("btrim"(COALESCE("rejection_reason", ''::"text")), ''::"text") IS NOT NULL))),
    CONSTRAINT "parent_report_guidance_tickets_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."parent_report_guidance_tickets" OWNER TO "postgres";


ALTER TABLE "public"."parent_report_guidance_tickets" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."parent_report_guidance_tickets_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."parent_student_links" (
    "id" bigint NOT NULL,
    "parent_id" bigint NOT NULL,
    "student_id" "text" NOT NULL,
    "relationship" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parent_student_links" OWNER TO "postgres";


ALTER TABLE "public"."parent_student_links" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."parent_student_links_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."parent_verification_otps" (
    "challenge_id" "uuid" NOT NULL,
    "parent_id" integer,
    "purpose" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "otp_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "resend_available_at" timestamp with time zone NOT NULL,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    "used_at" timestamp with time zone,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parent_verification_otps_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "parent_verification_otps_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'sms'::"text"]))),
    CONSTRAINT "parent_verification_otps_purpose_check" CHECK (("purpose" = ANY (ARRAY['signup'::"text", 'password_reset'::"text"])))
);


ALTER TABLE "public"."parent_verification_otps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parents" (
    "id" integer NOT NULL,
    "student_id" "text",
    "parent_first_name" "text" NOT NULL,
    "parent_middle_name" "text",
    "parent_last_name" "text" NOT NULL,
    "parent_suffix" "text",
    "relationship" "text",
    "contact_number" "text",
    "email" "text",
    "temp_password" "text",
    "password" "text" NOT NULL,
    "password_set" integer DEFAULT 0,
    "status" "text" DEFAULT 'approved'::"text",
    "reset_token" "text",
    "reset_token_expiry" timestamp with time zone,
    "address" "text",
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_reason" "text",
    "archive_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archive_previous_status" "text",
    "parent_dashboard_guide_completed_at" timestamp with time zone,
    "parent_attendance_guide_completed_at" timestamp with time zone,
    "parent_reports_guide_completed_at" timestamp with time zone,
    "temporary_password_expires_at" timestamp with time zone,
    "attendance_email_notifications" boolean DEFAULT false NOT NULL,
    "attendance_sms_notifications" boolean DEFAULT true NOT NULL,
    "report_submission_cooldown_until" timestamp with time zone,
    "attendance_notification_preference" "text",
    "login_contact_number" "text",
    "parent_remarks" "text",
    CONSTRAINT "parents_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."parents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."parents"."parent_dashboard_guide_completed_at" IS 'Timestamp when the parent completed the Parent Dashboard quick guide.';



COMMENT ON COLUMN "public"."parents"."parent_attendance_guide_completed_at" IS 'Timestamp when the parent completed the Parent Attendance quick guide.';



COMMENT ON COLUMN "public"."parents"."parent_reports_guide_completed_at" IS 'Timestamp when the parent completed the Parent Reports quick guide.';



COMMENT ON COLUMN "public"."parents"."attendance_email_notifications" IS 'Whether this parent wants RFID attendance alerts sent to their registered email.';



COMMENT ON COLUMN "public"."parents"."attendance_sms_notifications" IS 'Whether this parent wants RFID attendance alerts sent to their registered mobile number.';



COMMENT ON COLUMN "public"."parents"."report_submission_cooldown_until" IS 'Until when this parent must wait before submitting another Parent Report.';



COMMENT ON COLUMN "public"."parents"."parent_remarks" IS 'ICT-maintained parent account note; intentionally separate from student SF2 remarks.';



CREATE SEQUENCE IF NOT EXISTS "public"."parents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."parents_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."parents_id_seq" OWNED BY "public"."parents"."id";



CREATE TABLE IF NOT EXISTS "public"."principal_announcements" (
    "id" bigint NOT NULL,
    "sender_id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "audience" "text" DEFAULT 'Everyone'::"text" NOT NULL,
    "status" "text" DEFAULT 'Published'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "emails_sent" boolean DEFAULT false
);


ALTER TABLE "public"."principal_announcements" OWNER TO "postgres";


ALTER TABLE "public"."principal_announcements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."principal_announcements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."principal_notification_reads" (
    "id" bigint NOT NULL,
    "principal_id" bigint NOT NULL,
    "notif_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."principal_notification_reads" OWNER TO "postgres";


ALTER TABLE "public"."principal_notification_reads" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."principal_notification_reads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."principal_report_favorites" (
    "principal_id" bigint NOT NULL,
    "report_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."principal_report_favorites" OWNER TO "postgres";


COMMENT ON TABLE "public"."principal_report_favorites" IS 'Private Principal report favorites; intentionally separate from report state and read receipts.';



CREATE TABLE IF NOT EXISTS "public"."principal_staff_messages" (
    "id" bigint NOT NULL,
    "principal_id" bigint NOT NULL,
    "principal_name" "text" NOT NULL,
    "recipient_type" "text" NOT NULL,
    "recipient_id" bigint NOT NULL,
    "recipient_name" "text" NOT NULL,
    "recipient_email" "text",
    "subject" "text" NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'unread'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_adviser_message_id" bigint,
    "idempotency_key" "uuid",
    CONSTRAINT "principal_staff_messages_recipient_type_check" CHECK (("recipient_type" = ANY (ARRAY['adviser'::"text", 'guidance'::"text"])))
);


ALTER TABLE "public"."principal_staff_messages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."principal_staff_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."principal_staff_messages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."principal_staff_messages_id_seq" OWNED BY "public"."principal_staff_messages"."id";



CREATE TABLE IF NOT EXISTS "public"."principals" (
    "id" bigint NOT NULL,
    "employee_id" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text",
    "last_name" "text" NOT NULL,
    "suffix" "text",
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "password_hash" "text" NOT NULL,
    "password_set" boolean DEFAULT false NOT NULL,
    "auth_version" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "effective_date" "date",
    "succession_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_reason" "text",
    "archive_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archive_previous_status" "text",
    "principal_attendance_summary_guide_completed_at" timestamp with time zone,
    "principal_reports_guide_completed_at" timestamp with time zone,
    CONSTRAINT "principals_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."principals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."principals"."principal_attendance_summary_guide_completed_at" IS 'Timestamp when the Principal completed the Attendance Summary quick guide.';



COMMENT ON COLUMN "public"."principals"."principal_reports_guide_completed_at" IS 'Timestamp when the Principal completed the Reports quick guide.';



CREATE SEQUENCE IF NOT EXISTS "public"."principals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."principals_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."principals_id_seq" OWNED BY "public"."principals"."id";



CREATE TABLE IF NOT EXISTS "public"."public_api_rate_limits" (
    "scope" "text" NOT NULL,
    "subject_hash" "text" NOT NULL,
    "window_started_at" timestamp with time zone NOT NULL,
    "request_count" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "public_api_rate_limits_request_count_check" CHECK (("request_count" >= 0))
);


ALTER TABLE "public"."public_api_rate_limits" OWNER TO "postgres";


COMMENT ON TABLE "public"."public_api_rate_limits" IS 'Server-only, shared rate-limit windows for public endpoints.';



CREATE TABLE IF NOT EXISTS "public"."scheduled_adviser_transfers" (
    "id" bigint NOT NULL,
    "outgoing_adviser_id" integer NOT NULL,
    "incoming_adviser_id" integer NOT NULL,
    "grade" "text" NOT NULL,
    "section" "text" NOT NULL,
    "effective_at" timestamp with time zone NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'Scheduled'::"text" NOT NULL,
    "failure_reason" "text",
    "requested_by_ict_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancelled_by_ict_id" integer,
    "release_incoming_assignment" boolean DEFAULT false NOT NULL,
    CONSTRAINT "scheduled_adviser_transfers_check" CHECK (("outgoing_adviser_id" <> "incoming_adviser_id")),
    CONSTRAINT "scheduled_adviser_transfers_status_check" CHECK (("status" = ANY (ARRAY['Scheduled'::"text", 'Completed'::"text", 'Cancelled'::"text", 'Failed'::"text"])))
);


ALTER TABLE "public"."scheduled_adviser_transfers" OWNER TO "postgres";


ALTER TABLE "public"."scheduled_adviser_transfers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."scheduled_adviser_transfers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."scheduled_deletion_requesters" (
    "scheduled_deletion_id" bigint NOT NULL,
    "adviser_id" bigint,
    "ict_admin_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduled_deletion_requesters_exactly_one_requester" CHECK (("num_nonnulls"("adviser_id", "ict_admin_id") = 1))
);


ALTER TABLE "public"."scheduled_deletion_requesters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_deletion_targets" (
    "scheduled_deletion_id" bigint NOT NULL,
    "student_id" bigint,
    "parent_id" bigint,
    "adviser_id" bigint,
    "ict_admin_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduled_deletion_targets_exactly_one_target" CHECK (("num_nonnulls"("student_id", "parent_id", "adviser_id", "ict_admin_id") = 1))
);


ALTER TABLE "public"."scheduled_deletion_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_deletions" (
    "id" bigint NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "text" NOT NULL,
    "target_name" "text" NOT NULL,
    "target_email" "text",
    "requested_by_role" "text" NOT NULL,
    "requested_by_id" bigint NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'PendingICT'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by_ict_id" bigint,
    "delete_after" timestamp with time zone,
    "restored_at" timestamp with time zone,
    "notice_sent_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_reason" "text",
    CONSTRAINT "scheduled_deletions_requested_by_role_check" CHECK (("requested_by_role" = ANY (ARRAY['Adviser'::"text", 'ICT'::"text"]))),
    CONSTRAINT "scheduled_deletions_status_check" CHECK (("status" = ANY (ARRAY['PendingICT'::"text", 'Scheduled'::"text", 'Rejected'::"text", 'Restored'::"text", 'Archived'::"text", 'Deleted'::"text"]))),
    CONSTRAINT "scheduled_deletions_target_type_check" CHECK (("target_type" = ANY (ARRAY['student'::"text", 'parent'::"text", 'adviser'::"text", 'ict'::"text"])))
);


ALTER TABLE "public"."scheduled_deletions" OWNER TO "postgres";


ALTER TABLE "public"."scheduled_deletions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."scheduled_deletions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."school_year_config" (
    "id" integer NOT NULL,
    "school_year_label" character varying(20) NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "attendance_weekdays" "text"[] DEFAULT ARRAY['Mon'::"text", 'Tue'::"text", 'Wed'::"text", 'Thu'::"text", 'Fri'::"text"] NOT NULL,
    CONSTRAINT "school_year_config_attendance_weekdays_check" CHECK ((("cardinality"("attendance_weekdays") > 0) AND ("attendance_weekdays" <@ ARRAY['Mon'::"text", 'Tue'::"text", 'Wed'::"text", 'Thu'::"text", 'Fri'::"text", 'Sat'::"text", 'Sun'::"text"])))
);


ALTER TABLE "public"."school_year_config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."school_year_config_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."school_year_config_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."school_year_config_id_seq" OWNED BY "public"."school_year_config"."id";



CREATE TABLE IF NOT EXISTS "public"."sections" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "grade" "text" NOT NULL,
    "class_session" "text"
);


ALTER TABLE "public"."sections" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sections_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sections_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sections_id_seq" OWNED BY "public"."sections"."id";



CREATE OR REPLACE VIEW "public"."staff_employee_id_conflicts" AS
 SELECT "employee_id_key",
    "min"("employee_id") AS "employee_id",
    ("count"(*))::integer AS "account_count",
    "jsonb_agg"("jsonb_build_object"('role', "account_role", 'accountId', "account_id") ORDER BY "role_order", "account_id") AS "accounts"
   FROM ( SELECT "lower"("btrim"("advisers"."employee_id")) AS "employee_id_key",
            "btrim"("advisers"."employee_id") AS "employee_id",
            'Adviser'::"text" AS "account_role",
            ("advisers"."id")::bigint AS "account_id",
            1 AS "role_order"
           FROM "public"."advisers"
          WHERE ("btrim"(COALESCE("advisers"."employee_id", ''::"text")) <> ''::"text")
        UNION ALL
         SELECT "lower"("btrim"("ict_admins"."employee_id")) AS "lower",
            "btrim"("ict_admins"."employee_id") AS "btrim",
            'ICT'::"text" AS "text",
            "ict_admins"."id",
            2
           FROM "public"."ict_admins"
          WHERE ("btrim"(COALESCE("ict_admins"."employee_id", ''::"text")) <> ''::"text")
        UNION ALL
         SELECT "lower"("btrim"("guidance_counselors"."employee_id")) AS "lower",
            "btrim"("guidance_counselors"."employee_id") AS "btrim",
            'Guidance'::"text" AS "text",
            "guidance_counselors"."id",
            3
           FROM "public"."guidance_counselors"
          WHERE ("btrim"(COALESCE("guidance_counselors"."employee_id", ''::"text")) <> ''::"text")
        UNION ALL
         SELECT "lower"("btrim"("principals"."employee_id")) AS "lower",
            "btrim"("principals"."employee_id") AS "btrim",
            'Principal'::"text" AS "text",
            "principals"."id",
            4
           FROM "public"."principals"
          WHERE ("btrim"(COALESCE("principals"."employee_id", ''::"text")) <> ''::"text")) "staff_records"
  GROUP BY "employee_id_key"
 HAVING ("count"(*) > 1);


ALTER VIEW "public"."staff_employee_id_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_employee_ids" (
    "employee_id_key" "text" NOT NULL,
    "employee_id" "text" NOT NULL,
    "account_role" "text" NOT NULL,
    "account_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_employee_ids_account_role_check" CHECK (("account_role" = ANY (ARRAY['Adviser'::"text", 'ICT'::"text", 'Guidance'::"text", 'Principal'::"text"])))
);


ALTER TABLE "public"."staff_employee_ids" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_messages" (
    "id" bigint NOT NULL,
    "sender_type" "text" NOT NULL,
    "sender_id" bigint NOT NULL,
    "sender_name" "text" NOT NULL,
    "sender_email" "text",
    "recipient_type" "text" NOT NULL,
    "recipient_id" bigint NOT NULL,
    "recipient_name" "text" NOT NULL,
    "recipient_email" "text",
    "subject" "text" NOT NULL,
    "categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'unread'::"text" NOT NULL,
    "source_message_id" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "uuid",
    "report_id" bigint,
    CONSTRAINT "staff_messages_recipient_type_check" CHECK (("recipient_type" = ANY (ARRAY['parent'::"text", 'adviser'::"text", 'guidance'::"text", 'principal'::"text", 'ict'::"text"]))),
    CONSTRAINT "staff_messages_sender_type_check" CHECK (("sender_type" = ANY (ARRAY['parent'::"text", 'adviser'::"text", 'guidance'::"text", 'principal'::"text", 'ict'::"text"])))
);


ALTER TABLE "public"."staff_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."staff_messages"."report_id" IS 'Optional source report for a separate staff message. It does not make the row part of parent_adviser_report_messages or alter report workflow state.';



CREATE SEQUENCE IF NOT EXISTS "public"."staff_messages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."staff_messages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."staff_messages_id_seq" OWNED BY "public"."staff_messages"."id";



CREATE TABLE IF NOT EXISTS "public"."student_family_members" (
    "id" bigint NOT NULL,
    "student_db_id" integer NOT NULL,
    "role" "text" NOT NULL,
    "first_name" "text",
    "middle_name" "text",
    "last_name" "text",
    "relationship" "text",
    "contact_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suffix" "text",
    CONSTRAINT "student_family_members_role_check" CHECK (("role" = ANY (ARRAY['Father'::"text", 'Mother'::"text", 'Guardian'::"text"])))
);


ALTER TABLE "public"."student_family_members" OWNER TO "postgres";


ALTER TABLE "public"."student_family_members" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."student_family_members_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."student_remarks" (
    "id" bigint NOT NULL,
    "student_db_id" integer NOT NULL,
    "remark_type" "text" NOT NULL,
    "effectivity_date" "date" NOT NULL,
    "note" "text" NOT NULL,
    "school_name" "text",
    "created_by_adviser_id" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "student_remarks_remark_type_check" CHECK (("remark_type" = ANY (ARRAY['Dropped out'::"text", 'Transferred In'::"text", 'Transferred Out'::"text"]))),
    CONSTRAINT "student_remarks_required_detail" CHECK (((("remark_type" = 'Dropped out'::"text") AND (NULLIF("btrim"("note"), ''::"text") IS NOT NULL) AND ("school_name" IS NULL)) OR (("remark_type" = ANY (ARRAY['Transferred In'::"text", 'Transferred Out'::"text"])) AND (NULLIF("btrim"("note"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("school_name"), ''::"text") IS NOT NULL))))
);


ALTER TABLE "public"."student_remarks" OWNER TO "postgres";


ALTER TABLE "public"."student_remarks" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."student_remarks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."student_reports" (
    "id" bigint NOT NULL,
    "student_db_id" bigint,
    "student_id" "text" NOT NULL,
    "student_name" "text" NOT NULL,
    "grade" "text" NOT NULL,
    "section" "text" NOT NULL,
    "adviser_id" bigint NOT NULL,
    "parent_email" "text",
    "parent_name" "text",
    "contact" "text",
    "category" "text" DEFAULT 'Other'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "notified_parent" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "report_date_manila" "date" NOT NULL,
    "report_source" "text" DEFAULT 'student'::"text" NOT NULL,
    "subject_teacher_name" "text",
    "subject_teacher_email" "text",
    "subject_teacher_categories" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "subject_teacher_submission_key" "uuid",
    "subject_teacher_report_date_manila" "date",
    CONSTRAINT "student_reports_report_source_check" CHECK (("report_source" = ANY (ARRAY['student'::"text", 'subject_teacher'::"text"])))
);


ALTER TABLE "public"."student_reports" OWNER TO "postgres";


COMMENT ON COLUMN "public"."student_reports"."report_source" IS 'Whether this Adviser Student Report was submitted by a student or a verified Subject Teacher.';



COMMENT ON COLUMN "public"."student_reports"."subject_teacher_submission_key" IS 'Browser retry key for a verified Subject Teacher submission; unique when present.';



CREATE SEQUENCE IF NOT EXISTS "public"."student_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."student_reports_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."student_reports_id_seq" OWNED BY "public"."student_reports"."id";



CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" integer NOT NULL,
    "student_id" "text" NOT NULL,
    "first_name" "text" NOT NULL,
    "middle_name" "text",
    "last_name" "text" NOT NULL,
    "suffix" "text",
    "gender" "text" NOT NULL,
    "grade" "text",
    "section" "text",
    "rfid_card" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "transfer_status" "text",
    "target_grade" "text",
    "target_section" "text",
    "class_session" "text",
    "birth_date" "date",
    "mother_tongue" "text",
    "ip_ethnic_group" "text",
    "religion" "text",
    "house_street_sitio_purok" "text",
    "barangay" "text",
    "municipality_city" "text",
    "province" "text",
    "learning_modality" "text",
    "age" integer,
    "archived_at" timestamp with time zone,
    "archived_by" "text",
    "archive_reason" "text",
    "archive_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "archive_previous_status" "text",
    CONSTRAINT "students_age_range_check" CHECK ((("age" IS NULL) OR (("age" >= 1) AND ("age" <= 120)))),
    CONSTRAINT "students_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "students_transfer_status_check" CHECK ((("transfer_status" IS NULL) OR ("transfer_status" = ANY (ARRAY['standby'::"text", 'pending_review'::"text"]))))
);


ALTER TABLE "public"."students" OWNER TO "postgres";


COMMENT ON COLUMN "public"."students"."age" IS 'Optional age in whole years; validated from 1 through 120.';



CREATE SEQUENCE IF NOT EXISTS "public"."students_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."students_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."students_id_seq" OWNED BY "public"."students"."id";



CREATE TABLE IF NOT EXISTS "public"."subject_teacher_report_otps" (
    "email" "text" NOT NULL,
    "otp_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" smallint DEFAULT 0 NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subject_teacher_report_otps_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 5))),
    CONSTRAINT "subject_teacher_report_otps_otp_hash_check" CHECK (("char_length"("otp_hash") = 64))
);


ALTER TABLE "public"."subject_teacher_report_otps" OWNER TO "postgres";


ALTER TABLE ONLY "public"."adviser_change_requests" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."adviser_change_requests_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."adviser_notification_reads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."adviser_notification_reads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."adviser_principal_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."adviser_principal_messages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."advisers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."advisers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."attendance_logs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."attendance_logs_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."excuse_letters" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."excuse_letters_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."guidance_counselors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."guidance_counselors_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."guidance_notification_reads" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."guidance_notification_reads_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ict_admins" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ict_admins_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."parent_adviser_report_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."parent_adviser_report_messages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."parent_adviser_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."parent_adviser_reports_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."parents" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."parents_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."principal_staff_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."principal_staff_messages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."principals" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."principals_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."school_year_config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."school_year_config_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sections" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sections_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."staff_messages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."staff_messages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."student_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."student_reports_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."students" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."students_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."adviser_announcements"
    ADD CONSTRAINT "adviser_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adviser_assignment_history"
    ADD CONSTRAINT "adviser_assignment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adviser_change_requests"
    ADD CONSTRAINT "adviser_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adviser_notification_reads"
    ADD CONSTRAINT "adviser_notification_reads_adviser_id_notif_key_key" UNIQUE ("adviser_id", "notif_key");



ALTER TABLE ONLY "public"."adviser_notification_reads"
    ADD CONSTRAINT "adviser_notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adviser_principal_messages"
    ADD CONSTRAINT "adviser_principal_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adviser_report_favorites"
    ADD CONSTRAINT "adviser_report_favorites_pkey" PRIMARY KEY ("adviser_id", "report_id");



ALTER TABLE ONLY "public"."advisers"
    ADD CONSTRAINT "advisers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."advisers"
    ADD CONSTRAINT "advisers_employee_id_key" UNIQUE ("employee_id");



ALTER TABLE ONLY "public"."advisers"
    ADD CONSTRAINT "advisers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_email_jobs"
    ADD CONSTRAINT "attendance_email_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_notification_settings"
    ADD CONSTRAINT "attendance_notification_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_sms_dispatch_leases"
    ADD CONSTRAINT "attendance_sms_dispatch_leases_pkey" PRIMARY KEY ("lease_name");



ALTER TABLE ONLY "public"."attendance_sms_jobs"
    ADD CONSTRAINT "attendance_sms_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_sms_provider_events"
    ADD CONSTRAINT "attendance_sms_provider_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_us_messages"
    ADD CONSTRAINT "contact_us_messages_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."contact_us_messages"
    ADD CONSTRAINT "contact_us_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."excuse_letters"
    ADD CONSTRAINT "excuse_letters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guidance_announcements"
    ADD CONSTRAINT "guidance_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guidance_change_requests"
    ADD CONSTRAINT "guidance_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guidance_counselors"
    ADD CONSTRAINT "guidance_counselors_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."guidance_counselors"
    ADD CONSTRAINT "guidance_counselors_employee_id_key" UNIQUE ("employee_id");



ALTER TABLE ONLY "public"."guidance_counselors"
    ADD CONSTRAINT "guidance_counselors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guidance_notification_reads"
    ADD CONSTRAINT "guidance_notification_reads_guidance_id_notif_key_key" UNIQUE ("guidance_id", "notif_key");



ALTER TABLE ONLY "public"."guidance_notification_reads"
    ADD CONSTRAINT "guidance_notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guidance_report_favorites"
    ADD CONSTRAINT "guidance_report_favorites_pkey" PRIMARY KEY ("guidance_id", "report_id");



ALTER TABLE ONLY "public"."guidance_ticket_reads"
    ADD CONSTRAINT "guidance_ticket_reads_pkey" PRIMARY KEY ("guidance_id", "ticket_id");



ALTER TABLE ONLY "public"."ict_admins"
    ADD CONSTRAINT "ict_admins_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."ict_admins"
    ADD CONSTRAINT "ict_admins_employee_id_key" UNIQUE ("employee_id");



ALTER TABLE ONLY "public"."ict_admins"
    ADD CONSTRAINT "ict_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ict_announcements"
    ADD CONSTRAINT "ict_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ict_notification_reads"
    ADD CONSTRAINT "ict_notification_reads_ict_id_notif_key_key" UNIQUE ("ict_id", "notif_key");



ALTER TABLE ONLY "public"."ict_notification_reads"
    ADD CONSTRAINT "ict_notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_attempt_guards"
    ADD CONSTRAINT "login_attempt_guards_pkey" PRIMARY KEY ("role", "scope", "subject_hash");



ALTER TABLE ONLY "public"."parent_announcement_notifications"
    ADD CONSTRAINT "pan_source_ann_parent_unique" UNIQUE ("source", "announcement_id", "parent_id");



ALTER TABLE ONLY "public"."parent_account_change_notifications"
    ADD CONSTRAINT "parent_account_change_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_adviser_report_messages"
    ADD CONSTRAINT "parent_adviser_report_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_adviser_reports"
    ADD CONSTRAINT "parent_adviser_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_announcement_notifications"
    ADD CONSTRAINT "parent_announcement_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_attendance_notification_reads"
    ADD CONSTRAINT "parent_attendance_notification_reads_pkey" PRIMARY KEY ("parent_id", "attendance_log_id");



ALTER TABLE ONLY "public"."parent_deletion_notifications"
    ADD CONSTRAINT "parent_deletion_notifications_one_per_deletion" UNIQUE ("parent_id", "scheduled_deletion_id");



ALTER TABLE ONLY "public"."parent_deletion_notifications"
    ADD CONSTRAINT "parent_deletion_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_password_reset_otps"
    ADD CONSTRAINT "parent_password_reset_otps_pkey" PRIMARY KEY ("parent_id");



ALTER TABLE ONLY "public"."parent_password_reset_rate_limits"
    ADD CONSTRAINT "parent_password_reset_rate_limits_pkey" PRIMARY KEY ("subject_hash");



ALTER TABLE ONLY "public"."parent_report_guidance_tickets"
    ADD CONSTRAINT "parent_report_guidance_tickets_one_per_report" UNIQUE ("report_id");



ALTER TABLE ONLY "public"."parent_report_guidance_tickets"
    ADD CONSTRAINT "parent_report_guidance_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_parent_id_student_id_key" UNIQUE ("parent_id", "student_id");



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_verification_otps"
    ADD CONSTRAINT "parent_verification_otps_pkey" PRIMARY KEY ("challenge_id");



ALTER TABLE "public"."parents"
    ADD CONSTRAINT "parents_attendance_notification_preference_check" CHECK ((("attendance_notification_preference" IS NULL) OR ("attendance_notification_preference" = ANY (ARRAY['SMS'::"text", 'Email'::"text", 'Neither'::"text"])))) NOT VALID;



ALTER TABLE "public"."parents"
    ADD CONSTRAINT "parents_attendance_notification_single_channel_check" CHECK ((NOT (COALESCE("attendance_email_notifications", false) AND COALESCE("attendance_sms_notifications", false)))) NOT VALID;



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."principal_announcements"
    ADD CONSTRAINT "principal_announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."principal_notification_reads"
    ADD CONSTRAINT "principal_notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."principal_notification_reads"
    ADD CONSTRAINT "principal_notification_reads_principal_id_notif_key_key" UNIQUE ("principal_id", "notif_key");



ALTER TABLE ONLY "public"."principal_report_favorites"
    ADD CONSTRAINT "principal_report_favorites_pkey" PRIMARY KEY ("principal_id", "report_id");



ALTER TABLE ONLY "public"."principal_staff_messages"
    ADD CONSTRAINT "principal_staff_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."principals"
    ADD CONSTRAINT "principals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_api_rate_limits"
    ADD CONSTRAINT "public_api_rate_limits_pkey" PRIMARY KEY ("scope", "subject_hash");



ALTER TABLE ONLY "public"."scheduled_adviser_transfers"
    ADD CONSTRAINT "scheduled_adviser_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_deletion_requesters"
    ADD CONSTRAINT "scheduled_deletion_requesters_pkey" PRIMARY KEY ("scheduled_deletion_id");



ALTER TABLE ONLY "public"."scheduled_deletion_targets"
    ADD CONSTRAINT "scheduled_deletion_targets_pkey" PRIMARY KEY ("scheduled_deletion_id");



ALTER TABLE ONLY "public"."scheduled_deletions"
    ADD CONSTRAINT "scheduled_deletions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."school_year_config"
    ADD CONSTRAINT "school_year_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sections"
    ADD CONSTRAINT "sections_name_grade_key" UNIQUE ("name", "grade");



ALTER TABLE ONLY "public"."sections"
    ADD CONSTRAINT "sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_employee_ids"
    ADD CONSTRAINT "staff_employee_ids_pkey" PRIMARY KEY ("employee_id_key");



ALTER TABLE ONLY "public"."staff_messages"
    ADD CONSTRAINT "staff_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_family_members"
    ADD CONSTRAINT "student_family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_family_members"
    ADD CONSTRAINT "student_family_members_student_db_id_role_key" UNIQUE ("student_db_id", "role");



ALTER TABLE ONLY "public"."student_remarks"
    ADD CONSTRAINT "student_remarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_reports"
    ADD CONSTRAINT "student_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_rfid_card_key" UNIQUE ("rfid_card");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_student_id_key" UNIQUE ("student_id");



ALTER TABLE ONLY "public"."subject_teacher_report_otps"
    ADD CONSTRAINT "subject_teacher_report_otps_pkey" PRIMARY KEY ("email");



CREATE INDEX "adviser_announcements_adviser_created_idx" ON "public"."adviser_announcements" USING "btree" ("adviser_id", "created_at" DESC);



CREATE INDEX "adviser_announcements_scheduled_delivery_idx" ON "public"."adviser_announcements" USING "btree" ("scheduled_at") WHERE ("status" = 'Scheduled'::"text");



CREATE INDEX "adviser_assignment_history_adviser_effective_idx" ON "public"."adviser_assignment_history" USING "btree" ("adviser_id", "effective_at" DESC);



CREATE INDEX "adviser_principal_messages_adviser_id_idx" ON "public"."adviser_principal_messages" USING "btree" ("adviser_id", "created_at" DESC);



CREATE INDEX "adviser_principal_messages_principal_id_idx" ON "public"."adviser_principal_messages" USING "btree" ("principal_id", "created_at" DESC);



CREATE INDEX "adviser_principal_messages_source_staff_message_idx" ON "public"."adviser_principal_messages" USING "btree" ("source_staff_message_id", "created_at");



CREATE INDEX "adviser_report_favorites_report_id_idx" ON "public"."adviser_report_favorites" USING "btree" ("report_id");



CREATE INDEX "advisers_archive_status_idx" ON "public"."advisers" USING "btree" ("archive_status");



CREATE UNIQUE INDEX "attendance_email_jobs_one_delivery_per_parent_event" ON "public"."attendance_email_jobs" USING "btree" ("attendance_log_id", "parent_id");



CREATE INDEX "attendance_email_jobs_ready_idx" ON "public"."attendance_email_jobs" USING "btree" ("status", "available_at", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "attendance_logs_absence_lookup_idx" ON "public"."attendance_logs" USING "btree" ("attendance_date", "session_type", "type", "student_db_id") WHERE ("student_db_id" IS NOT NULL);



CREATE INDEX "attendance_logs_class_session_id_idx" ON "public"."attendance_logs" USING "btree" ("class_session_id");



CREATE INDEX "attendance_logs_date_session_time_in_idx" ON "public"."attendance_logs" USING "btree" ("attendance_date", "session_type", "student_db_id") WHERE ("type" = 'Time In'::"text");



CREATE INDEX "attendance_logs_date_student_type_idx" ON "public"."attendance_logs" USING "btree" ("attendance_date", "student_db_id", "type");



CREATE INDEX "attendance_logs_history_scope_idx" ON "public"."attendance_logs" USING "btree" ("attendance_date", "student_grade_snapshot", "student_section_snapshot");



CREATE UNIQUE INDEX "attendance_logs_scan_request_id_unique" ON "public"."attendance_logs" USING "btree" ("scan_request_id") WHERE ("scan_request_id" IS NOT NULL);



CREATE UNIQUE INDEX "attendance_logs_student_date_session_time_in_idx" ON "public"."attendance_logs" USING "btree" ("student_db_id", "attendance_date", "session_type", "type") WHERE ("type" = 'Time In'::"text");



CREATE UNIQUE INDEX "attendance_logs_student_date_session_type_idx" ON "public"."attendance_logs" USING "btree" ("student_db_id", "attendance_date", "session_type", "type") WHERE ("student_db_id" IS NOT NULL);



CREATE INDEX "attendance_logs_student_date_time_idx" ON "public"."attendance_logs" USING "btree" ("student_db_id", "attendance_date", "time_logged");



CREATE INDEX "attendance_logs_student_id_date_time_idx" ON "public"."attendance_logs" USING "btree" ("student_id", "attendance_date" DESC, "time_logged") WHERE ("student_id" IS NOT NULL);



COMMENT ON INDEX "public"."attendance_logs_student_id_date_time_idx" IS 'Supports authorized Parent attendance-history reads by LRN in display order.';



CREATE UNIQUE INDEX "attendance_sms_jobs_idempotency_key_idx" ON "public"."attendance_sms_jobs" USING "btree" ("idempotency_key");



CREATE UNIQUE INDEX "attendance_sms_jobs_one_delivery_per_parent_event" ON "public"."attendance_sms_jobs" USING "btree" ("attendance_log_id", "parent_id");



CREATE INDEX "attendance_sms_jobs_pending_dispatch_idx" ON "public"."attendance_sms_jobs" USING "btree" ("available_at", "created_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "attendance_sms_jobs_processing_lock_idx" ON "public"."attendance_sms_jobs" USING "btree" ("locked_at") WHERE ("status" = 'processing'::"text");



CREATE INDEX "attendance_sms_jobs_provider_message_idx" ON "public"."attendance_sms_jobs" USING "btree" ("provider", "provider_message_id") WHERE ("provider_message_id" IS NOT NULL);



CREATE INDEX "attendance_sms_jobs_ready_idx" ON "public"."attendance_sms_jobs" USING "btree" ("status", "available_at", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "attendance_sms_jobs_semaphore_pending_reconcile_idx" ON "public"."attendance_sms_jobs" USING "btree" ("updated_at") WHERE (("provider" = 'semaphore'::"text") AND ("status" = 'sent'::"text") AND ("provider_message_id" IS NOT NULL) AND ("provider_status" = ANY (ARRAY['queued'::"text", 'pending'::"text"])));



CREATE INDEX "attendance_sms_provider_events_job_created_idx" ON "public"."attendance_sms_provider_events" USING "btree" ("attendance_sms_job_id", "created_at" DESC);



CREATE INDEX "audit_log_action_idx" ON "public"."audit_log" USING "btree" ("action");



CREATE INDEX "audit_log_actor_idx" ON "public"."audit_log" USING "btree" ("performed_by_role", "performed_by", "created_at" DESC);



CREATE INDEX "audit_log_created_at_idx" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_log_filter_idx" ON "public"."audit_log" USING "btree" ("module", "action", "new_status", "created_at" DESC);



CREATE INDEX "audit_log_password_session_revocation_lookup_idx" ON "public"."audit_log" USING "btree" ("target_id", "target_role", "created_at" DESC) WHERE (("target_type" = 'user'::"text") AND ("action" = ANY (ARRAY['Password Session Revoked'::"text", 'ICT Password Session Revoked'::"text"])));



CREATE INDEX "audit_log_performed_by_idx" ON "public"."audit_log" USING "btree" ("performed_by");



CREATE INDEX "audit_log_related_idx" ON "public"."audit_log" USING "btree" ("related_report_id", "related_ticket_id", "related_student_id", "related_user_id");



CREATE UNIQUE INDEX "class_sessions_date_type_grade_unique" ON "public"."class_sessions" USING "btree" ("session_date", "session_type", "grade");



CREATE INDEX "class_sessions_grade_date_type_idx" ON "public"."class_sessions" USING "btree" ("grade", "session_date" DESC, "session_type");



CREATE UNIQUE INDEX "excuse_letters_one_pending_request_idx" ON "public"."excuse_letters" USING "btree" ("parent_id", "student_id", "date_from", "date_to") WHERE ("status" = 'Pending'::"text");



CREATE INDEX "guidance_change_requests_guidance_status_idx" ON "public"."guidance_change_requests" USING "btree" ("guidance_id", "status", "created_at" DESC);



CREATE INDEX "guidance_counselors_archive_status_idx" ON "public"."guidance_counselors" USING "btree" ("archive_status");



CREATE INDEX "guidance_counselors_email_idx" ON "public"."guidance_counselors" USING "btree" ("lower"("email"));



CREATE INDEX "guidance_counselors_employee_id_idx" ON "public"."guidance_counselors" USING "btree" ("employee_id");



CREATE INDEX "guidance_report_favorites_report_id_idx" ON "public"."guidance_report_favorites" USING "btree" ("report_id");



CREATE INDEX "ict_admins_archive_status_idx" ON "public"."ict_admins" USING "btree" ("archive_status");



CREATE INDEX "ict_admins_email_idx" ON "public"."ict_admins" USING "btree" ("lower"("email"));



CREATE INDEX "ict_admins_employee_id_idx" ON "public"."ict_admins" USING "btree" ("employee_id");



CREATE INDEX "idx_parent_adviser_report_messages_report_id" ON "public"."parent_adviser_report_messages" USING "btree" ("report_id");



CREATE INDEX "idx_parent_adviser_reports_escalated_principal" ON "public"."parent_adviser_reports" USING "btree" ("escalated_to_principal") WHERE ("escalated_to_principal" = true);



CREATE UNIQUE INDEX "idx_single_active_sy" ON "public"."school_year_config" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_staff_messages_recipient" ON "public"."staff_messages" USING "btree" ("recipient_type", "recipient_id");



CREATE INDEX "idx_staff_messages_sender" ON "public"."staff_messages" USING "btree" ("sender_type", "sender_id");



CREATE INDEX "parent_account_change_notifications_parent_created_idx" ON "public"."parent_account_change_notifications" USING "btree" ("parent_id", "created_at" DESC);



CREATE INDEX "parent_adviser_report_messages_report_created_id_idx" ON "public"."parent_adviser_report_messages" USING "btree" ("report_id", "created_at", "id");



CREATE INDEX "parent_adviser_report_messages_report_id_idx" ON "public"."parent_adviser_report_messages" USING "btree" ("report_id", "created_at");



CREATE UNIQUE INDEX "parent_adviser_report_messages_report_idempotency_key_idx" ON "public"."parent_adviser_report_messages" USING "btree" ("report_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "parent_adviser_report_messages_thread_idx" ON "public"."parent_adviser_report_messages" USING "btree" ("report_id", "thread_type", "created_at");



CREATE INDEX "parent_adviser_reports_adviser_id_idx" ON "public"."parent_adviser_reports" USING "btree" ("adviser_id");



CREATE INDEX "parent_adviser_reports_adviser_last_message_idx" ON "public"."parent_adviser_reports" USING "btree" ("adviser_id", "last_message_at" DESC);



CREATE INDEX "parent_adviser_reports_guidance_idx" ON "public"."parent_adviser_reports" USING "btree" ("escalated_to_guidance", "last_message_at" DESC);



CREATE INDEX "parent_adviser_reports_guidance_last_message_idx" ON "public"."parent_adviser_reports" USING "btree" ("escalated_to_guidance", "last_message_at" DESC) WHERE ("escalated_to_guidance" = true);



CREATE UNIQUE INDEX "parent_adviser_reports_one_student_notify_idx" ON "public"."parent_adviser_reports" USING "btree" ("student_id", "adviser_id", "subject") WHERE ("subject" ~~ '[Student Concern]%'::"text");



CREATE INDEX "parent_adviser_reports_parent_active_idx" ON "public"."parent_adviser_reports" USING "btree" ("parent_id", "cancelled_at", "last_message_at" DESC);



CREATE INDEX "parent_adviser_reports_parent_email_idx" ON "public"."parent_adviser_reports" USING "btree" ("lower"("parent_email"));



CREATE INDEX "parent_adviser_reports_parent_email_last_message_idx" ON "public"."parent_adviser_reports" USING "btree" ("parent_email", "last_message_at" DESC);



CREATE INDEX "parent_adviser_reports_principal_escalation_idx" ON "public"."parent_adviser_reports" USING "btree" ("escalated_to_principal", "last_message_at" DESC);



CREATE INDEX "parent_adviser_reports_principal_last_message_idx" ON "public"."parent_adviser_reports" USING "btree" ("escalated_to_principal", "last_message_at" DESC) WHERE ("escalated_to_principal" = true);



CREATE INDEX "parent_adviser_reports_subject_teacher_daily_idx" ON "public"."parent_adviser_reports" USING "btree" ("subject_teacher_email", "subject_teacher_report_date_manila") WHERE ("subject_teacher_email" IS NOT NULL);



CREATE UNIQUE INDEX "parent_adviser_reports_subject_teacher_submission_key_idx" ON "public"."parent_adviser_reports" USING "btree" ("subject_teacher_submission_key") WHERE ("subject_teacher_submission_key" IS NOT NULL);



CREATE INDEX "parent_announcement_notifications_parent_created_idx" ON "public"."parent_announcement_notifications" USING "btree" ("parent_id", "created_at" DESC);



CREATE UNIQUE INDEX "parent_announcement_notifications_source_announcement_parent_id" ON "public"."parent_announcement_notifications" USING "btree" ("source", "announcement_id", "parent_id");



CREATE INDEX "parent_announcement_notifications_unread_idx" ON "public"."parent_announcement_notifications" USING "btree" ("parent_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "parent_attendance_notification_reads_log_idx" ON "public"."parent_attendance_notification_reads" USING "btree" ("attendance_log_id");



CREATE INDEX "parent_deletion_notifications_parent_created_idx" ON "public"."parent_deletion_notifications" USING "btree" ("parent_id", "created_at" DESC);



CREATE INDEX "parent_password_reset_otps_expires_at_idx" ON "public"."parent_password_reset_otps" USING "btree" ("expires_at");



CREATE INDEX "parent_report_guidance_tickets_parent_id_idx" ON "public"."parent_report_guidance_tickets" USING "btree" ("parent_id");



CREATE INDEX "parent_report_guidance_tickets_status_idx" ON "public"."parent_report_guidance_tickets" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "parent_student_links_parent_idx" ON "public"."parent_student_links" USING "btree" ("parent_id");



CREATE INDEX "parent_student_links_student_idx" ON "public"."parent_student_links" USING "btree" ("student_id");



CREATE INDEX "parent_verification_otps_expiry_idx" ON "public"."parent_verification_otps" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "parent_verification_otps_parent_purpose_unique" ON "public"."parent_verification_otps" USING "btree" ("parent_id", "purpose") WHERE ("parent_id" IS NOT NULL);



CREATE UNIQUE INDEX "parents_active_email_normalized_unique_idx" ON "public"."parents" USING "btree" ("lower"("btrim"("email"))) WHERE (("email" IS NOT NULL) AND ("btrim"("email") <> ''::"text") AND ("archive_status" = 'active'::"text"));



CREATE UNIQUE INDEX "parents_active_login_contact_number_unique_idx" ON "public"."parents" USING "btree" ("login_contact_number") WHERE (("login_contact_number" IS NOT NULL) AND ("archive_status" = 'active'::"text"));



CREATE INDEX "parents_archive_status_idx" ON "public"."parents" USING "btree" ("archive_status");



CREATE INDEX "parents_email_idx" ON "public"."parents" USING "btree" ("email");



CREATE INDEX "parents_student_id_idx" ON "public"."parents" USING "btree" ("student_id");



CREATE INDEX "parents_temporary_password_expiry_idx" ON "public"."parents" USING "btree" ("temporary_password_expires_at") WHERE ("temporary_password_expires_at" IS NOT NULL);



CREATE INDEX "principal_report_favorites_report_id_idx" ON "public"."principal_report_favorites" USING "btree" ("report_id");



CREATE UNIQUE INDEX "principal_staff_messages_idempotency_key_idx" ON "public"."principal_staff_messages" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "principal_staff_messages_principal_idx" ON "public"."principal_staff_messages" USING "btree" ("principal_id", "created_at" DESC);



CREATE INDEX "principal_staff_messages_recipient_idx" ON "public"."principal_staff_messages" USING "btree" ("recipient_type", "recipient_id", "created_at" DESC);



CREATE INDEX "principal_staff_messages_source_adviser_message_idx" ON "public"."principal_staff_messages" USING "btree" ("source_adviser_message_id", "created_at");



CREATE UNIQUE INDEX "principals_active_email_idx" ON "public"."principals" USING "btree" ("lower"("email")) WHERE ("is_active" = true);



CREATE UNIQUE INDEX "principals_active_employee_id_idx" ON "public"."principals" USING "btree" ("employee_id") WHERE ("is_active" = true);



CREATE INDEX "principals_archive_status_idx" ON "public"."principals" USING "btree" ("archive_status");



CREATE UNIQUE INDEX "principals_one_active_idx" ON "public"."principals" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "scheduled_adviser_transfers_due_idx" ON "public"."scheduled_adviser_transfers" USING "btree" ("effective_at") WHERE ("status" = 'Scheduled'::"text");



CREATE UNIQUE INDEX "scheduled_adviser_transfers_one_pending_section" ON "public"."scheduled_adviser_transfers" USING "btree" ("grade", "section") WHERE ("status" = 'Scheduled'::"text");



CREATE INDEX "scheduled_deletion_requesters_adviser_idx" ON "public"."scheduled_deletion_requesters" USING "btree" ("adviser_id");



CREATE INDEX "scheduled_deletion_requesters_ict_idx" ON "public"."scheduled_deletion_requesters" USING "btree" ("ict_admin_id");



CREATE INDEX "scheduled_deletion_targets_adviser_idx" ON "public"."scheduled_deletion_targets" USING "btree" ("adviser_id");



CREATE INDEX "scheduled_deletion_targets_ict_idx" ON "public"."scheduled_deletion_targets" USING "btree" ("ict_admin_id");



CREATE INDEX "scheduled_deletion_targets_parent_idx" ON "public"."scheduled_deletion_targets" USING "btree" ("parent_id");



CREATE INDEX "scheduled_deletion_targets_student_idx" ON "public"."scheduled_deletion_targets" USING "btree" ("student_id");



CREATE INDEX "scheduled_deletions_archive_due_idx" ON "public"."scheduled_deletions" USING "btree" ("status", "delete_after");



CREATE INDEX "scheduled_deletions_due_idx" ON "public"."scheduled_deletions" USING "btree" ("status", "delete_after");



CREATE UNIQUE INDEX "scheduled_deletions_one_active_target_idx" ON "public"."scheduled_deletions" USING "btree" ("target_type", "target_id") WHERE ("status" = ANY (ARRAY['PendingICT'::"text", 'Scheduled'::"text"]));



CREATE UNIQUE INDEX "sections_grade_name_case_insensitive_key" ON "public"."sections" USING "btree" ("lower"("btrim"("grade")), "lower"("btrim"("name")));



CREATE UNIQUE INDEX "staff_messages_idempotency_key_idx" ON "public"."staff_messages" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "staff_messages_recipient_idx" ON "public"."staff_messages" USING "btree" ("recipient_type", "recipient_id", "created_at" DESC);



CREATE INDEX "staff_messages_report_id_created_at_idx" ON "public"."staff_messages" USING "btree" ("report_id", "created_at");



CREATE INDEX "staff_messages_sender_idx" ON "public"."staff_messages" USING "btree" ("sender_type", "sender_id", "created_at" DESC);



CREATE INDEX "staff_messages_source_idx" ON "public"."staff_messages" USING "btree" ("source_message_id", "created_at");



CREATE INDEX "student_remarks_date_type_idx" ON "public"."student_remarks" USING "btree" ("effectivity_date", "remark_type");



CREATE INDEX "student_remarks_student_date_idx" ON "public"."student_remarks" USING "btree" ("student_db_id", "effectivity_date" DESC, "id" DESC);



CREATE UNIQUE INDEX "student_remarks_student_type_date_unique" ON "public"."student_remarks" USING "btree" ("student_db_id", "remark_type", "effectivity_date");



CREATE INDEX "student_reports_adviser_id_idx" ON "public"."student_reports" USING "btree" ("adviser_id");



CREATE UNIQUE INDEX "student_reports_one_per_manila_day_idx" ON "public"."student_reports" USING "btree" ("student_id", ((("created_at" AT TIME ZONE 'Asia/Manila'::"text"))::"date")) WHERE ("report_source" = 'student'::"text");



CREATE INDEX "student_reports_student_id_idx" ON "public"."student_reports" USING "btree" ("student_id");



CREATE INDEX "student_reports_subject_teacher_daily_limit_idx" ON "public"."student_reports" USING "btree" ("subject_teacher_email", "subject_teacher_report_date_manila") WHERE ("report_source" = 'subject_teacher'::"text");



CREATE UNIQUE INDEX "student_reports_subject_teacher_submission_key_idx" ON "public"."student_reports" USING "btree" ("subject_teacher_submission_key") WHERE ("subject_teacher_submission_key" IS NOT NULL);



CREATE INDEX "students_archive_status_idx" ON "public"."students" USING "btree" ("archive_status");



CREATE INDEX "students_class_session_idx" ON "public"."students" USING "btree" ("class_session");



CREATE INDEX "students_grade_section_idx" ON "public"."students" USING "btree" ("grade", "section");



CREATE UNIQUE INDEX "students_rfid_card_normalized_unique" ON "public"."students" USING "btree" ("upper"("btrim"("rfid_card"))) WHERE (NULLIF("btrim"("rfid_card"), ''::"text") IS NOT NULL);



COMMENT ON INDEX "public"."students_rfid_card_normalized_unique" IS 'Prevents the same non-empty RFID UID from being assigned to more than one student, case-insensitively.';



CREATE UNIQUE INDEX "students_rfid_card_unique_ci" ON "public"."students" USING "btree" ("upper"(TRIM(BOTH FROM "rfid_card"))) WHERE (("rfid_card" IS NOT NULL) AND (TRIM(BOTH FROM "rfid_card") <> ''::"text"));



CREATE INDEX "students_transfer_destination_idx" ON "public"."students" USING "btree" ("transfer_status", "target_grade", "target_section") WHERE ("transfer_status" IS NOT NULL);



CREATE INDEX "subject_teacher_report_otps_expires_at_idx" ON "public"."subject_teacher_report_otps" USING "btree" ("expires_at");



CREATE OR REPLACE TRIGGER "advisers_staff_employee_id_registry" AFTER INSERT OR DELETE OR UPDATE OF "employee_id" ON "public"."advisers" FOR EACH ROW EXECUTE FUNCTION "public"."sync_staff_employee_id_registry"('Adviser');



CREATE OR REPLACE TRIGGER "assign_attendance_class_session_trigger" BEFORE INSERT OR UPDATE OF "attendance_date", "session_type", "student_db_id", "class_session_id" ON "public"."attendance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."assign_attendance_class_session"();



CREATE OR REPLACE TRIGGER "attendance_email_jobs_touch_updated_at" BEFORE UPDATE ON "public"."attendance_email_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_attendance_email_job"();



CREATE OR REPLACE TRIGGER "attendance_logs_enqueue_email" AFTER INSERT ON "public"."attendance_logs" FOR EACH ROW WHEN (("new"."via" = 'RFID'::"text")) EXECUTE FUNCTION "public"."enqueue_attendance_email_job"();



CREATE OR REPLACE TRIGGER "attendance_logs_enqueue_sms" AFTER INSERT ON "public"."attendance_logs" FOR EACH ROW WHEN (("new"."via" = 'RFID'::"text")) EXECUTE FUNCTION "public"."enqueue_attendance_sms_job"();



CREATE OR REPLACE TRIGGER "attendance_notification_settings_touch_updated_at" BEFORE UPDATE ON "public"."attendance_notification_settings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_attendance_notification_settings"();



CREATE OR REPLACE TRIGGER "attendance_sms_jobs_idempotency_guard" BEFORE INSERT OR UPDATE OF "attendance_log_id", "parent_id", "recipient_key", "idempotency_key" ON "public"."attendance_sms_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_attendance_sms_job_idempotency_key"();



CREATE OR REPLACE TRIGGER "attendance_sms_jobs_template_guard" BEFORE INSERT OR UPDATE OF "attendance_log_id", "message" ON "public"."attendance_sms_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_attendance_sms_job_message"();



CREATE OR REPLACE TRIGGER "attendance_sms_jobs_touch_updated_at" BEFORE UPDATE ON "public"."attendance_sms_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_attendance_sms_job"();



CREATE OR REPLACE TRIGGER "audit_log_is_append_only" BEFORE DELETE OR UPDATE ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_audit_log_mutation"();



CREATE OR REPLACE TRIGGER "audit_log_reject_sensitive_data" BEFORE INSERT ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."reject_sensitive_audit_data"();



CREATE OR REPLACE TRIGGER "capture_attendance_student_scope_trigger" BEFORE INSERT ON "public"."attendance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."capture_attendance_student_scope"();



CREATE OR REPLACE TRIGGER "enforce_subject_teacher_report_daily_limit" BEFORE INSERT ON "public"."parent_adviser_reports" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_subject_teacher_report_daily_limit"();



CREATE OR REPLACE TRIGGER "guidance_staff_employee_id_registry" AFTER INSERT OR DELETE OR UPDATE OF "employee_id" ON "public"."guidance_counselors" FOR EACH ROW EXECUTE FUNCTION "public"."sync_staff_employee_id_registry"('Guidance');



CREATE OR REPLACE TRIGGER "ict_admins_staff_employee_id_registry" AFTER INSERT OR DELETE OR UPDATE OF "employee_id" ON "public"."ict_admins" FOR EACH ROW EXECUTE FUNCTION "public"."sync_staff_employee_id_registry"('ICT');



CREATE OR REPLACE TRIGGER "parents_sync_login_contact_number" BEFORE INSERT OR UPDATE OF "contact_number" ON "public"."parents" FOR EACH ROW EXECUTE FUNCTION "public"."sync_parent_login_contact_number"();



CREATE OR REPLACE TRIGGER "prevent_hard_delete" BEFORE DELETE ON "public"."advisers" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_archivable_hard_delete"();



CREATE OR REPLACE TRIGGER "prevent_hard_delete" BEFORE DELETE ON "public"."guidance_counselors" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_archivable_hard_delete"();



CREATE OR REPLACE TRIGGER "prevent_hard_delete" BEFORE DELETE ON "public"."ict_admins" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_archivable_hard_delete"();



CREATE OR REPLACE TRIGGER "prevent_hard_delete" BEFORE DELETE ON "public"."parents" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_archivable_hard_delete"();



CREATE OR REPLACE TRIGGER "prevent_hard_delete" BEFORE DELETE ON "public"."principals" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_archivable_hard_delete"();



CREATE OR REPLACE TRIGGER "prevent_hard_delete" BEFORE DELETE ON "public"."students" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_archivable_hard_delete"();



CREATE OR REPLACE TRIGGER "principals_staff_employee_id_registry" AFTER INSERT OR DELETE OR UPDATE OF "employee_id" ON "public"."principals" FOR EACH ROW EXECUTE FUNCTION "public"."sync_staff_employee_id_registry"('Principal');



CREATE OR REPLACE TRIGGER "scheduled_deletions_notify_parent_in_app" AFTER INSERT OR UPDATE OF "status", "target_type", "target_id" ON "public"."scheduled_deletions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_parent_deletion_notification"();



CREATE OR REPLACE TRIGGER "scheduled_deletions_sync_references" AFTER INSERT OR UPDATE OF "target_type", "target_id", "requested_by_role", "requested_by_id" ON "public"."scheduled_deletions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_scheduled_deletion_references"();



CREATE OR REPLACE TRIGGER "sections_prevent_occupied_delete" BEFORE DELETE ON "public"."sections" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_occupied_section_deletion"();



CREATE OR REPLACE TRIGGER "set_student_report_date_manila" BEFORE INSERT OR UPDATE OF "created_at" ON "public"."student_reports" FOR EACH ROW EXECUTE FUNCTION "public"."set_student_report_date_manila"();



CREATE OR REPLACE TRIGGER "student_reports_enforce_subject_teacher_daily_limit" BEFORE INSERT ON "public"."student_reports" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_subject_teacher_student_report_daily_limit"();



CREATE OR REPLACE TRIGGER "trigger_notify_on_principal_publish" AFTER UPDATE ON "public"."principal_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_principal_announcement_publish"();



CREATE OR REPLACE TRIGGER "trigger_notify_parents_on_publish" AFTER UPDATE ON "public"."guidance_announcements" FOR EACH ROW EXECUTE FUNCTION "public"."notify_parents_on_publish"();



ALTER TABLE ONLY "public"."adviser_announcements"
    ADD CONSTRAINT "adviser_announcements_adviser_fk" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."adviser_assignment_history"
    ADD CONSTRAINT "adviser_assignment_history_adviser_id_fkey" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."adviser_assignment_history"
    ADD CONSTRAINT "adviser_assignment_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."adviser_change_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."adviser_notification_reads"
    ADD CONSTRAINT "adviser_notification_reads_adviser_fk" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."adviser_principal_messages"
    ADD CONSTRAINT "adviser_principal_messages_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."adviser_principal_messages"
    ADD CONSTRAINT "adviser_principal_messages_source_staff_message_id_fkey" FOREIGN KEY ("source_staff_message_id") REFERENCES "public"."principal_staff_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."adviser_report_favorites"
    ADD CONSTRAINT "adviser_report_favorites_adviser_id_fkey" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."adviser_report_favorites"
    ADD CONSTRAINT "adviser_report_favorites_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."parent_adviser_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_email_jobs"
    ADD CONSTRAINT "attendance_email_jobs_attendance_log_id_fkey" FOREIGN KEY ("attendance_log_id") REFERENCES "public"."attendance_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_email_jobs"
    ADD CONSTRAINT "attendance_email_jobs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_class_session_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_sessions"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_student_db_id_fkey" FOREIGN KEY ("student_db_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_notification_settings"
    ADD CONSTRAINT "attendance_notification_settings_updated_by_ict_id_fkey" FOREIGN KEY ("updated_by_ict_id") REFERENCES "public"."ict_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_sms_jobs"
    ADD CONSTRAINT "attendance_sms_jobs_attendance_log_id_fkey" FOREIGN KEY ("attendance_log_id") REFERENCES "public"."attendance_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_sms_jobs"
    ADD CONSTRAINT "attendance_sms_jobs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_sms_provider_events"
    ADD CONSTRAINT "attendance_sms_provider_events_attendance_sms_job_id_fkey" FOREIGN KEY ("attendance_sms_job_id") REFERENCES "public"."attendance_sms_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."excuse_letters"
    ADD CONSTRAINT "excuse_letters_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."guidance_announcements"
    ADD CONSTRAINT "guidance_announcements_guidance_fk" FOREIGN KEY ("guidance_id") REFERENCES "public"."guidance_counselors"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."guidance_change_requests"
    ADD CONSTRAINT "guidance_change_requests_guidance_id_fkey" FOREIGN KEY ("guidance_id") REFERENCES "public"."guidance_counselors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guidance_change_requests"
    ADD CONSTRAINT "guidance_change_requests_reviewed_by_ict_id_fkey" FOREIGN KEY ("reviewed_by_ict_id") REFERENCES "public"."ict_admins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."guidance_notification_reads"
    ADD CONSTRAINT "guidance_notification_reads_guidance_fk" FOREIGN KEY ("guidance_id") REFERENCES "public"."guidance_counselors"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."guidance_report_favorites"
    ADD CONSTRAINT "guidance_report_favorites_guidance_id_fkey" FOREIGN KEY ("guidance_id") REFERENCES "public"."guidance_counselors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guidance_report_favorites"
    ADD CONSTRAINT "guidance_report_favorites_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."parent_adviser_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guidance_ticket_reads"
    ADD CONSTRAINT "guidance_ticket_reads_guidance_id_fkey" FOREIGN KEY ("guidance_id") REFERENCES "public"."guidance_counselors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guidance_ticket_reads"
    ADD CONSTRAINT "guidance_ticket_reads_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."parent_report_guidance_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ict_announcements"
    ADD CONSTRAINT "ict_announcements_sender_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."ict_admins"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ict_notification_reads"
    ADD CONSTRAINT "ict_notification_reads_ict_fk" FOREIGN KEY ("ict_id") REFERENCES "public"."ict_admins"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."parent_account_change_notifications"
    ADD CONSTRAINT "parent_account_change_notifications_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_adviser_report_messages"
    ADD CONSTRAINT "parent_adviser_report_messages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."parent_adviser_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_announcement_notifications"
    ADD CONSTRAINT "parent_announcement_notifications_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."parent_announcement_notifications"
    ADD CONSTRAINT "parent_announcement_notifications_student_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."parent_attendance_notification_reads"
    ADD CONSTRAINT "parent_attendance_notification_reads_attendance_log_id_fkey" FOREIGN KEY ("attendance_log_id") REFERENCES "public"."attendance_logs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_attendance_notification_reads"
    ADD CONSTRAINT "parent_attendance_notification_reads_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_deletion_notifications"
    ADD CONSTRAINT "parent_deletion_notifications_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."parent_deletion_notifications"
    ADD CONSTRAINT "parent_deletion_notifications_scheduled_deletion_id_fkey" FOREIGN KEY ("scheduled_deletion_id") REFERENCES "public"."scheduled_deletions"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."parent_password_reset_otps"
    ADD CONSTRAINT "parent_password_reset_otps_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_report_guidance_tickets"
    ADD CONSTRAINT "parent_report_guidance_tickets_adviser_id_fkey" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_report_guidance_tickets"
    ADD CONSTRAINT "parent_report_guidance_tickets_assigned_guidance_id_fkey" FOREIGN KEY ("assigned_guidance_id") REFERENCES "public"."guidance_counselors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."parent_report_guidance_tickets"
    ADD CONSTRAINT "parent_report_guidance_tickets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_report_guidance_tickets"
    ADD CONSTRAINT "parent_report_guidance_tickets_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."parent_adviser_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_student_links"
    ADD CONSTRAINT "parent_student_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_verification_otps"
    ADD CONSTRAINT "parent_verification_otps_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("student_id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."principal_announcements"
    ADD CONSTRAINT "principal_announcements_sender_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."principals"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."principal_notification_reads"
    ADD CONSTRAINT "principal_notification_reads_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."principal_report_favorites"
    ADD CONSTRAINT "principal_report_favorites_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."principal_report_favorites"
    ADD CONSTRAINT "principal_report_favorites_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."parent_adviser_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."principal_staff_messages"
    ADD CONSTRAINT "principal_staff_messages_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."principal_staff_messages"
    ADD CONSTRAINT "principal_staff_messages_source_adviser_message_id_fkey" FOREIGN KEY ("source_adviser_message_id") REFERENCES "public"."adviser_principal_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_adviser_transfers"
    ADD CONSTRAINT "scheduled_adviser_transfers_cancelled_by_ict_id_fkey" FOREIGN KEY ("cancelled_by_ict_id") REFERENCES "public"."ict_admins"("id");



ALTER TABLE ONLY "public"."scheduled_adviser_transfers"
    ADD CONSTRAINT "scheduled_adviser_transfers_incoming_adviser_id_fkey" FOREIGN KEY ("incoming_adviser_id") REFERENCES "public"."advisers"("id");



ALTER TABLE ONLY "public"."scheduled_adviser_transfers"
    ADD CONSTRAINT "scheduled_adviser_transfers_outgoing_adviser_id_fkey" FOREIGN KEY ("outgoing_adviser_id") REFERENCES "public"."advisers"("id");



ALTER TABLE ONLY "public"."scheduled_adviser_transfers"
    ADD CONSTRAINT "scheduled_adviser_transfers_requested_by_ict_id_fkey" FOREIGN KEY ("requested_by_ict_id") REFERENCES "public"."ict_admins"("id");



ALTER TABLE ONLY "public"."scheduled_deletion_requesters"
    ADD CONSTRAINT "scheduled_deletion_requesters_adviser_id_fkey" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."scheduled_deletion_requesters"
    ADD CONSTRAINT "scheduled_deletion_requesters_ict_admin_id_fkey" FOREIGN KEY ("ict_admin_id") REFERENCES "public"."ict_admins"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."scheduled_deletion_requesters"
    ADD CONSTRAINT "scheduled_deletion_requesters_scheduled_deletion_id_fkey" FOREIGN KEY ("scheduled_deletion_id") REFERENCES "public"."scheduled_deletions"("id") ON UPDATE RESTRICT ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_deletion_targets"
    ADD CONSTRAINT "scheduled_deletion_targets_adviser_id_fkey" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."scheduled_deletion_targets"
    ADD CONSTRAINT "scheduled_deletion_targets_ict_admin_id_fkey" FOREIGN KEY ("ict_admin_id") REFERENCES "public"."ict_admins"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."scheduled_deletion_targets"
    ADD CONSTRAINT "scheduled_deletion_targets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."scheduled_deletion_targets"
    ADD CONSTRAINT "scheduled_deletion_targets_scheduled_deletion_id_fkey" FOREIGN KEY ("scheduled_deletion_id") REFERENCES "public"."scheduled_deletions"("id") ON UPDATE RESTRICT ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_deletion_targets"
    ADD CONSTRAINT "scheduled_deletion_targets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."scheduled_deletions"
    ADD CONSTRAINT "scheduled_deletions_approved_by_ict_fk" FOREIGN KEY ("approved_by_ict_id") REFERENCES "public"."ict_admins"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."staff_messages"
    ADD CONSTRAINT "staff_messages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."parent_adviser_reports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_messages"
    ADD CONSTRAINT "staff_messages_source_message_id_fkey" FOREIGN KEY ("source_message_id") REFERENCES "public"."staff_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_family_members"
    ADD CONSTRAINT "student_family_members_student_db_id_fkey" FOREIGN KEY ("student_db_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_remarks"
    ADD CONSTRAINT "student_remarks_created_by_adviser_id_fkey" FOREIGN KEY ("created_by_adviser_id") REFERENCES "public"."advisers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_remarks"
    ADD CONSTRAINT "student_remarks_student_db_id_fkey" FOREIGN KEY ("student_db_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_reports"
    ADD CONSTRAINT "student_reports_adviser_fk" FOREIGN KEY ("adviser_id") REFERENCES "public"."advisers"("id") ON UPDATE RESTRICT ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_section_grade_fk" FOREIGN KEY ("section", "grade") REFERENCES "public"."sections"("name", "grade") ON UPDATE CASCADE ON DELETE RESTRICT;



CREATE POLICY "Service role full access" ON "public"."guidance_announcements" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."parent_announcement_notifications" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."adviser_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adviser_assignment_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adviser_change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adviser_notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adviser_principal_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adviser_report_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."advisers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_email_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_email_jobs_service_role" ON "public"."attendance_email_jobs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."attendance_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_notification_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_notification_settings_service_role" ON "public"."attendance_notification_settings" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."attendance_sms_dispatch_leases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_sms_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_sms_jobs_service_role" ON "public"."attendance_sms_jobs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."attendance_sms_provider_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."class_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_us_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."excuse_letters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guidance_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guidance_change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guidance_counselors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guidance_notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guidance_report_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guidance_ticket_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ict_admins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ict_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ict_notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."login_attempt_guards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_account_change_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_adviser_report_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_adviser_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_announcement_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_attendance_notification_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parent_dashboard_service_role_only" ON "public"."attendance_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."excuse_letters" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."parent_adviser_report_messages" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."parent_adviser_reports" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."parent_announcement_notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."parent_attendance_notification_reads" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."parent_report_guidance_tickets" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."parent_student_links" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "parent_dashboard_service_role_only" ON "public"."parents" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."parent_deletion_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_password_reset_otps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_password_reset_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_report_guidance_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_student_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parent_verification_otps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."principal_announcements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."principal_notification_reads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."principal_report_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."principal_staff_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."principals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_api_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_adviser_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_deletion_requesters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_deletion_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_deletions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."school_year_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_employee_ids" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_family_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_remarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subject_teacher_report_otps" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."adviser_announcements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."adviser_principal_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."class_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."guidance_announcements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."parent_adviser_report_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."parent_adviser_reports";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."parent_announcement_notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."principal_announcements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."principal_staff_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."staff_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."student_reports";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."students";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."append_parent_adviser_report_message"("p_report_id" bigint, "p_sender_role" "text", "p_sender_name" "text", "p_body" "text", "p_attachments" "jsonb", "p_thread_type" "text", "p_idempotency_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."append_parent_adviser_report_message"("p_report_id" bigint, "p_sender_role" "text", "p_sender_name" "text", "p_body" "text", "p_attachments" "jsonb", "p_thread_type" "text", "p_idempotency_key" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."append_parent_adviser_report_message"("p_report_id" bigint, "p_sender_role" "text", "p_sender_name" "text", "p_body" "text", "p_attachments" "jsonb", "p_thread_type" "text", "p_idempotency_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_parent_adviser_report_message"("p_report_id" bigint, "p_sender_role" "text", "p_sender_name" "text", "p_body" "text", "p_attachments" "jsonb", "p_thread_type" "text", "p_idempotency_key" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_attendance_class_session"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_attendance_class_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_attendance_class_session"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_parent_report_with_cooldown"("p_report_id" bigint, "p_parent_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_parent_report_with_cooldown"("p_report_id" bigint, "p_parent_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_parent_report_with_cooldown"("p_report_id" bigint, "p_parent_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_parent_report_with_cooldown"("p_report_id" bigint, "p_parent_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_attendance_student_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_attendance_student_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_attendance_student_scope"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_parent_password_reset_rate_limit"("p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_parent_password_reset_rate_limit"("p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_public_api_rate_limit"("p_scope" "text", "p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_public_api_rate_limit"("p_scope" "text", "p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_public_api_rate_limit"("p_scope" "text", "p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_public_api_rate_limit"("p_scope" "text", "p_subject_hash" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_subject_teacher_report_otp"("p_email" "text", "p_otp_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_subject_teacher_report_otp"("p_email" "text", "p_otp_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_excuse_letter"("p_letter_id" bigint, "p_adviser_id" bigint, "p_status" "text", "p_decline_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_excuse_letter"("p_letter_id" bigint, "p_adviser_id" bigint, "p_status" "text", "p_decline_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_subject_teacher_report_daily_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_subject_teacher_report_daily_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_subject_teacher_report_daily_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_subject_teacher_student_report_daily_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_subject_teacher_student_report_daily_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_subject_teacher_student_report_daily_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_attendance_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_attendance_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_attendance_email_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_attendance_sms_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_attendance_sms_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_attendance_sms_job"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_login_attempt_guard"("p_role" "text", "p_subject_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_login_attempt_guard_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_students_with_attendance"("p_grade" "text", "p_section" "text", "p_search" "text", "p_filter" "text", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_students_with_attendance"("p_grade" "text", "p_section" "text", "p_search" "text", "p_filter" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_students_with_attendance"("p_grade" "text", "p_section" "text", "p_search" "text", "p_filter" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_parent_verification_otp"("p_challenge_id" "uuid", "p_parent_id" integer, "p_purpose" "text", "p_channel" "text", "p_otp_hash" "text", "p_expires_at" timestamp with time zone, "p_resend_available_at" timestamp with time zone, "p_replace_existing" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_parent_verification_otp"("p_challenge_id" "uuid", "p_parent_id" integer, "p_purpose" "text", "p_channel" "text", "p_otp_hash" "text", "p_expires_at" timestamp with time zone, "p_resend_available_at" timestamp with time zone, "p_replace_existing" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_attendance_sms_job_message"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_attendance_sms_job_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_parent_login_contact_number"("p_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_parent_login_contact_number"("p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_parent_login_contact_number"("p_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_principal_announcement_publish"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_principal_announcement_publish"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_principal_announcement_publish"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_parents_on_principal_announcement"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_parents_on_principal_announcement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_parents_on_principal_announcement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_parents_on_publish"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_parents_on_publish"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_parents_on_publish"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_archivable_hard_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_archivable_hard_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_archivable_hard_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_audit_log_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_audit_log_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_audit_log_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_occupied_section_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_occupied_section_deletion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_attendance_absences"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_attendance_absences"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_due_adviser_transfers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_due_adviser_transfers"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_due_adviser_transfers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_due_adviser_transfers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_failed_login_attempt"("p_role" "text", "p_subject_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_failed_login_attempt"("p_role" "text", "p_subject_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_failed_login_attempt_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_failed_login_attempt_v2"("p_role" "text", "p_account_hash" "text", "p_ip_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_manual_excuse"("p_student_id" "text", "p_adviser_id" bigint, "p_date_from" "date", "p_date_to" "date", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_manual_excuse"("p_student_id" "text", "p_adviser_id" bigint, "p_date_from" "date", "p_date_to" "date", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_staff_employee_id_registry"("p_employee_id_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_staff_employee_id_registry"("p_employee_id_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_sensitive_audit_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."reject_sensitive_audit_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_sensitive_audit_data"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_attendance_sms_dispatch_lease"("p_owner_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_attendance_sms_dispatch_lease"("p_owner_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rename_section"("p_section_id" integer, "p_grade" "text", "p_old_name" "text", "p_new_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rename_section"("p_section_id" integer, "p_grade" "text", "p_old_name" "text", "p_new_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rename_section"("p_section_id" integer, "p_grade" "text", "p_old_name" "text", "p_new_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_section"("p_section_id" integer, "p_grade" "text", "p_old_name" "text", "p_new_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rename_sections"("p_renames" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rename_sections"("p_renames" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."rename_sections"("p_renames" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_sections"("p_renames" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rename_student_lrn"("p_student_db_id" integer, "p_new_student_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rename_student_lrn"("p_student_db_id" integer, "p_new_student_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_parent_password_with_otp"("p_parent_id" bigint, "p_otp_hash" "text", "p_password_hash" "text", "p_parent_name" "text", "p_parent_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_parent_password_with_otp"("p_parent_id" bigint, "p_otp_hash" "text", "p_password_hash" "text", "p_parent_name" "text", "p_parent_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_attendance_sms_job_idempotency_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_attendance_sms_job_idempotency_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_student_report_date_manila"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_student_report_date_manila"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_student_report_date_manila"() TO "service_role";



GRANT ALL ON TABLE "public"."parent_adviser_reports" TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_created_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_created_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_categories" "text"[], "p_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_subject_teacher_report"("p_parent_id" bigint, "p_parent_email" "text", "p_parent_name" "text", "p_adviser_id" bigint, "p_adviser_name" "text", "p_student_id" "text", "p_student_name" "text", "p_grade" "text", "p_section" "text", "p_subject" "text", "p_subject_teacher_email" "text", "p_teacher_name" "text", "p_concern" "text", "p_submission_key" "uuid", "p_categories" "text"[], "p_created_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_deletion_email_job_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_deletion_email_job_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_deletion_email_job_items"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_parent_deletion_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_parent_deletion_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_parent_deletion_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_parent_login_contact_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_parent_login_contact_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_scheduled_deletion_references"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_scheduled_deletion_references"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_scheduled_deletion_references"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_staff_employee_id_registry"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_staff_employee_id_registry"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_attendance_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_attendance_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_attendance_email_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_attendance_notification_settings"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_attendance_notification_settings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_attendance_notification_settings"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_attendance_sms_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_attendance_sms_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_attendance_sms_job"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_deletion_email_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_deletion_email_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_deletion_email_job"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."try_acquire_attendance_sms_dispatch_lease"("p_owner_token" "uuid", "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."try_acquire_attendance_sms_dispatch_lease"("p_owner_token" "uuid", "p_lease_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_parent_verification_otp"("p_challenge_id" "uuid", "p_purpose" "text", "p_otp_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_parent_verification_otp"("p_challenge_id" "uuid", "p_purpose" "text", "p_otp_hash" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."adviser_announcements" TO "anon";
GRANT ALL ON TABLE "public"."adviser_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."adviser_announcements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adviser_announcements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adviser_announcements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adviser_announcements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."adviser_assignment_history" TO "anon";
GRANT ALL ON TABLE "public"."adviser_assignment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."adviser_assignment_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adviser_assignment_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adviser_assignment_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adviser_assignment_history_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."adviser_change_requests" TO "anon";
GRANT ALL ON TABLE "public"."adviser_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."adviser_change_requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adviser_change_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adviser_change_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adviser_change_requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."adviser_notification_reads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adviser_notification_reads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adviser_notification_reads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adviser_notification_reads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."adviser_principal_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."adviser_principal_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."adviser_principal_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."adviser_principal_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."adviser_report_favorites" TO "anon";
GRANT ALL ON TABLE "public"."adviser_report_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."adviser_report_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."advisers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."advisers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."advisers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."advisers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_email_jobs" TO "anon";
GRANT ALL ON TABLE "public"."attendance_email_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_email_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."attendance_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."attendance_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."attendance_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."attendance_notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_notification_settings" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_sms_dispatch_leases" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_sms_jobs" TO "anon";
GRANT ALL ON TABLE "public"."attendance_sms_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_sms_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_sms_provider_events" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."class_sessions" TO "anon";
GRANT ALL ON TABLE "public"."class_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."class_sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."class_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."class_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."class_sessions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contact_us_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_us_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_us_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contact_us_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contact_us_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contact_us_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."excuse_letters" TO "service_role";



GRANT ALL ON SEQUENCE "public"."excuse_letters_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."excuse_letters_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."excuse_letters_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."guidance_announcements" TO "anon";
GRANT ALL ON TABLE "public"."guidance_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."guidance_announcements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."guidance_announcements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."guidance_announcements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."guidance_announcements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."guidance_change_requests" TO "anon";
GRANT ALL ON TABLE "public"."guidance_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."guidance_change_requests" TO "service_role";



GRANT ALL ON SEQUENCE "public"."guidance_change_requests_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."guidance_change_requests_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."guidance_change_requests_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."guidance_counselors" TO "anon";
GRANT ALL ON TABLE "public"."guidance_counselors" TO "authenticated";
GRANT ALL ON TABLE "public"."guidance_counselors" TO "service_role";



GRANT ALL ON SEQUENCE "public"."guidance_counselors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."guidance_counselors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."guidance_counselors_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."guidance_notification_reads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."guidance_notification_reads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."guidance_notification_reads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."guidance_notification_reads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."guidance_report_favorites" TO "anon";
GRANT ALL ON TABLE "public"."guidance_report_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."guidance_report_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."guidance_ticket_reads" TO "anon";
GRANT ALL ON TABLE "public"."guidance_ticket_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."guidance_ticket_reads" TO "service_role";



GRANT ALL ON TABLE "public"."ict_admins" TO "anon";
GRANT ALL ON TABLE "public"."ict_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."ict_admins" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ict_admins_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ict_admins_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ict_admins_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ict_announcements" TO "anon";
GRANT ALL ON TABLE "public"."ict_announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."ict_announcements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ict_announcements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ict_announcements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ict_announcements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ict_notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."ict_notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."ict_notification_reads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ict_notification_reads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ict_notification_reads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ict_notification_reads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."login_attempt_guards" TO "service_role";



GRANT ALL ON TABLE "public"."parent_account_change_notifications" TO "anon";
GRANT ALL ON TABLE "public"."parent_account_change_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_account_change_notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parent_account_change_notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parent_account_change_notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parent_account_change_notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parent_adviser_report_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parent_adviser_report_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parent_adviser_report_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parent_adviser_report_messages_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parent_adviser_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parent_adviser_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parent_adviser_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parent_announcement_notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parent_announcement_notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parent_announcement_notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parent_announcement_notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parent_attendance_notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."parent_deletion_notifications" TO "anon";
GRANT ALL ON TABLE "public"."parent_deletion_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_deletion_notifications" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parent_deletion_notifications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parent_deletion_notifications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parent_deletion_notifications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parent_password_reset_otps" TO "service_role";



GRANT ALL ON TABLE "public"."parent_password_reset_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."parent_report_guidance_tickets" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parent_report_guidance_tickets_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parent_report_guidance_tickets_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parent_report_guidance_tickets_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parent_student_links" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parent_student_links_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parent_student_links_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parent_student_links_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."parent_verification_otps" TO "anon";
GRANT ALL ON TABLE "public"."parent_verification_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_verification_otps" TO "service_role";



GRANT ALL ON TABLE "public"."parents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."parents_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."parents_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."parents_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."principal_announcements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."principal_announcements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."principal_announcements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."principal_announcements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."principal_notification_reads" TO "service_role";



GRANT ALL ON SEQUENCE "public"."principal_notification_reads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."principal_notification_reads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."principal_notification_reads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."principal_report_favorites" TO "anon";
GRANT ALL ON TABLE "public"."principal_report_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."principal_report_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."principal_staff_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."principal_staff_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."principal_staff_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."principal_staff_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."principals" TO "anon";
GRANT ALL ON TABLE "public"."principals" TO "authenticated";
GRANT ALL ON TABLE "public"."principals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."principals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."principals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."principals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."public_api_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."public_api_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."public_api_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_adviser_transfers" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_adviser_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_adviser_transfers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."scheduled_adviser_transfers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."scheduled_adviser_transfers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."scheduled_adviser_transfers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_deletion_requesters" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_deletion_requesters" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_deletion_requesters" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_deletion_targets" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_deletion_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_deletion_targets" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_deletions" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_deletions" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_deletions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."scheduled_deletions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."scheduled_deletions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."scheduled_deletions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."school_year_config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."school_year_config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."school_year_config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."school_year_config_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sections" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sections_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sections_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sections_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff_employee_id_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."staff_employee_ids" TO "service_role";



GRANT ALL ON TABLE "public"."staff_messages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."staff_messages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."staff_messages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."staff_messages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."student_family_members" TO "service_role";



GRANT ALL ON SEQUENCE "public"."student_family_members_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."student_family_members_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."student_family_members_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."student_remarks" TO "anon";
GRANT ALL ON TABLE "public"."student_remarks" TO "authenticated";
GRANT ALL ON TABLE "public"."student_remarks" TO "service_role";



GRANT ALL ON SEQUENCE "public"."student_remarks_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."student_remarks_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."student_remarks_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."student_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."student_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."student_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."student_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON SEQUENCE "public"."students_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."students_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."students_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."subject_teacher_report_otps" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































