# PARENTCONNECT: logical relationships not enforced by foreign keys

This list is intentionally separate from the DBML `Ref` statements. These associations were found through live column metadata and Graphify’s application-structure inspection, but they are **not** Supabase foreign-key constraints. They should be verified against business rules before any migration is considered.

## Likely single-table associations

| Source field | Likely target | Reason / caution |
|---|---|---|
| `adviser_announcements.adviser_id` | `advisers.id` | Name indicates adviser ownership; `bigint` vs target `integer`. |
| `adviser_change_requests.adviser_id` | `advisers.id` | Name indicates requested adviser; no FK. |
| `adviser_change_requests.reviewed_by_ict_id`, `adviser_assignment_history.approved_by_ict_id`, `scheduled_deletions.approved_by_ict_id` | `ict_admins.id` | Role-specific ID fields; first two have integer/bigint differences. |
| `adviser_notifications.adviser_id`, `adviser_notification_reads.adviser_id` | `advisers.id` | Adviser-specific notification records; no FK and bigint/integer mismatch. |
| `adviser_principal_messages.adviser_id` | `advisers.id` | Sender role is adviser; no FK and bigint/integer mismatch. |
| `guidance_announcements.guidance_id`, `guidance_notification_reads.guidance_id` | `guidance_counselors.id` | Guidance-specific records; notification read ID type differs. |
| `ict_announcements.sender_id`, `ict_notification_reads.ict_id` | `ict_admins.id` | ICT-specific records; no FK. |
| `principal_announcements.sender_id` | `principals.id` | Likely principal owner, but the source field is `text`, so it cannot safely be mapped as a key. |
| `excuse_letters.parent_id` | `parents.id` | Parent-submitted letter association; no FK. |
| `parent_adviser_reports.parent_id` | `parents.id` | Parent report association; bigint/integer mismatch. |
| `parent_adviser_reports.adviser_id` | `advisers.id` | Adviser report association; bigint/integer mismatch. |
| `parent_adviser_reports.student_id`, `parent_report_guidance_tickets.student_id`, `student_reports.student_id` | `students.student_id` | Student business ID fields; no FK. |
| `student_reports.student_db_id` | `students.id` | Likely numeric student ID but bigint/integer mismatch. |
| `student_reports.adviser_id` | `advisers.id` | Likely report creator/owner; bigint/integer mismatch. |

## Polymorphic or non-relational references

These fields cannot be rendered as a single safe DBML `Ref` because their destination depends on another field, record type, or application convention.

| Source field(s) | Interpretation |
|---|---|
| `announcements.sender_id`, `staff_messages.sender_id`, `staff_messages.recipient_id`, `principal_staff_messages.recipient_id` | Role-dependent actor/recipient IDs. The table does not declare one fixed target account table. |
| `parent_announcement_notifications.(source, announcement_id, parent_id, student_id)` | `source` selects an announcement family; therefore `announcement_id` is polymorphic. `parent_id` and `student_id` are also not constrained. |
| `audit_log.performed_by_id`, `target_id`, `related_*` | Audit links are polymorphic by action/target type and stored as text. |
| `scheduled_deletions.target_id`, `requested_by_id` | `target_type` and `requested_by_role` determine the target table. |
| `deletion_email_jobs.scheduled_deletion_ids` | Array of IDs rather than a scalar FK; likely relates to `scheduled_deletions.id`. |
| `attendance_logs.student_id` | A non-constrained duplicate business identifier; the enforced relationship is `student_db_id → students.id`. |
| `*_notification_reads.notif_key` | Notification key rather than a declared FK. Only `adviser_notifications.notif_key` is unique, but its relationship to read tables is not constrained and is not uniformly typed by role. |

## Tables with no declared foreign-key relationship

The following tables have neither inbound nor outbound declared foreign keys. They are retained in the DBML, but no relationship line is drawn because doing so would fabricate a database constraint:

- `adviser_announcements`, `adviser_notification_reads`, `audit_log`, `class_sessions`, `contact_us_messages`, `deletion_email_jobs`, `guidance_announcements`, `guidance_notification_reads`, `ict_announcements`, `ict_notification_reads`, `login_attempt_guards`, `parent_announcement_notifications`, `principal_announcements`, `scheduled_deletions`, `school_year_config`, `sections`, `student_reports`, and `subject_teacher_report_otps`.

Some are independently managed configuration, queue, security, or contact tables; others carry logical IDs described above. Their lack of a DBML relationship line is deliberate and faithful to the live schema.
