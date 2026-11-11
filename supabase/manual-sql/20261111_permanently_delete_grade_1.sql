-- MANUAL SUPABASE SQL EDITOR SCRIPT — NOT A MIGRATION
--
-- Permanently removes every Grade 1 student and every Parent account linked
-- only to Grade 1, including archived rows. It also removes Grade 1 class
-- sessions, attendance, reports, announcements, Parent-facing messages,
-- notification jobs, and the matching scheduled-deletion history.
--
-- The database currently blocks direct deletes from students and parents with
-- the `prevent_hard_delete` trigger. This script disables only those two
-- triggers inside this transaction, then re-enables them before COMMIT.
--
-- Run this entire file once in the Supabase SQL Editor as a database owner.
-- If the SQL Editor reports any error, run ROLLBACK; do not run later lines
-- separately. This script intentionally does not delete global audit-trail
-- records because they are not safely scoped by Grade 1.

BEGIN;

-- Snapshot the target students, including archived records.
CREATE TEMP TABLE _pc_grade1_students ON COMMIT DROP AS
SELECT id, student_id
FROM public.students
WHERE lower(btrim(grade)) = 'grade 1';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _pc_grade1_students) THEN
    RAISE EXCEPTION 'No Grade 1 students were found; nothing was deleted.';
  END IF;
END;
$$;

-- A Parent can be linked through the legacy primary student field or the
-- normalized parent_student_links relation.
CREATE TEMP TABLE _pc_grade1_parents ON COMMIT DROP AS
SELECT DISTINCT parent.id
FROM public.parents AS parent
WHERE parent.student_id IN (SELECT student_id FROM _pc_grade1_students)
   OR EXISTS (
     SELECT 1
     FROM public.parent_student_links AS link
     WHERE link.parent_id = parent.id
       AND link.student_id IN (SELECT student_id FROM _pc_grade1_students)
   );

-- Never delete a Parent account that also belongs to a non-Grade 1 student.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _pc_grade1_parents AS target_parent
    JOIN public.parents AS parent ON parent.id = target_parent.id
    LEFT JOIN public.students AS primary_student
      ON primary_student.student_id = parent.student_id
    WHERE parent.student_id IS NOT NULL
      AND (
        primary_student.student_id IS NULL
        OR lower(btrim(primary_student.grade)) <> 'grade 1'
      )
  ) OR EXISTS (
    SELECT 1
    FROM _pc_grade1_parents AS target_parent
    JOIN public.parent_student_links AS link ON link.parent_id = target_parent.id
    LEFT JOIN public.students AS linked_student
      ON linked_student.student_id = link.student_id
    WHERE linked_student.student_id IS NULL
       OR lower(btrim(linked_student.grade)) <> 'grade 1'
  ) THEN
    RAISE EXCEPTION
      'At least one Grade 1-linked Parent is also linked outside Grade 1. No data was deleted.';
  END IF;
END;
$$;

CREATE TEMP TABLE _pc_grade1_sessions ON COMMIT DROP AS
SELECT id
FROM public.class_sessions
WHERE lower(btrim(grade)) = 'grade 1';

CREATE TEMP TABLE _pc_grade1_attendance_logs ON COMMIT DROP AS
SELECT DISTINCT attendance.id
FROM public.attendance_logs AS attendance
WHERE attendance.student_db_id IN (SELECT id FROM _pc_grade1_students)
   OR attendance.class_session_id IN (SELECT id FROM _pc_grade1_sessions);

-- Do not remove a Grade 1 class session if it somehow contains another
-- grade's attendance record.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.attendance_logs AS attendance
    JOIN _pc_grade1_sessions AS session ON session.id = attendance.class_session_id
    LEFT JOIN _pc_grade1_students AS student ON student.id = attendance.student_db_id
    WHERE student.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'A Grade 1 class session contains a non-Grade 1 attendance record. No data was deleted.';
  END IF;
END;
$$;

CREATE TEMP TABLE _pc_grade1_announcements ON COMMIT DROP AS
SELECT id
FROM public.adviser_announcements
WHERE lower(btrim(grade)) = 'grade 1';

CREATE TEMP TABLE _pc_grade1_parent_reports ON COMMIT DROP AS
SELECT DISTINCT report.id
FROM public.parent_adviser_reports AS report
WHERE lower(btrim(report.grade)) = 'grade 1'
   OR report.student_id IN (SELECT student_id FROM _pc_grade1_students)
   OR report.parent_id IN (SELECT id FROM _pc_grade1_parents);

CREATE TEMP TABLE _pc_grade1_student_reports ON COMMIT DROP AS
SELECT DISTINCT report.id
FROM public.student_reports AS report
WHERE lower(btrim(report.grade)) = 'grade 1'
   OR report.student_id IN (SELECT student_id FROM _pc_grade1_students)
   OR report.student_db_id IN (SELECT id FROM _pc_grade1_students);

-- Capture both direct staff-to-Parent conversations and report-linked staff
-- messages. The recursive part includes every saved reply in a conversation,
-- even if that reply itself has no Parent ID or report ID.
CREATE TEMP TABLE _pc_grade1_staff_messages ON COMMIT DROP AS
WITH RECURSIVE grade1_message_thread AS (
  SELECT message.id
  FROM public.staff_messages AS message
  WHERE message.report_id IN (SELECT id FROM _pc_grade1_parent_reports)
     OR (
       lower(btrim(message.sender_type)) = 'parent'
       AND message.sender_id IN (SELECT id FROM _pc_grade1_parents)
     )
     OR (
       lower(btrim(message.recipient_type)) = 'parent'
       AND message.recipient_id IN (SELECT id FROM _pc_grade1_parents)
     )

  UNION

  SELECT reply.id
  FROM public.staff_messages AS reply
  JOIN grade1_message_thread AS prior_message
    ON reply.source_message_id = prior_message.id
)
SELECT id
FROM grade1_message_thread;

-- Every selected scheduled-deletion request must contain only Grade 1 targets.
CREATE TEMP TABLE _pc_grade1_scheduled_deletions ON COMMIT DROP AS
SELECT DISTINCT target.scheduled_deletion_id AS id
FROM public.scheduled_deletion_targets AS target
WHERE target.student_id IN (SELECT id FROM _pc_grade1_students)
   OR target.parent_id IN (SELECT id FROM _pc_grade1_parents);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _pc_grade1_scheduled_deletions AS deletion
    JOIN public.scheduled_deletion_targets AS target
      ON target.scheduled_deletion_id = deletion.id
    WHERE target.student_id IS NOT NULL
      AND target.student_id NOT IN (SELECT id FROM _pc_grade1_students)
  ) OR EXISTS (
    SELECT 1
    FROM _pc_grade1_scheduled_deletions AS deletion
    JOIN public.scheduled_deletion_targets AS target
      ON target.scheduled_deletion_id = deletion.id
    WHERE target.parent_id IS NOT NULL
      AND target.parent_id NOT IN (SELECT id FROM _pc_grade1_parents)
  ) OR EXISTS (
    SELECT 1
    FROM _pc_grade1_scheduled_deletions AS deletion
    JOIN public.scheduled_deletion_targets AS target
      ON target.scheduled_deletion_id = deletion.id
    WHERE target.student_id IS NULL
      AND target.parent_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'A scheduled-deletion request contains a non-Grade 1 target. No data was deleted.';
  END IF;
END;
$$;

-- These notifications block the deletion of their Parent or request records.
DELETE FROM public.parent_deletion_notifications
WHERE scheduled_deletion_id IN (SELECT id FROM _pc_grade1_scheduled_deletions)
   OR parent_id IN (SELECT id FROM _pc_grade1_parents);

-- Deletes its targets and requesters through the existing cascade constraints.
DELETE FROM public.scheduled_deletions
WHERE id IN (SELECT id FROM _pc_grade1_scheduled_deletions);

-- Remove Grade 1 delivery records before deleting the announcement, Parent,
-- attendance, and report rows they reference.
DELETE FROM public.parent_announcement_notifications
WHERE lower(btrim(grade)) = 'grade 1'
   OR student_id IN (SELECT student_id FROM _pc_grade1_students)
   OR parent_id IN (SELECT id FROM _pc_grade1_parents)
   OR announcement_id IN (SELECT id FROM _pc_grade1_announcements);

DELETE FROM public.attendance_sms_jobs
WHERE parent_id IN (SELECT id FROM _pc_grade1_parents)
   OR attendance_log_id IN (SELECT id FROM _pc_grade1_attendance_logs);

DELETE FROM public.attendance_email_jobs
WHERE parent_id IN (SELECT id FROM _pc_grade1_parents)
   OR attendance_log_id IN (SELECT id FROM _pc_grade1_attendance_logs);

-- Parent report conversation messages/favorites/tickets cascade with their
-- report. Standalone staff-to-Parent messages do not, so remove the selected
-- conversations and all their replies explicitly before Parent deletion.
DELETE FROM public.staff_messages
WHERE id IN (SELECT id FROM _pc_grade1_staff_messages);

DELETE FROM public.parent_adviser_reports
WHERE id IN (SELECT id FROM _pc_grade1_parent_reports);

DELETE FROM public.student_reports
WHERE id IN (SELECT id FROM _pc_grade1_student_reports);

DELETE FROM public.scheduled_adviser_transfers
WHERE lower(btrim(grade)) = 'grade 1';

DELETE FROM public.adviser_announcements
WHERE id IN (SELECT id FROM _pc_grade1_announcements);

DELETE FROM public.excuse_letters
WHERE student_id IN (SELECT student_id FROM _pc_grade1_students);

DELETE FROM public.attendance_logs
WHERE id IN (SELECT id FROM _pc_grade1_attendance_logs);

DELETE FROM public.class_sessions
WHERE id IN (SELECT id FROM _pc_grade1_sessions);

-- The following two triggers are the deliberate hard-delete guard. DDL is
-- transactional in PostgreSQL, so an error rolls this change back with all
-- prior deletes when this file is run as one transaction.
ALTER TABLE public.parents DISABLE TRIGGER prevent_hard_delete;
ALTER TABLE public.students DISABLE TRIGGER prevent_hard_delete;

DELETE FROM public.parents
WHERE id IN (SELECT id FROM _pc_grade1_parents);

DELETE FROM public.students
WHERE id IN (SELECT id FROM _pc_grade1_students);

ALTER TABLE public.parents ENABLE TRIGGER prevent_hard_delete;
ALTER TABLE public.students ENABLE TRIGGER prevent_hard_delete;

COMMIT;

-- Expected result: every value below is 0.
SELECT
  (SELECT count(*) FROM public.students WHERE lower(btrim(grade)) = 'grade 1')
    AS grade_1_students_remaining,
  (SELECT count(*) FROM public.class_sessions WHERE lower(btrim(grade)) = 'grade 1')
    AS grade_1_class_sessions_remaining,
  (SELECT count(*) FROM public.adviser_announcements WHERE lower(btrim(grade)) = 'grade 1')
    AS grade_1_announcements_remaining,
  (SELECT count(*) FROM public.parent_adviser_reports WHERE lower(btrim(grade)) = 'grade 1')
    AS grade_1_parent_reports_remaining,
  (SELECT count(*) FROM public.student_reports WHERE lower(btrim(grade)) = 'grade 1')
    AS grade_1_student_reports_remaining,
  (SELECT count(*) FROM public.parents WHERE archived_at IS NOT NULL)
    AS archived_parent_accounts_remaining;
