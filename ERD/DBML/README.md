# PARENTCONNECT public-schema DBML

Use [`parentconnect-public-schema.dbml`](parentconnect-public-schema.dbml) as the source for dbdiagram.io. It includes all 43 live `public` tables and all 536 live columns, plus every declared primary key, unique constraint, and foreign key, organized with `TableGroup`s by module.

## Relationship and cardinality convention

- `>` is a declared many-to-one foreign key. Nullable source fields may have zero target records; DBML does not draw nullability as a separate cardinality marker.
- `-` is used for the two declared unique foreign keys: `attendance_sms_jobs.attendance_log_id` and `parent_report_guidance_tickets.report_id`, plus the PK/FK `parent_password_reset_otps.parent_id`.
- The associative table `parent_student_links` creates the declared parent/student mapping through two many-to-one foreign keys, with a unique `(parent_id, student_id)` pair.
- No `Ref` is created for an application-level ID unless it is a real Supabase foreign key. See [`LOGICAL-RELATIONSHIPS.md`](LOGICAL-RELATIONSHIPS.md) for those candidate links.

## RLS note

RLS is enabled on all 43 public tables. Ten tables currently have visible policies, all granting `ALL` to `service_role` with `USING true` and `WITH CHECK true`:

- `attendance_logs`, `excuse_letters`, `parent_adviser_report_messages`, `parent_adviser_reports`, `parent_attendance_notification_reads`, `parent_report_guidance_tickets`, `parent_student_links`, and `parents` use `parent_dashboard_service_role_only`.
- `guidance_announcements` uses `Service role full access`.
- `parent_announcement_notifications` has both `Service role full access` and `parent_dashboard_service_role_only`.

Policies are access controls, not ERD relationships, so they are documented here rather than drawn as relationship lines.

The schema was inspected with Supabase MCP; Graphify was used to cross-check application domains and locate logical-only associations. No database change, migration, or generated SQL was executed.
