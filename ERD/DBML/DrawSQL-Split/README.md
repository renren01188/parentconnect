# DrawSQL split imports — PARENTCONNECT

DrawSQL’s current plan imports at most 15 tables at a time. Import these files **one at a time into separate DrawSQL diagrams**. Do not merge the files into one diagram: some account tables are repeated intentionally as context so that each diagram can show its real foreign-key lines.

| Import file | Tables | Declared relationship lines | Purpose |
|---|---:|---:|---|
| `01-students-and-attendance.dbml` | 11 | 10 | Students, parents, family records, attendance, RFID-related data, and class configuration. |
| `02-accounts-and-staff-workflows.dbml` | 11 | 10 | Adviser/guidance/principal/ICT accounts, change workflows, and staff messaging. |
| `03-parent-reports-and-guidance.dbml` | 7 | 5 | Parent reports, report messages, guidance tickets, and their account context. |
| `04-announcements-and-notifications.dbml` | 12 | 2 | Announcement and notification tables, with the applicable account context. |
| `05-audit-security-and-jobs.dbml` | 8 | 1 | Audit, login security, password reset, deletion jobs, and contact messages. |

Every one of the 43 live `public` tables appears in at least one import. The 27 declared Supabase foreign keys are represented within the split set; `principal_notification_reads → principals` appears in two relevant diagrams on purpose.

For the exact tables, relationship lines, cross-project foreign keys, and standalone-table explanation, read [`DRAWSQL-HANDOFF.md`](DRAWSQL-HANDOFF.md).

## How to import

1. In DrawSQL, create a new diagram.
2. Choose **Import schema** and paste or upload one `.dbml` file.
3. Click **Done**, arrange that diagram if desired, then repeat with the next file in a new diagram.

Because each DBML contains only `Ref` lines whose source and target are both included, DrawSQL should not display the earlier “Skipped relationships to tables that weren’t imported” warning. Fields that point logically to other modules but have no declared Supabase foreign key remain documented in the parent [`LOGICAL-RELATIONSHIPS.md`](../LOGICAL-RELATIONSHIPS.md) file rather than being invented as relationship lines.

No application code or Supabase schema/data was modified.
