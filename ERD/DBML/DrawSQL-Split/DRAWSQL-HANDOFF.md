# PARENTCONNECT — DrawSQL project handoff

This is a relationship-preserving split of the live Supabase `public` schema for DrawSQL’s 15-table project limit. The schema contains **43 tables**, **536 columns**, and **27 declared foreign keys**. Every table occurs in at least one import. A small number of shared account tables are intentionally repeated so that the real foreign-key lines can be drawn within a project.

Import each DBML file into a **separate DrawSQL project**. Every file is independently importable: it has 15 or fewer tables and no `Ref` line points to a missing table.

## 1. Students, Parents, Academic Setup, and Attendance

Import: [`01-students-and-attendance.dbml`](01-students-and-attendance.dbml) — **11 tables**

Tables:

- `students`
- `parents`
- `student_family_members`
- `parent_student_links`
- `excuse_letters`
- `sections`
- `class_sessions`
- `school_year_config`
- `attendance_logs`
- `attendance_sms_jobs`
- `parent_attendance_notification_reads`

Declared relationship lines shown:

- `parents.student_id → students.student_id`
- `student_family_members.student_db_id → students.id`
- `parent_student_links.parent_id → parents.id`
- `parent_student_links.student_id → students.student_id`
- `excuse_letters.student_id → students.student_id`
- `attendance_logs.student_db_id → students.id`
- `attendance_sms_jobs.attendance_log_id → attendance_logs.id` (unique FK)
- `attendance_sms_jobs.parent_id → parents.id`
- `parent_attendance_notification_reads.parent_id → parents.id`
- `parent_attendance_notification_reads.attendance_log_id → attendance_logs.id`

## 2. Staff Accounts, Change Workflows, and Staff Messaging

Import: [`02-accounts-and-staff-workflows.dbml`](02-accounts-and-staff-workflows.dbml) — **11 tables**

Tables:

- `advisers`
- `guidance_counselors`
- `principals`
- `ict_admins`
- `adviser_change_requests`
- `adviser_assignment_history`
- `guidance_change_requests`
- `adviser_principal_messages`
- `principal_staff_messages`
- `staff_messages`
- `principal_notification_reads`

Declared relationship lines shown:

- `adviser_assignment_history.adviser_id → advisers.id`
- `adviser_assignment_history.request_id → adviser_change_requests.id`
- `guidance_change_requests.guidance_id → guidance_counselors.id`
- `guidance_change_requests.reviewed_by_ict_id → ict_admins.id`
- `adviser_principal_messages.principal_id → principals.id`
- `adviser_principal_messages.source_staff_message_id → principal_staff_messages.id`
- `principal_staff_messages.principal_id → principals.id`
- `principal_staff_messages.source_adviser_message_id → adviser_principal_messages.id`
- `staff_messages.source_message_id → staff_messages.id`
- `principal_notification_reads.principal_id → principals.id`

## 3. Parent Reports, Messages, and Guidance Tickets

Import: [`03-parent-reports-and-guidance.dbml`](03-parent-reports-and-guidance.dbml) — **7 tables**

Tables:

- `parents` *(shared context)*
- `advisers` *(shared context)*
- `guidance_counselors` *(shared context)*
- `parent_adviser_reports`
- `parent_adviser_report_messages`
- `parent_report_guidance_tickets`
- `student_reports`

Declared relationship lines shown:

- `parent_adviser_report_messages.report_id → parent_adviser_reports.id`
- `parent_report_guidance_tickets.report_id → parent_adviser_reports.id` (unique FK)
- `parent_report_guidance_tickets.parent_id → parents.id`
- `parent_report_guidance_tickets.adviser_id → advisers.id`
- `parent_report_guidance_tickets.assigned_guidance_id → guidance_counselors.id`

## 4. Announcements and Notification Records

Import: [`04-announcements-and-notifications.dbml`](04-announcements-and-notifications.dbml) — **12 tables**

Tables:

- `announcements`
- `adviser_notifications`
- `adviser_notification_reads`
- `adviser_announcements`
- `guidance_announcements`
- `guidance_notification_reads`
- `ict_announcements`
- `ict_notification_reads`
- `principal_announcements`
- `principal_notification_reads`
- `parent_announcement_notifications`
- `principals` *(shared context)*

Declared relationship lines shown:

- `adviser_notifications.announcement_id → announcements.id`
- `principal_notification_reads.principal_id → principals.id`

## 5. Audit Trail, Security, Password Reset, and Background Jobs

Import: [`05-audit-security-and-jobs.dbml`](05-audit-security-and-jobs.dbml) — **8 tables**

Tables:

- `audit_log`
- `login_attempt_guards`
- `parent_password_reset_otps`
- `subject_teacher_report_otps`
- `scheduled_deletions`
- `deletion_email_jobs`
- `contact_us_messages`
- `parents` *(shared context)*

Declared relationship line shown:

- `parent_password_reset_otps.parent_id → parents.id` (PK/FK, one-to-one)

## Declared relationships between primary module groups

The following database-enforced relationships cross the primary ownership of the modules. They are shown in full within the project that repeats the needed shared table.

| Cross-group relation | Visible in DrawSQL project |
|---|---|
| `parent_report_guidance_tickets.parent_id → parents.id` | Project 3 — `parents` is repeated from Project 1. |
| `parent_report_guidance_tickets.adviser_id → advisers.id` | Project 3 — `advisers` is repeated from Project 2. |
| `parent_report_guidance_tickets.assigned_guidance_id → guidance_counselors.id` | Project 3 — `guidance_counselors` is repeated from Project 2. |
| `principal_notification_reads.principal_id → principals.id` | Project 4 — `principals` is repeated from Project 2. |
| `parent_password_reset_otps.parent_id → parents.id` | Project 5 — `parents` is repeated from Project 1. |

## Standalone tables with no declared foreign key

These tables have no inbound or outbound Supabase foreign key. They remain included because they are real database tables; no line is drawn merely from a similarly named field.

| Category | Tables | Why no relationship line is drawn |
|---|---|---|
| Academic configuration | `sections`, `class_sessions`, `school_year_config` | They are independent configuration records; other tables store related values as ordinary text rather than declared FKs. |
| Announcement/notification records | `adviser_announcements`, `adviser_notification_reads`, `guidance_announcements`, `guidance_notification_reads`, `ict_announcements`, `ict_notification_reads`, `principal_announcements`, `parent_announcement_notifications` | They use role-specific IDs, notification keys, or polymorphic `source` fields without declared constraints. |
| Audit, security, queues, and contact | `audit_log`, `login_attempt_guards`, `contact_us_messages`, `deletion_email_jobs`, `scheduled_deletions`, `subject_teacher_report_otps` | They use hashes, free-form/polymorphic IDs, arrays, or external identity values rather than scalar FKs. |
| Student reporting | `student_reports` | It stores student/adviser identifiers but declares no FK. |

For the exact logical-only fields and their likely targets, see [`../LOGICAL-RELATIONSHIPS.md`](../LOGICAL-RELATIONSHIPS.md). They are deliberately not represented as DBML `Ref` statements.

## Indexes and keys

Each DBML file retains the exact field names, column types, primary keys, unique constraints, and composite unique indexes from the live schema. Foreign-key fields have an inline `FK → …` comment and a DBML `Ref` when both tables occur in the same DrawSQL project.

No application code, data, migrations, or Supabase schema was changed. Supabase MCP supplied the database facts. Graphify was queried for application context but has no database schema indexed, so it was not used as the source of truth for constraints.
