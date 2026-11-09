# ParentConnect progress

## Snapshot — 2026-11-09

This is a source-tree snapshot, not a release checklist. It records verified
paths and working-tree state only; feature behavior is not considered verified
unless a named check has been run and recorded below.

### Documentation task

- **Complete:** added `docs/architecture.md` and this file; updated `AGENTS.md`
  with targeted-search and documentation-maintenance guidance.
- **Behavior impact:** none. No application code, migrations, database records,
  or secrets were changed.

### Public header school branding

- **Complete:** removed the top-left Santiago Elementary School seal from the
  landing hero and the shared login header used by all user roles while
  retaining the school-name text. The lower institutional logos and the public
  navigation remain unchanged.
  The landing, all login journeys, About, and Contact now use the same local
  school-banner image.
- **Affected files:** `src/components/HeroSection.tsx`,
  `src/components/LoginLandingHeader.tsx`,
  `scripts/test-public-header-branding.cjs`, and `package.json`.
- **Verified:** `npm.cmd run test:public-header-branding`,
  `npx.cmd tsc --noEmit`, and `npm.cmd run build` passed on 2026-11-09.

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

### Attendance Email-only delivery override

- **Complete in source:** ICT's **Email only** setting now sends attendance
  email to each eligible completed active Parent with a valid email address,
  even when that Parent's usual choice is SMS. **Neither** remains an explicit
  Parent opt-out. Pending, unclaimed SMS jobs are safely skipped and queued for
  eligible email delivery when ICT changes into Email-only mode; already sent
  or provider-claimed SMS jobs are not modified.
- **Visibility:** ICT Student Profiles now displays a separately searchable,
  scrollable Email delivery queue using Parent name first and student name
  below it. The existing scheduled attendance queue route now processes both
  SMS and email jobs.
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
  pending when the API does not confirm its update. The Approvals button and
  Pending Approval filter now always show the real number of currently pending
  requests; opening either view does not hide the count. The ICT sidebar shows
  that same count beside User Management and refreshes from the protected
  approval endpoint after the existing relevant realtime events.
- **Affected files:** `src/app/dashboard/ict/user-management/page.tsx`,
  `src/app/api/ict/approvals/route.ts`, `scripts/test-ict-approval-selection.cjs`,
  and `package.json`.
- **Verified:** `npm.cmd run test:ict-approval-selection`,
  `npx.cmd tsc --noEmit`, and `npm.cmd run build` passed on 2026-11-09.
  Browser verification with same-number Adviser and Guidance request IDs is
  still **unverified**.

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
- **Verification:** `npm.cmd run test:send-concern-recipients` confirms the
  three modal overlays use the common top-right placement contract.

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
  dismiss (X) action. It hides only that request for the current page session;
  it does not modify the request, approval status, or ICT history.

### Guidance profile-request notice

- **Complete:** Guidance Profile now displays its existing latest ICT profile
  request as a blue status notice (Pending, Approved, or Rejected), including
  the ICT note when present. Its X action hides only that request for the
  current page session and does not modify approval data.
- **Affected files:** `src/app/dashboard/guidance/profile/page.tsx` and
  `scripts/test-profile-save-flows.cjs`.
- **Verified:** `npm.cmd run test:profile-save-flows`, `npx.cmd tsc --noEmit`,
  and `npm.cmd run build` passed on 2026-11-09.

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
