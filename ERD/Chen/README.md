# PARENTCONNECT Chen ERD package

The six PNGs are 4000 x 2600 Chen-notation diagrams based on the live `public` Supabase schema: 44 tables and 28 declared foreign keys. Graphify was used to cross-check the corresponding application domains; Supabase foreign-key constraints are the source of truth for all relationship lines.

## Notation

- Rectangle: entity/table; double rectangle: identification-dependent entity.
- Diamond: relationship; double diamond: identifying relationship.
- Oval: attribute; underlined oval: primary-key attribute; green `FK` oval: foreign-key attribute.
- A double line means total participation caused by a required foreign key.
- `1`, `0..1`, and `0..N` show endpoint cardinality.
- Multivalued and derived ovals are included in the legend only: the live schema has no columns explicitly defined that way.

## Diagram scope

1. **Complete overview** — high-level map of the system domains and representative enforced relationships. Detailed diagrams provide all domain tables.
2. **Student, Parent, and Family** — students, parents, the `parent_student_links` associative entity, family records, excuse letters, and sections.
3. **User Accounts and Signup** — parent registration fields, staff accounts, adviser/guidance change workflows, and the independent school-year configuration.
4. **Attendance and RFID** — RFID as `students.rfid_card`, attendance logs, SMS jobs, parents, read receipts, and class sessions.
5. **Reports, Messages, Tickets, and Escalation** — parent-adviser reports, report messages, guidance tickets, staff/principal messages, and staff assignments.
6. **Notifications, Announcements, Audit Logs, and Security** — announcement/notification relationships, reset OTPs, message self-reference, audit records, guards, and unconnected role-specific tables.

## Confirmed relationship highlights

- `parent_student_links` has required foreign keys to both `parents` and `students`; it is shown as an associative entity.
- `parents.student_id` is also an actual, optional direct FK to `students.student_id`.
- `attendance_sms_jobs.attendance_log_id` is unique, so an attendance log has at most one SMS job.
- `parent_attendance_notification_reads` is identification-dependent: its composite primary key is `parent_id` and `attendance_log_id`, both foreign keys.
- `parent_password_reset_otps.parent_id` is both its primary key and a foreign key to `parents`.
- `parent_report_guidance_tickets` requires a report and parent; its adviser and guidance references are optional.
- `staff_messages.source_message_id` is an optional self-reference.

## Relationships intentionally not guessed

- There is no dedicated parent signup or verification table with declared foreign keys. Signup-related values are fields on `parents` and the parent/student link tables.
- `sections`, `school_year_config`, and `class_sessions` have no declared foreign keys to the related entities shown in the application.
- `student_reports`, the role-specific announcement/read tables, `parent_announcement_notifications`, audit records, deletion records, contact messages, login guards, and report OTPs contain values that look like identifiers but have no declared FK. They are therefore unconnected in the diagrams.
