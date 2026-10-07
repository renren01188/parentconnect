# PARENTCONNECT Chen ERD exports

This folder contains six clean, print-ready Chen-notation ERDs. Each PNG is 3000 × 2000 pixels in landscape orientation.

## Data source and notation

- Database facts were checked against the connected Supabase schema: 43 public tables and 27 declared foreign-key constraints.
- Graphify was used to cross-check the application's table domains; declared Supabase constraints are the source of the relationship lines.
- Rectangle = entity; double rectangle = weak entity; diamond = relationship; double diamond = identifying relationship; oval = attribute.
- Underlined `PK` ovals are primary keys. Green `FK` ovals are foreign keys. Endpoint labels show cardinality/optionality; double lines show total participation.
- The legend includes double and dashed ovals for Chen completeness. The live schema has no declared multivalued or derived attributes, so those symbols are not used as schema fields.

## Files and scope

1. `01-Complete-System-Overview.png` — important system entities and the main enforced relationships.
2. `02-Students-Parents-Family-and-Links.png` — students, parents, `student_family_members`, excuse letters, associative parent-student links, and standalone sections.
3. `03-User-Accounts-Roles-Signup-and-Verification.png` — parent and staff accounts, assignment/change workflows, and the available signup-status fields.
4. `04-RFID-Attendance-Sections-and-School-Year.png` — RFID fields on students, attendance logs, SMS jobs, read receipts, and standalone class configuration.
5. `05-Reports-Messages-Guidance-Principal-and-Notifications.png` — reports, messages, guidance tickets, adviser/principal escalation, and related accounts.
6. `06-Audit-Security-Announcements-and-Scheduled-Tasks.png` — audit/security records, resets, announcements, notification reads, and scheduled/deletion tasks.

## Schema details deliberately shown as separate/standalone

- There is no separate parent-signup or verification table. Parent signup state is stored on `parents` (for example, `status` and `password_set`).
- `sections`, `class_sessions`, and `school_year_config` have no declared foreign keys.
- `student_reports` has no declared foreign key.
- Several role-specific announcement/read, audit, security, and scheduled-task tables also have no declared foreign keys; they are retained as standalone entities rather than connected by guesses.
- Both `parents.student_id` and the associative `parent_student_links` table are real foreign-key structures and are represented as distinct relationships.
- `parent_family_members` was removed from the live schema and is intentionally absent from the Student, Parent, and Family diagram.

No application code or database schema was modified. PNG is the available export format in this workspace; no installed vector/PDF renderer was available for optional SVG/PDF companions.
