# PARENTCONNECT ERD package

These five 3000 x 2100 PNG diagrams were produced from the live public Supabase schema (44 tables and 28 declared foreign keys). Graphify was used to cross-check the application domains; the table cards and relationship lines use the database schema as the source of truth.

## Legend

- `PK` — primary key
- `FK` — declared/enforced Supabase foreign key
- `UQ` — unique field or unique composite member
- `1`, `0..1`, and `0..*` — cardinality at that endpoint

Repeated cards marked **(alias)** are the same database table drawn again solely to keep relationship lines separate.

## 01 — System overview

Shows the five database domains at a thesis-friendly level: Student and Family, Attendance and RFID, Reports and Messaging, Accounts and Notifications, and Audit and System Support. It intentionally has no relationship lines, so it does not imply relationships that the database does not declare.

## 02 — Students and Family

- One `students` record can have zero or many `parent_student_links`, `student_family_members`, and `excuse_letters`; each of those child rows refers to one student.
- One `parents` record can have zero or many `parent_student_links` and `parent_family_members`; each child row refers to one parent.
- `parents.student_id` is a separate optional direct foreign key to `students.student_id`; the diagram uses an alias card to show it without crossing the link-table relationship.
- `sections` and `school_year_config` have no declared foreign keys, so no line is drawn to them.

## 03 — Attendance and RFID

- One student can have zero or many `attendance_logs`; every log optionally references a student with `student_db_id`.
- Every `attendance_sms_jobs` row requires one attendance log, while a log has at most one SMS job because `attendance_log_id` is unique.
- An SMS job optionally references one parent; a parent can be associated with many SMS jobs.
- `parent_attendance_notification_reads` is the parent/log read-receipt table: each row requires one parent and one attendance log.
- RFID is not a table: it is the unique `students.rfid_card` field. `class_sessions` has no declared FK to attendance.

## 04 — Reports, Tickets, and Messaging

- One `parent_adviser_reports` row can have many `parent_adviser_report_messages` and at most one `parent_report_guidance_tickets` row.
- Each guidance ticket requires one parent and optionally references an adviser and a guidance counselor.
- A `guidance_change_requests` row requires a guidance counselor and can optionally reference an ICT reviewer.
- `adviser_assignment_history` requires one adviser and can optionally reference an adviser-change request.
- `student_reports` has identifier-like values but no declared foreign key; it is deliberately shown without a line.

## 05 — Accounts, Notifications, and Audit

- One `announcements` row can produce many `adviser_notifications` rows.
- A principal can have many adviser-principal messages, principal-staff messages, and principal notification-read records.
- `principal_staff_messages` can optionally reference a source adviser-principal message; `staff_messages.source_message_id` is an optional self-reference.
- A parent has at most one `parent_password_reset_otps` row because its primary key is `parent_id`.
- Role-specific announcement/read tables, audit logging, login guards, deletion jobs, email jobs, contact messages, and report OTPs have no declared foreign keys; they are grouped without relationship lines.

## Schema gaps intentionally not guessed

- The database has no dedicated parent signup/verification table with declared relationships. Parent registration data is represented by `parents`, `parent_student_links`, and related family tables.
- No FK connects students or advisers to `sections`, and no FK connects `class_sessions` to attendance.
- Several tables store IDs, email addresses, grade/section values, or notification keys without declaring a foreign key. These values are not drawn as relationships.
