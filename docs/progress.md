# ParentConnect progress

## Snapshot — 2026-11-09

This is a source-tree snapshot, not a release checklist. It records verified
paths and working-tree state only; feature behavior is not considered verified
unless a named check has been run and recorded below.

### Offline local Supabase bootstrap

- **Complete in source:** `supabase/migrations/20261111120000_remote_schema_baseline.sql`
  is a schema-only export of the deployed project, allowing a new Docker-based
  local Supabase instance to start even though the hosted project predates
  tracked migration history. Historical incremental SQL remains intact under
  `supabase/legacy-migrations/`; it is reference material and is not replayed
  by the local CLI. Migration-source regression checks read that archive.
- **Local safety:** `supabase/seed.sql` is deliberately empty, so a reset does
  not copy deployed student, parent, attendance, or other school records. The
  local Auth URLs now target the application's `localhost:3001` development
  port.
- **Deployment boundary:** Do not run `supabase db push --remote` with this
  baseline until the deployed migration history is deliberately reviewed and
  recorded; the baseline already represents its current schema.
- **Verified:** `npx.cmd supabase db reset --local` rebuilt the Docker database,
  applied the baseline, ran the seed, and restarted services on 2026-11-11.
  The section-rename, guardian-password-reset, and ICT bulk-deletion checks
  passed; all archived migration references resolve and `git diff --check`
  passed. Twenty-five archive-reading regression checks passed. Four unrelated
  source-expectation checks remain stale: calendar schedule expects
  `isScheduledAttendanceDate` after its route adopted
  `attendanceReportDaysForMonth`; parent enrollment expects the former OTP
  redirect; adviser announcement scheduling expects former copy; and SF2
  remarks expects the prior monthly-query text.

### ICT Manage Class Sessions rename repair

- **Complete in source:** the production rename failure was traced to PostgreSQL
  `42702` (ambiguous `grade`) inside `rename_section`. The forward migration
  `20261111103000_fix_section_rename_column_ambiguity.sql` qualifies every
  table reference while preserving the existing server-only function boundary,
  in-place rename, and related-label synchronization.
- **Affected files:** the new migration, the ICT section-rename regression
  check, and the class-session architecture note.
- **Verified:** `npm.cmd run test:ict-section-rename`, focused ESLint,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-11.
  The migration still needs to be applied through the normal deployment path
  before the affected production batch can be retried.

### Adviser Class Session card section lookup

- **Complete in source:** The Adviser Attendance Class Session card now reads
  the active assigned section's saved Morning/Afternoon assignment through the
  protected class-session lookup and renders only that grade/session schedule.
  It shows the saved start, end, Late After, and Absent After values; an older
  section request cannot overwrite a newer selection or Check Schedule refresh.
  Scanner behavior is unchanged.
- **Affected files:** the class-session route, Adviser Attendance card,
  grade/session schedule regression check, and attendance architecture note.
- **Verified:** a read-only database query on 2026-11-12 confirmed Grade 1
  Morning1 is Morning (06:00–12:00, late 07:00, absent 13:00) and Afternoon1
  is Afternoon (13:00–17:00, late 14:00, absent 18:00). Focused source checks,
  TypeScript, and whitespace validation passed on 2026-11-12. Focused lint
  passed with four existing unused-symbol warnings in the Adviser Attendance
  page; authenticated browser verification remains unrecorded.

### Audit Trail archive-scoped summaries and export-date validation

- **Complete in source:** ICT and Principal Audit Trail responses now return
  role-authorized totals for all four summary cards separately from the
  filtered, paged table count. The cards cover the whole selected **Recent** or
  **Archived** tab, and Refresh reloads both in the same request; search, date,
  module, status, and pagination leave the cards unchanged.
- **Summary-card filtering:** All four cards are keyboard-accessible filters in
  both role views. Total Events clears the action filter; Login Events, Edit
  Actions, and Security Alerts apply the shared categories that exactly match
  their server-side totals and reset the table to page one.
- **Export boundary:** The shared modal caps its native date calendar at the
  current `Asia/Manila` date, immediately explains a manually entered future
  date, and disables **Export PDF**. Both protected PDF routes reject direct
  future-date requests with the same message.
- **Affected files:** the ICT and Principal Audit Trail routes/pages,
  `AuditExportModal.tsx`, audit classification/date helpers, and the existing
  focused audit regression checks.
- **Verified:** Supabase read-only inspection found 1,459 audit records, more
  than the default eight-row page. `npm.cmd run test:audit-trail`,
  `npm.cmd run test:audit-trail-export`, `npx.cmd tsc --noEmit`, and
  `npm.cmd run build` passed on 2026-11-11. The expanded
  `npm.cmd run test:audit-trail`, `npx.cmd tsc --noEmit`, focused page lint,
  and whitespace validation passed on 2026-11-12; authenticated browser
  verification remains unrecorded.

### Adviser and Guidance concern-view agreement

- **Complete in source:** Locked Adviser Parent and Student/Subject Teacher
  concerns, and locked Guidance Parent concerns, now show the required Terms
  and Agreement notice above **See the Concern**. The button stays disabled
  until its concern-specific checkbox is checked and resets when another
  concern is selected. The existing detail-view handler remains separate from
  escalation.
- **Affected files:** both report pages, the shared
  `ConcernViewAgreement` component, and
  `scripts/test-report-concern-view-agreement.cjs`.
- **Verified:** `npm.cmd run test:report-concern-view-agreement`,
  `npx.cmd tsc --noEmit`, and `npm.cmd run build` passed on 2026-11-11.
  Browser-role verification remains unrecorded because this checkout has no
  authenticated test session.

### Account-specific Contact ICT delivery

- **Complete in source:** Adviser, Guidance, and Principal Contact ICT
  dropdowns retain the selected `ict:<account-id>` value through their existing
  sends. The shared ICT-recipient helper lists active, non-archived accounts
  and re-validates that exact account before a new message or reply is stored.
- **Inbox isolation:** The ICT Inbox and its unread summary use the signed-in
  ICT account ID in their server-side `staff_messages` filters. Direct
  conversation reads, typing, and replies retain the existing saved-participant
  check, so another ICT account cannot open or act on the thread.
- **Affected files:** the three Contact ICT APIs,
  `src/lib/ictMessageRecipients.ts`, the Contact ICT regression check, and the
  messaging architecture note.
- **Verified:** `npm.cmd run test:contact-ict-realtime`, focused ESLint, and
  `npx.cmd tsc --noEmit` passed on 2026-11-11. Supabase read-only inspection
  found two active, non-archived ICT accounts. The requested six browser sends
  plus refresh/reply checks require test-account credentials; no browser test
  session was available in this checkout.

### ICT Adviser and Guidance bulk deletion safeguards

- **Complete in source:** The ICT bulk-deletion modal now receives its compact,
  unpaginated Adviser and Guidance candidate lists from the protected User
  Management API. Selecting either role is no longer limited to the current
  directory page.
- **Server boundary:** `/api/scheduled-deletions` now verifies every selected
  Adviser/Guidance (and any supported ICT) account against its role table,
  rejects archived, stale, or already-scheduled targets, and ignores
  browser-supplied staff names and email addresses. Scheduled staff accounts
  use the existing account-archive email; the Parent-only suspension and
  in-app notice behavior remains unchanged.
- **Schema:** added
  `20261111100000_enforce_one_active_scheduled_deletion_per_target.sql`. It
  blocks deployment rather than silently changing history if duplicate active
  deletion requests already exist, then enforces one Pending ICT/Scheduled
  request per target to close concurrent-request races.
- **Affected files:** ICT User Management API/modal/page, scheduled-deletion
  route, focused bulk-deletion regression check, the migration, and the
  scheduled-deletion architecture note.
- **Verified:** `npm.cmd run test:ict-section-bulk-deletion` and
  `npx.cmd tsc --noEmit` passed on 2026-11-11. Focused lint found no issue in
  the changed modal or scheduled-deletion route, but stops at 22 pre-existing
  `no-explicit-any` errors and seven unused-value warnings in ICT User
  Management's existing page/API code. Remote migration application and a
  browser smoke test with multiple Adviser/Guidance candidates remain
  unverified.

### Manual Grade 1 database cleanup SQL

- **Prepared only:** `supabase/manual-sql/20261111_permanently_delete_grade_1.sql`
  is a copy-and-run Supabase SQL Editor script, not a migration. It validates
  that selected Parents and scheduled-deletion requests are exclusive to Grade
  1, hard-deletes the Grade 1 scope in one transaction, removes both report
  conversations and standalone staff-to-Parent threads for those Parents, and
  restores the two database hard-delete triggers before committing.
- **Not run from source:** an authorized database owner must execute it in the
  Supabase SQL Editor. It intentionally leaves global audit-trail data intact
  because that data is not safely Grade-scoped.

### Parent New Report student selector layout

- **Complete in source:** The linked-student selector is now an anchored
  overlay with its own viewport-safe scroll area. Opening it no longer adds
  height to, resizes, or recenters the New Report modal.
- **Affected files:** `src/app/dashboard/parent/reports/page.tsx` and the
  Reports and messages architecture note.
- **Verified:** `npm.cmd run test:parent-report-student-selector-layout`,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-11.
  The configured `test:parent-report-list-filters` script is missing from the
  checkout, and `test:student-concern-parent-reports` has a stale assertion for
  a prior report-list implementation; neither failure is caused by this layout
  change.

### Adviser SF1 import link-status presentation

- **Complete in source:** The Import Registration preview now collapses
  existing learners into **Already Registered Students: View (count)**. Its
  five-record pages show the current learner name, LRN, and section in a
  responsive card grid. Existing records are filtered from the detailed
  preview, submitted row payload, and **Import X Students** count rather than
  blocking the remaining new learners.
- **Complete in source:** Parent-link review now omits unmatched learners and
  shows only active exact or ambiguous account candidates. Exact matches state
  **Will be linked to [Parent Name] when imported** unless the relationship is
  already recorded; ambiguous matches retain the account selector. Shared
  Parent accounts remain supported for multiple students.
- **Affected files:** `ImportRegistrationModal.tsx`, `/api/students/import`,
  `scripts/test-adviser-import-registration-presentation.cjs`, and the
  student-registration architecture note.
- **Verified:** `npm.cmd run test:adviser-import-registration-presentation`
  (including a 12-duplicate-record pagination fixture),
  `npm.cmd run test:parent-multi-student-signup`, focused ESLint,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-11.
  Browser verification with a safe adviser import fixture is not yet recorded.

### Role sidebar badge contrast

- **Complete in source:** The numeric sidebar badges retain their existing
  count, placement, dimensions, and dismissal behavior. Their colors now use
  Parent indigo, Adviser emerald, ICT green, Principal purple, and Guidance
  sky backgrounds with dark matching numerals for contrast on both active and
  inactive sidebar entries. The role sidebars use fixed dark gradients, so
  these colors remain the same under the application's global dark preference.
- **Affected files:** the five role-local `components/Sidebar.tsx` files.
- **Verified:** `npx.cmd tsc --noEmit`, focused lint for Parent/Adviser/
  Principal/Guidance sidebars, and `git diff --check` passed on 2026-11-11.
  Focused lint reaches one existing ICT Sidebar effect warning outside the
  badge renderer. `test:sidebar-badge-dismissal` is independently blocked by
  a stale Adviser Contact ICT assertion; neither issue was changed here.

### Subject Teacher reports use Student Reports first

- **Complete in source:** `/report/subject-teacher` now saves a verified
  submission to the assigned Adviser's `student_reports` queue instead of
  immediately creating a Parent Report. A missing, inactive, or pre-signup
  Parent no longer affects submission. The Adviser can later use the existing
  **Notify Parent** action after a completed Parent account is linked.
- **Privacy:** the Adviser sees the named Subject Teacher in Student Reports.
  A later forwarded Parent Report keeps that identity for authorised
  Adviser/Guidance/Principal readers, while Parent report and notification
  views use anonymous School staff wording.
- **Schema:** added
  `20261110130000_route_subject_teacher_reports_to_student_reports.sql` for
  source metadata, idempotent retries, selected categories, and the existing
  two-per-Manila-day Subject Teacher limit. Supabase MCP schema inspection on
  2026-11-10 confirmed the live table needs these columns; its SQL connection
  is read-only and therefore could not apply the migration. It remains
  **pending remote deployment** through the normal migration workflow or SQL
  Editor.
- **Affected files:** Subject Teacher submission and Student Report forwarding
  APIs, Parent notification mapping, Adviser Student Reports UI/type mapping,
  related focused scripts, and the migration above.
- **Verified:** `test:subject-teacher-report-parent-availability`,
  `test:subject-teacher-report-security`,
  `test:subject-teacher-report-categories`,
  `test:subject-teacher-reporter-privacy`,
  `test:student-report-submission`, `test:student-concern-parent-reports`,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-10.
  Browser and remote-database verification remain **unverified** until the
  migration is applied and a real Subject Teacher submission is tested.

### Public Student Report privacy notice

- **Complete in source:** `/report` now labels its required confirmation as
  **Reporting Guidelines and Privacy Notice**. Its existing scroll-to-enable
  acknowledgement modal contains the Student Report accuracy, data-use,
  audit-security, confidentiality, responsible-use, and immediate-danger
  guidance, followed by **Acknowledge and Continue**. The existing CAPTCHA and
  report-submission behavior are unchanged.
- **Affected files:** `src/app/report/page.tsx`,
  `scripts/test-student-report-submission.cjs`, and the reports architecture
  note.
- **Verified:** `npm.cmd run test:student-report-submission`,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-10. Browser
  visual verification remains unverified.

### Adviser Subject Teacher report panels and Parent eligibility

- **Complete in source:** the Adviser navigation label is now **Student &
  Subject Teacher Reports**. A Subject Teacher report shows the teacher's
  name in its first panel and at the top of panel two; the
  panel-two report card and detail header identify the associated learner as
  `Student: Name`, followed by the submitter attribution. The message-detail
  breadcrumb no longer repeats the Subject Teacher title. Adviser-only mapping
  also supports older reports whose teacher name exists only in a
  `[Subject Teacher Report] Name` title.
- **Parent forwarding:** Notify Parent now accepts a completed active Parent
  attached to the exact student through either `parent_student_links` or the
  legacy `parents.student_id` association. The same eligibility calculation
  drives the modal, so it no longer incorrectly disables a valid legacy-linked
  Parent. It does not allow a Parent associated with another student. A blank
  email address no longer blocks delivery in Parent Reports; only the
  supplemental email alert is skipped.
- **Affected files:** Adviser reports UI, Student Reports mapper/list route,
  Notify Parent route, and the focused Student Report/Subject Teacher scripts.
- **Verified:** `node scripts/test-student-report-parent-link.cjs`,
  `node scripts/test-subject-teacher-reporter-privacy.cjs`,
  `node scripts/test-subject-teacher-report-categories.cjs`,
  `npx.cmd tsc --noEmit`, focused ESLint, and `git diff --check` passed on
  2026-11-10. Browser verification is still **unverified**.

### Report message-detail Back controls

- **Complete in source:** Adviser, Guidance, and Principal report/message
  detail headers no longer repeat the selected report title. Desktop detail
  headers omit **Back**, while narrow screens show an icon-only Back control;
  the separate report-list panel controls remain unchanged. Subject Teacher
  Notify Parent drafts now use the submitted description and generic school
  staff wording instead of the teacher-name report title.
- **Verified:** `npm.cmd run test:subject-teacher-reporter-privacy` and
  `npx.cmd tsc --noEmit` passed on 2026-11-10. Browser viewport verification
  remains **unverified**.

### Live report-category filters

- **Complete in source:** Parent, Adviser, Guidance, and Principal category
  filters now recalculate option names and counts from the active report
  tab/status scope. A category removed by a status change or live refresh
  resets safely to **All**.
- **Verified:** `npm.cmd run test:report-category-filter-freshness` and
  `npx.cmd tsc --noEmit` passed on 2026-11-10. Browser verification remains
  **unverified**.

### Documentation task

- **Complete:** added `docs/architecture.md` and this file; updated `AGENTS.md`
  with targeted-search and documentation-maintenance guidance.
- **Behavior impact:** none. No application code, migrations, database records,
  or secrets were changed.

### Public header school branding

- **Complete:** The landing hero and shared login header used by all user roles
  now use the Contact Us-style Santiago Elementary School seal immediately to
  the left of the school name. Their public navigation remains unchanged, but
  the lower right-side DepEd and Santiago institutional marks are hidden. The
  About page's ParentConnect introduction now uses
  the same, larger standalone ParentConnect logo as the browser tab instead of
  the generic school icon and navy icon tile. The logo is statically bound to
  the app's icon file so it cannot resolve to the school seal. Its
  school-information card now displays the official Santiago Elementary School
  seal instead of a graduation cap. The About and Contact heroes, plus the
  public Student and Subject Teacher report shells, intentionally hide the
  separate lower-right DepEd and Santiago institutional marks. The landing,
  all login journeys, About, and Contact now use the same local school-banner
  image.
- **Affected files:** `src/components/HeroSection.tsx`,
  `src/components/LoginLandingHeader.tsx`,
  `scripts/test-public-header-branding.cjs`, and `package.json`.
- **Verified:** `npm.cmd run test:public-header-branding`,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-10. Browser
  layout verification remains unverified.

### Contact Us required fields

- **Complete:** The public Contact Us form now visibly marks Name, Email,
  Subject, and Message with an accessible red `*` and screen-reader-required
  text. Its disabled Send action now lists the exact outstanding fields and
  CAPTCHA verification on hover or keyboard focus. Existing browser and server
  validation continue to require valid values before delivery.
- **Affected files:** `src/app/contact-us/page.tsx`,
  `scripts/test-contact-us-required-fields.cjs`, and `package.json`.
- **Verified:** `npm.cmd run test:contact-us-required-fields`,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-10.
  Browser hover and keyboard-focus verification remains unverified.

### Legacy deletion-email queue retirement

- **Complete in source:** removed the unused deletion-email status endpoint
  and added a migration that removes the empty `deletion_email_job_items` and
  `deletion_email_jobs` tables. The migration stops instead of discarding data
  if either table contains a row. The active scheduled-deletion, requester,
  target, and Parent in-app notification tables are unchanged.
- **Affected files:** the retired `/api/deletion-email-jobs` route,
  `20261110120000_remove_legacy_deletion_email_tables.sql`, and
  `scripts/test-legacy-deletion-email-retirement.cjs`.
- **Verified:** `npm.cmd run test:legacy-deletion-email-retirement`, focused
  ESLint, `npx.cmd tsc --noEmit`, and `git diff --check` passed on
  2026-11-10. The full repository lint remains blocked by pre-existing errors
  outside this change. Remote application is pending: the available Supabase
  connection accepts read-only SQL and this workspace is not CLI-linked.

### Adviser RFID replacement roster freshness

- **Complete in source:** the Adviser attendance Register RFID modal now
  ignores delayed roster responses that began before a confirmed RFID
  replacement. The API-confirmed new UID therefore remains visible instead of
  being overwritten by the prior card value.
- **Affected files:** `dashboard/adviser/attendance/page.tsx` and
  `scripts/test-adviser-rfid-registration.cjs`.
- **Verified:** `npm.cmd run test:adviser-rfid-registration`, focused ESLint,
  `npx.cmd tsc --noEmit`, and `git diff --check` passed on 2026-11-10.
  Browser replacement with a second RFID card remains **unverified**.

### Adviser Rapid Tap queue visibility

- **Complete in source:** the RFID processing notice now waits for browser
  queue restoration and appears only while a scan is capturing, queued,
  saving, or retrying. Failed scans retain their existing Review/Retry actions
  in a separate attention notice, rather than being shown as a processing
  queue.
- **Affected files:** `dashboard/adviser/attendance/page.tsx`,
  `scripts/test-attendance-rapid-tap.cjs`, and the attendance architecture
  note.
- **Verified:** `npm.cmd run test:attendance-rapid-tap`, `npx.cmd tsc --noEmit`,
  and `git diff --check` passed on 2026-11-10. Browser RFID confirmation
  remains unverified.

### Parent attendance missing-Time-Out status

- **Complete in source:** an automatic Absent Time Out is now treated as a
  final attendance result rather than a physical checkout in Parent-facing
  data. Parent Attendance keeps the real Time In and no Time Out; the Parent
  dashboard no longer calls that learner RFID-verified or at school. It
  instead identifies the missing checkout and final Absent result.
- **Notifications:** the Parent receives an in-app Missing Time Out alert
  naming the check-in time. The Adviser absence notification adds the same
  per-student Time In detail when an automatic missing checkout caused the
  absence.
- **Affected files:** Parent history/dashboard and notification API, Adviser
  notification API, `scripts/test-parent-attendance-history.cjs`, and the
  attendance architecture notes.
- **Verified:** `npm.cmd run test:parent-attendance-history`,
  `npm.cmd run test:attendance-auto-absence`, `npx.cmd tsc --noEmit`, and
  `git diff --check` passed on 2026-11-10. The focused source lint reaches
  three existing `no-explicit-any` errors in the Parent dashboard, outside this
  change. Browser verification remains unverified.

### Student registration birth-date age calculation

- **Complete in source:** Adviser Add Student and ICT Create User's shared
  student-roster form require a birth date for a learner who is at least four
  completed years old. Age is read-only and automatically calculated from that
  date. `/api/students` independently enforces the age boundary and stores its
  own calculated age, ignoring a crafted submitted age value.
- **Affected files:** `StudentParentRegistration`, the student-create route,
  the student age/birth-date utilities, and their focused checks.
- **Verified:** `node scripts/test-student-birthdate-validation.cjs`,
  `node scripts/test-student-age-and-assignment.cjs`, `npx.cmd tsc --noEmit`,
  focused source ESLint, and `git diff --check` passed on 2026-11-10. The
  focused source lint reports three pre-existing warnings in the shared form;
  browser validation remains **unverified**.

### Post-signup verification-contact visibility

- **Complete in source:** Adviser Student View and Edit no longer display the
  recorded verification contact number once its linked Parent has completed
  password setup. ICT's Edit Parent Account modal now displays that field only
  for pre-signup records. The stored verification value remains available for
  the registration flow, and the active Parent contact remains visible.
- **Affected files:** the Adviser Student View, ICT User Management, and their
  focused source checks.
- **Verified:** `npm.cmd run test:ict-user-management-account-update`, direct
  source guard checks, `npx.cmd tsc --noEmit`, and `git diff --check` passed
  on 2026-11-10. `test:parent-enrollment` currently stops at its pre-existing
  assertion for the retired `/login/guardian/send-otp` redirect, before its
  visibility assertions run. Focused lint also reaches three pre-existing
  `no-explicit-any` errors in ICT User Management outside this change.

### ICT Edit Parent Account presentation

- **Complete in source:** the ICT Parent-edit modal now keeps its compact
  width, with a clear Account & Family / Linked Students panel switch instead
  of showing both areas side by side. It retains one scrollable content area,
  a persistent Cancel / Review Changes action bar, and compact responsive
  family-name grids. Its action-bar helper text is placed above a wrapping
  button row so Review Changes remains fully visible at compact widths. The
  existing save, validation, link-correction, and API behavior are unchanged.
  The Adviser-conflict modal calls its immediate action **Transfer Affective
  Immediately**, and related transfer validation messages use the same label.
  Its immediate-transfer confirmation and the Scheduled Adviser Transfers
  cancellation confirmation are now in-app, ICT-styled dialogs rather than
  browser prompts; they retain the existing transfer and cancellation checks.
Cancelling the Edit Adviser review or section-handover preview returns to the
saved grade/sections and remounts the section picker so chips, selected rows,
and its count reset together, while keeping unrelated profile draft fields. An
assignment is persisted only by the existing confirmed save or transfer action.
  The directory maps its headers from the active role filter: All Users uses
  **Class / Department** / **Students / Responsibilities**; Advisers uses
  **Class / Grade** / **Assignment**; ICT and Guidance use **Department** /
  **Responsibility**; and Parents & Students uses **Class / Grade** /
  **Student(s)**. A shared Guidance display label supplies **Student Support
  and Advising** to existing and newly created Guidance rows, including their
  lowercase responsibility text. Its grade/section selector derives from the
  full ICT-configured section catalog, retaining empty sections and a fallback
  for legacy student assignments.
- **Affected files:** `src/app/dashboard/ict/user-management/page.tsx`, its
  list API, `guidanceDisplayLabel`, Bulk Deletion display, focused regression
  check, and the ICT User Management architecture note.
- **Verified:** `npm.cmd run test:ict-user-management-account-update`,
  `npm.cmd run test:ict-parent-student-filters`, `npx.cmd tsc --noEmit`, and
  `git diff --check` passed on 2026-11-12. Browser
  visual verification at desktop and narrow mobile widths remains unverified.
  Focused lint reaches 22 existing `no-explicit-any` errors (19 in the User
  Management API and three in the page) plus seven existing unused-symbol
  warnings in the page; none are in the affected presentation, label, or
  confirmation code.

### ICT Profile Settings theme

- **Complete in source:** The ICT Profile Settings modal now uses the
  dashboard's dark-green accent palette for its profile tab and immediate-save
  notice instead of the former blue palette. Its controls, validation, and
  existing direct-save behavior are unchanged.
- **Affected files:** `src/app/dashboard/ict/profile/page.tsx`,
  `scripts/test-profile-save-flows.cjs`, and the profile-settings architecture
  note.
- **Verified:** `npm.cmd run test:profile-save-flows`, focused ICT Profile
  ESLint, and `npx.cmd tsc --noEmit` passed on 2026-11-11. Browser visual
  verification remains unverified.

### Parent profile save

- **Complete:** `dashboard/parent/profile` and `/api/parents/me` now treat
  the committed Parent row as the save-success boundary and apply its returned
  values to client state immediately. Follow-up synchronization, audit,
  report-snapshot, and realtime work cannot turn that completed write into a
  false server error. A failed session-token renewal retains the valid current
  session instead of rejecting the saved change.
- **Verified:** `npm.cmd run test:profile-save-flows`, `npx.cmd tsc --noEmit`,
  `npm.cmd run build`, and `git diff --check` passed on 2026-11-09. The focused
  check covers the immediate state update and the GET mapping used when Profile
  is reopened; no live Parent record was modified for this verification.

### ICT Attendance Notifications queue

- **Complete in source:** The SMS queue now reads the actual Parent name
  columns (`parent_first_name`, `parent_middle_name`, `parent_last_name`, and
  `parent_suffix`), rather than selecting nonexistent generic name columns.
  This prevents `/api/ict/attendance-sms-jobs` from returning the modal's
  **Could not load attendance SMS jobs** warning. The email queue endpoint uses
  the same correct mapping for consistency.
- **Presentation:** The Attendance Notifications modal retains its SMS delivery
  queue and no longer fetches or displays an Email delivery queue. Background
  attendance email delivery remains unchanged.
- **Affected files:** the ICT attendance SMS/email job routes, ICT Student
  Profiles modal, focused attendance queue checks, and the attendance
  architecture note.
- **Verified:** `npm.cmd run test:ict-attendance-sms-delivery-queue`,
  `npm.cmd run test:attendance-email-failover`,
  `npm.cmd run test:attendance-notifications`, `npx.cmd tsc --noEmit`, and
  `git diff --check` passed on 2026-11-11. Focused lint reaches five
  pre-existing errors and ten warnings elsewhere in `StudentProfiles/page.tsx`;
  none are in the changed modal/API paths. Read-only live schema inspection
  confirmed the Parent column names that caused the failure.

### Attendance Email-only delivery override

- **Complete in source:** ICT's **Email only** setting now sends attendance
  email to each eligible completed active Parent with a valid email address,
  even when that Parent's usual choice is SMS. **Neither** remains an explicit
  Parent opt-out. Pending, unclaimed SMS jobs are safely skipped and queued for
  eligible email delivery when ICT changes into Email-only mode; already sent
  or provider-claimed SMS jobs are not modified.
- **Visibility:** The existing scheduled attendance queue route processes both
  SMS and email jobs. The ICT modal shows only the SMS delivery queue; email
  delivery remains a background worker flow.
- **Affected files:** attendance notification settings, SMS/email queue and
  worker routes, Parent notification preferences/Profile UI, ICT Student
  Profiles UI, `/api/ict/attendance-email-jobs`,
  `attendanceDeliveryTransition.ts`, and the attendance notification scripts.
  No database migration or attendance record was changed.
- **Verified:** `npm.cmd run test:attendance-notifications`,
  `npm.cmd run test:attendance-email-failover`,
  `npm.cmd run test:ict-attendance-sms-delivery-queue`, and
  `npx.cmd tsc --noEmit` passed on 2026-11-09. Live delivery remains
  **unverified** until an ICT account selects Email only and a real active
  Parent with a configured email receives an attendance alert.

### Parent notifications for account and child changes

- **Complete in source:** Adviser edits made through `/api/students/[id]` and
  ICT edits made through `/api/ict/students/[id]` or
  `/api/ict/user-management` now create Parent-facing notices that identify
  the actor (Adviser or ICT) and the saved child/account fields that changed.
  ICT parent-student link corrections also notify the affected Parent account.
- **Delivery boundary:** only a completed, active Parent account receives a
  dashboard notice. Pre-signup verification records do not have a Parent
  dashboard to notify.
- **Affected files:**
  `supabase/migrations/20261109100000_add_parent_account_change_notifications.sql`,
  `src/lib/parentAccountChangeNotifications.ts`, the four API routes above,
  `/api/parents/notifications`,
  `src/app/dashboard/parent/notifications/page.tsx`, and
  `scripts/test-parent-account-change-notifications.cjs`.
- **Verified:** `npm.cmd run test:parent-account-change-notifications`,
  `npx.cmd tsc --noEmit`, and `npm.cmd run build` passed on 2026-11-09.
  Live verification is **unverified** until the migration is applied and an
  active Parent receives, reads, and refreshes a real notification.

### ICT approval selection

- **Complete:** User Management now identifies a staff-profile approval by
  both role and request ID. Adviser and Guidance request tables can each have
  the same numeric ID; approving one no longer changes the other row in the
  modal. The API requires a valid role and ID, and the UI leaves a request
  pending when the API does not confirm its update. Approval review is
  available from the User Management Approval Requests sidebar card; the
  duplicate header button and Pending Approval directory filter are removed.
  The ICT sidebar shows the real pending count beside User Management and
  refreshes it from the protected approval endpoint after the existing
  relevant realtime events.
- **Affected files:** `src/app/dashboard/ict/user-management/page.tsx`,
  `src/app/api/ict/approvals/route.ts`, `scripts/test-ict-approval-selection.cjs`,
  and `package.json`.
- **Verified:** `npm.cmd run test:ict-approval-selection`,
  `npx.cmd tsc --noEmit`, and `npm.cmd run lint` passed on 2026-11-10.
  Browser verification of the sidebar entry point remains **unverified**.

### Current student names in existing Parent reports

- **Complete in source:** Parent, Adviser, Guidance, and Principal report reads
  now resolve a student's current name from the Student Profile by LRN. The
  stored report name remains a fallback if no student record is available, so
  no historical report data is rewritten. Guidance's ticket list and immediate
  Adviser/Guidance/Principal status-update responses use the same rule.
- **Affected files:** `src/app/api/reports/parent-adviser/_lib.ts`,
  `/api/reports/parent-adviser`, Guidance tickets, the three report-status
  routes, and `scripts/test-report-current-student-name.cjs`.
- **Verified:** `npm.cmd run test:report-current-student-name`,
  `npx.cmd tsc --noEmit`, and `npm.cmd run build` passed on 2026-11-09.
  Browser verification with a renamed student and a pre-existing report is
  still **unverified**.

### Current student names in the Guidance dashboard queue

- **Complete in source:** `/api/guidance/dashboard` now uses the same current
  Student Profile name overlay as the report workspaces. Its Escalated Concerns
  table no longer displays a stale submission-time name after a student record
  is corrected; the stored report name remains the fallback for a missing
  historical student record.
- **Affected files:** `src/app/api/guidance/dashboard/route.ts` and
  `scripts/test-report-current-student-name.cjs`.
- **Verified:** `npm.cmd run test:report-current-student-name`,
  `npm.cmd run test:guidance-ticket-dashboard-status`, and
  `npx.cmd tsc --noEmit` passed on 2026-11-09. Browser verification with a
  renamed student remains **unverified**.

### Subject Teacher reporter visibility

- **Complete in source:** a Subject Teacher report keeps the reporter's name
  in the Adviser detail and now includes it in the Guidance and Principal
  detail views once their existing escalation rules authorize the report.
  Parent-facing report payloads, message labels, notification feed, detail UI,
  and the submission email use a generic Subject Teacher/School staff label
  instead; the reporter's name and email are not exposed there.
- **Affected files:** `/api/subject-teacher-reports`, report mapper and Parent
  notification routes, `mailer.ts`, Parent/Guidance/Principal report pages,
  `dashboard/parent/data.ts`, and
  `scripts/test-subject-teacher-reporter-privacy.cjs`.
- **Verified:** `npm.cmd run test:subject-teacher-reporter-privacy`,
  `npx.cmd tsc --noEmit`, and `npm.cmd run build` passed on 2026-11-09.
  Browser-role verification remains **unverified**. The older
  `test:subject-teacher-report-security` is independently blocked because it
  references a missing legacy migration file.

### Subject Teacher submission without a Parent account

- **Complete in source:** `/api/subject-teacher-reports` now always routes a
  verified, matched student's report to the assigned Adviser even if no
  eligible Parent account exists. A linked Parent without email remains linked
  for in-app access, while Parent email delivery is skipped. The public
  success view now reports the actual notification outcome.
- **Affected files:** the Subject Teacher public page and submission route,
  `scripts/test-subject-teacher-report-parent-availability.cjs`, and
  `package.json`.
- **Verified:** `npm.cmd run test:subject-teacher-report-parent-availability`,
  `npm.cmd run test:subject-teacher-reporter-privacy`, and
  `npx.cmd tsc --noEmit` passed on 2026-11-09. Live submission with no Parent,
  SMS-only Parent, and emailed Parent remains **unverified**. The existing
  category check remains independently blocked by a missing legacy migration
  source file.

### Send a Concern modal placement

- **Complete:** Adviser, Guidance, and Principal report modals are consistently
  aligned to the top right of the viewport, with the existing responsive width,
  scrolling, overlay, and close behavior preserved. Parent-recipient cards now
  emphasize the Parent/Guardian and show the student name on their bottom line.
- **Complete in source:** Guidance and Principal now always offer Grade 1
  through Grade 6 in their school-wide Parent selectors. The shared recipient
  lookup removes retired SF1 `Parent Account Owner` placeholders and reuses the
  completed-signup rule for list, send, and Parent-participant validation.
- **Affected files:** `schoolGradeLevels`, `parentMessageRecipients`, the
  staff-message route, Guidance/Principal report pages, and the recipient
  regression check.
- **Verified:** `npm.cmd run test:send-concern-recipients`,
  `npm.cmd run test:staff-direct-messages`, and `npx.cmd tsc --noEmit` passed
  on 2026-11-11. Focused ESLint had no errors and reached eight pre-existing
  warnings in the Principal report page outside this change. The unrelated
  `test:guidance-parent-live-messaging` currently stops on its stale typing-hook
  assertion; its hook was not changed by this work.

### Profile Settings draft protection and Adviser class selection

- **Complete:** Parent, Adviser, Guidance, and Principal Settings dialogs now
  ask whether to keep editing or discard when a profile/password draft is
  closed with X, Cancel, backdrop click, or Escape. Saved-success views close
  normally. The shared prompt follows the Parent blue, Adviser emerald,
  Guidance sky, or Principal violet theme.
- **Complete:** Adviser Settings no longer clears selected advisory sections
  when the Adviser changes grade. Selections are retained per grade, still
  limited to two for the active grade, and the existing approval request saves
  the currently selected grade and its sections.
- **Affected files:** `src/components/UnsavedChangesDialog.tsx`, the Parent,
  Adviser, Guidance, and Principal profile pages, and
  `scripts/test-profile-save-flows.cjs`.
- **Verified:** `npm.cmd run test:profile-save-flows`, `npx.cmd tsc --noEmit`,
  `npm.cmd run build`, and `git diff --check` passed on 2026-11-09. A browser
  interaction smoke test for each close path remains unverified.

### Adviser assignment-request notice

- **Complete:** The current Adviser assignment-change request notice now has a
  dismiss (X) action. It persists the current request ID in that Adviser's
  browser, so the notice remains hidden after a page refresh. It does not
  modify the request, approval status, or ICT history; a newer request appears
  normally.
- **Affected files:** `src/app/dashboard/adviser/profile/page.tsx` and
  `scripts/test-profile-save-flows.cjs`.
- **Verified:** `npm.cmd run test:profile-save-flows`, `npx.cmd tsc --noEmit`,
  `npm.cmd run lint`, and `git diff --check` passed on 2026-11-10. Browser
  confirmation of dismiss, refresh, and a later request remains unverified.

### Guidance profile-request notice

- **Complete:** Guidance Profile now displays its existing latest ICT profile
  request as a blue status notice (Pending, Approved, or Rejected), including
  the ICT note when present. Its X action persists that request ID in the
  Guidance Counselor's browser, so it remains hidden after refresh; a newer
  request remains visible. It does not modify approval data.
- **Affected files:** `src/app/dashboard/guidance/profile/page.tsx` and
  `scripts/test-profile-save-flows.cjs`.
- **Verified:** `npm.cmd run test:profile-save-flows`, `npx.cmd tsc --noEmit`,
  `npm.cmd run lint`, and `git diff --check` passed on 2026-11-10. Browser
  confirmation of dismiss, refresh, and a later request remains unverified.

### Announcement deletion confirmation

- **Complete in source:** Adviser, Guidance, ICT, and Principal announcement
  cards now require confirmation before deletion. The shared dialog describes
  scheduled-delivery cancellation versus removing a published announcement,
  supports Cancel/X/backdrop/Escape dismissal, prevents duplicate requests
  while deleting, and keeps an API failure visible in the dialog.
- **Affected files:** `src/components/AnnouncementDeleteConfirmationModal.tsx`,
  the four role announcement pages, `scripts/test-announcement-delete-confirmations.cjs`,
  and `package.json`.
- **Verified:** `npm.cmd run test:announcement-delete-confirmations` and
  `npx.cmd tsc --noEmit` passed on 2026-11-09. Browser confirmation of each
  role's cancel/confirm path remains **unverified**.

### Audit Trail PDF export

- **Complete in source:** ICT and Principal Audit Trail export dialogs now
  state that the selected Manila calendar date will download as a PDF. Their
  protected export routes accept `export=pdf`, return a PDF attachment, and
  reject other export formats. The generated PDF includes all audit rows for
  that date, including the authorized security fields already present in the
  prior export.
- **Affected files:** `src/components/AuditExportModal.tsx`, both Audit Trail
  pages and API routes, `src/lib/auditPdf.ts`,
  `src/lib/downloadAuditPdf.ts`, and `scripts/test-audit-trail-export.cjs`.
- **Verified:** `npm.cmd run test:audit-trail-export`, `npx.cmd tsc --noEmit`,
  and `npm.cmd run build` passed on 2026-11-09. A browser download smoke test
  with a real ICT and Principal session remains **unverified**.

### Current uncommitted implementation areas

`git status` currently shows changes in the following areas. Their final
behavior and test status were **not independently reverified** while creating
these documents:

- Adviser announcements: `src/app/api/adviser/announcements/route.ts`,
  `src/app/dashboard/adviser/notifications/page.tsx`,
  `src/lib/announcementSchedule.ts`, and announcement test scripts.
- Staff profile flows: Adviser, ICT, and Principal profile pages; Adviser API;
  ICT approval API; and `scripts/test-profile-save-flows.cjs` /
  `scripts/test-principal-profile.cjs`.
- Report messaging and recipient selection: Adviser, Guidance, and Principal
  report pages; `src/app/api/reports/{adviser-messages,staff-messages}/route.ts`;
  `src/lib/parentMessageRecipients.ts`; and related focused tests.
- Other visible worktree changes: Parent notifications, ICT audit trail,
  Adviser student view, guidance report export, `package.json`, and report
  cancellation tests.

### Verification recorded for this documentation task

- Read `AGENTS.md` and preserved its generated Next.js block.
- Inspected the dashboard/API directory layout, `package.json`,
  `supabase/config.toml`, selected attendance/report/notification utilities,
  migration location, and current Git status.
- `git diff --check` completed without whitespace errors.
- **Not run for this documentation-only task:** lint, TypeScript checking,
  focused tests, or production build.

## Remaining / next steps

1. Before release, perform a browser smoke test with a non-production Parent
   account: save an allowed profile change, confirm the success view and the
   immediately updated fields, then reopen Profile and confirm the persisted
   values. This operational check is still **unverified**.
2. Before merging the other existing worktree changes, run the focused scripts for
   each changed flow, `npx.cmd tsc --noEmit`, `npm.cmd run build`, and
   `git diff --check`.
3. Update this file whenever implementation scope, affected files, or
   verification results change. Mark untested behavior as unverified rather
   than inferring success from file names or UI text.
