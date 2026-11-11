# ParentConnect architecture

## Overview and stack

ParentConnect is a school portal for Parents, Advisers, Guidance, ICT, and
Principals. It is a Next.js App Router application using TypeScript and React.
The installed stack includes Next 16, React 19, Tailwind CSS 4, Supabase,
iron-session/Jose/JWT session helpers, ExcelJS/XLSX exports, and Nodemailer.
`src/app/layout.tsx` provides the root layout and Vercel Speed Insights.

## Application paths

| Area | Verified page paths |
| --- | --- |
| Adviser | `src/app/dashboard/adviser/{attendance,notifications,profile,reports,students,transfer-level}` |
| Guidance | `src/app/dashboard/guidance/{announcements,notifications,profile,reports}` |
| ICT | `src/app/dashboard/ict/{Announcements,audit-trail,inbox,profile,StudentProfiles,user-management}` |
| Parent | `src/app/dashboard/parent/{attendance,notifications,profile,reports}` |
| Principal | `src/app/dashboard/principal/{announcements,AttendanceSummary,audit-trail,notifications,profile,reports}` |
| Public/auth | `src/app/login`, `src/app/report`, `src/app/report/subject-teacher`, and API routes under `src/app/api` |

Role pages are client/server UI entry points; route handlers under
`src/app/api` own data access and authorization checks. Do not assume a UI
restriction is also enforced by an API—inspect the route involved.

## Shared UI, hooks, and utilities

- Shared components: `src/components`, including login, session, attachment,
  report, avatar, and public-report components. Role-local components are in
  each dashboard's `components` directory.
- Public headers: `HeroSection.tsx` serves the landing page and
  `LoginLandingHeader.tsx` serves every user-login journey. Their top header
  uses the Santiago Elementary School seal immediately to the left of its
  school name; neither displays lower right-side institutional marks.
  `SchoolBackground.tsx` makes every login banner use the same local
  `/hero-school-4.png` asset as the landing, About, and Contact headers.
- The About page's introductory ParentConnect card statically imports the app
  metadata icon from `src/app/icon.png` (the browser-tab logo) at a larger
  standalone size rather than a generic school glyph or decorative navy tile.
- Its Santiago Elementary School information card similarly uses the official
  `/santiago-elementary-logo.png` seal rather than a graduation-cap glyph.
- `PublicHeroHeader` supports hiding the lower DepEd/Santiago institutional
  marks for a specific public page; About and Contact Us use this option.
  `PublicReportPageShell` similarly omits the marks for both public report
  journeys.
- Realtime and refresh hooks: `src/hooks/useDebouncedRealtimeRefresh.ts`,
  `useVisibleRefresh.ts`, `useReportMessagesRealtime.ts`,
  `useStaffMessagesRealtime.ts`, and related typing/session/badge hooks.
- Cross-cutting utilities live in `src/lib`. Examples include authorization
  (`apiAuthorization.ts`), sessions (`session.ts`), audit logging (`audit.ts`),
  realtime invalidation (`realtimeInvalidation.ts`), parent links
  (`reconcileParentStudentLinks.ts`), and school-calendar helpers
  (`schoolCalendar.ts`).

## Supabase and schema

- Server client: `src/lib/supabase.ts`; browser client:
  `src/lib/supabaseBrowser.ts`.
- Schema migrations: `supabase/migrations/*.sql`; local Supabase settings:
  `supabase/config.toml`.
- Database diagrams under `ERD/` and data-flow diagrams under `DFD/` are
  reference artifacts. Confirm current behavior in the route handlers,
  utilities, and migrations before relying on them.

## Key flows

### Attendance

The Adviser attendance UI is `src/app/dashboard/adviser/attendance/page.tsx`.
RFID scanning uses `/api/attendance/scan`; rapid taps, scheduled class checks,
and automatic absences are supported by `attendanceRapidTapQueue.ts`,
`attendanceScannerSchedule.ts`, and `automaticAttendanceAbsence.ts`.
History, manual/edit operations, and monthly reporting are under
`/api/attendance/{history,manual,edit,monthly}`. Monthly/SF2 helpers include
`attendanceReportingCalendar.ts`, `finalAttendanceExport.ts`,
`sf2DailyMark.ts`, and `sf2EnrollmentSummary.ts`. Principal reporting is
served by `dashboard/principal/AttendanceSummary` and its related API routes.
The Adviser RFID replacement flow applies the API-confirmed UID locally and
uses ordered roster reads, so a delayed pre-save roster response cannot restore
the old UID in the Register RFID modal.
The Adviser Rapid Tap processing notice appears only after browser queue
storage is restored and a scan is actively capturing, queued, saving, or
retrying. Failed scans use a separate attention notice with their existing
Review/Retry controls, so an empty queue does not briefly appear as processing.
The Parent history API treats an automatic Absent `Time Out` as a missing
physical checkout: it keeps the real Time In, exposes `missing_time_out`, and
does not display the automatic finalization as a departure. The Parent
dashboard and Parent/Adviser notification feeds use that same final result,
including the recorded Time In when explaining a missing Time Out.

### Student registration

`StudentParentRegistration` is shared by Adviser student registration and ICT
Create User's student-roster flow. A required birth date must make the learner
at least four completed years old on the school-local current date. The client
shows the resulting whole-year age as read-only, while `/api/students` repeats
the validation and derives the stored age from the birth date rather than
trusting a submitted age value.

### ICT class-session section configuration

ICT's Create User **Manage Class Sessions** modal stages section additions,
deletions, and renames locally, then submits one password-authorized batch to
`PUT /api/sections`. A rename uses the server-only `rename_sections` database
routine to retain the `sections.id` and class session, cascade canonical student
assignments, and synchronize display-only section labels. Migration
`20261111103000_fix_section_rename_column_ambiguity.sql` qualifies every
routine table column because its `RETURNS TABLE` output names otherwise conflict
with PL/pgSQL references such as `grade`.

The recorded verification contact number is retained for pre-signup matching,
but Adviser View/Edit and ICT Edit Parent Account hide it after the Parent has
completed password setup; the active Parent contact number is the visible
account contact from then on. The ICT Edit Parent Account modal keeps one
scrolling content region with a persistent action bar and a compact
Account/Family or Linked Students panel switch. This presentation layer does
not change its existing save, validation, or authorization paths.
The Adviser SF1 Import Registration preview returns the existing learner's
name, LRN, and section for duplicate LRNs. Its compact, paginated expander
keeps those learners out of both the detailed preview and the submitted import
payload, so the import count covers only new learners. Parent-link review lists
only students with active-account candidates: exact matches state whether the
relationship will be created or is already saved, while ambiguous matches keep
the existing account selector. Learners without a completed active Parent match
are omitted from this review; the server-side match validation and multi-student
Parent linking remain unchanged.

Attendance notification jobs are queued in `attendanceSmsQueue.ts`, processed
by `attendanceSmsWorker.ts`, and exposed in the ICT Attendance Notifications
modal through `/api/ict/attendance-sms-jobs`. Email notification counterparts
remain in `attendanceEmailQueue.ts` and `attendanceEmailWorker.ts`, but the
modal does not display an email delivery queue. The scheduled
`/api/internal/process-attendance-sms` worker processes both durable queues.
When ICT selects Email only, every eligible completed active Parent with a
valid email receives email regardless of their usual SMS preference; `Neither`
remains an explicit opt-out.

### Reports and messages

Parent/Adviser report operations are centered on
`/api/reports/parent-adviser` and its `_lib.ts`; Guidance and Principal status
routes live beneath `/api/reports/guidance` and `/api/reports/principal`.
The Parent **New Report** student selector is an anchored overlay within its
modal, so opening the linked-student list does not change the dialog's size;
the list has its own viewport-safe internal scrolling.
Report payloads and the Guidance dashboard queue resolve a current Student
Profile name by LRN at read time, falling back to the stored report-name
snapshot only when that student record is unavailable. This keeps corrected
student names consistent in existing Parent, Adviser, Guidance, and Principal
report views without rewriting report history.
Realtime report updates use `realtimeInvalidation.ts` and report-message hooks.
The Parent, Adviser, Guidance, and Principal category dropdowns derive their
options and counts from the active report tab/status scope. If a realtime or
status update removes the selected category from that scope, the filter resets
to **All** rather than leaving an empty, stale selection.
Report/message detail panels omit duplicated desktop titles, while their
narrow-screen layout retains an icon-only Back control to return to the report
list. Subject Teacher Notify Parent drafts use the report description as the
concern and refer only to generic school staff, preserving the teacher's
identity in Parent-facing text.
Locked Adviser Parent and Student/Subject Teacher concerns, plus locked
Guidance Parent concerns, show the shared `ConcernViewAgreement` notice before
their existing **See the Concern** action. Its acknowledgement is browser-local
to the currently opened concern and clears when another concern is selected;
it only unlocks that existing detail view and does not escalate a concern.
The public Student Report page at `/report` requires the submitter to scroll
through and acknowledge the **Reporting Guidelines and Privacy Notice** before
its existing CAPTCHA-gated submission can proceed. The notice explains the
school-review purpose, audit security metadata, confidentiality, responsible
use, and immediate-danger escalation guidance; it does not change the API
validation or audit-access boundary.
Standalone staff messages use `/api/reports/staff-messages`; Adviser and
Principal message paths also have dedicated report routes. Keep standalone
messages distinct from the report-conversation workflow. The Adviser, Guidance,
and Principal **Send a Concern** modals are client-side report-page components
anchored at the top right of their overlay. Parent-recipient rows identify the
Parent/Guardian first and place the associated student's name on the final line.
Subject Teacher reports retain the named reporter in the Adviser mapper and in
Guidance/Principal detail payloads only after their existing escalation access
rules permit those roles to read the report. The Parent mapper, Parent report
UI, Parent notification feed, and Parent-facing submission email redact that
identity and use generic Subject Teacher/School staff wording.
Contact ICT uses the selected opaque `ict:<account-id>` recipient value through
the Adviser, Guidance, and Principal contact routes. Their shared
`ictMessageRecipients.ts` lookup lists only active, non-archived ICT accounts
and re-validates exactly that account before a new root or reply is saved.
`/dashboard/ict/inbox` reads `/api/reports/staff-messages?role=ict`, whose
server query and unread summary both scope sender/recipient rows to the
signed-in ICT account ID. The same saved-participant check is repeated before
opening, reading, typing in, or replying to a direct conversation, so one ICT
account cannot receive or open another account's Contact ICT thread.
The public Subject Teacher submission route creates an Adviser-owned
`student_reports` record after the student and Adviser are verified. Its
optional Parent link is only a snapshot for a later Adviser **Notify Parent**
action; absent or pre-signup Parent records never block submission or create a
Parent Report. Migration
`20261110130000_route_subject_teacher_reports_to_student_reports.sql` stores
the verified teacher metadata, retry key, selected categories, and daily-limit
boundary on `student_reports`. When an Adviser later forwards it, the Parent
sees anonymous School staff wording while authorised Adviser/Guidance/Principal
views retain the Subject Teacher attribution.
In Adviser Student & Subject Teacher Reports, Subject Teacher submissions are
grouped by their reporter in the first panel and retain that teacher at the top of panel two;
the panel-two report card and detail header label the associated learner as
`Student: Name`, before the staff-only submitter attribution. The Adviser mapper
also recognizes the older `[Subject Teacher Report] Name` title format. A
Parent is eligible for the later Notify Parent action only when they have
completed registration and are attached to that exact student through
`parent_student_links` or the legacy `parents.student_id` relation. Email is
optional: the Parent Report is delivered in-app, while a configured email only
receives the additional email alert.

### Notifications and announcements

Parent notifications use `/api/parents/notifications`; role notification APIs
are grouped under their respective API namespaces. Announcement delivery is
role-specific (`deliver{Adviser,Guidance,Principal,Ict}Announcement.ts`) and
scheduled delivery is processed by `processScheduledAnnouncements.ts` using
`announcementSchedule.ts`. Realtime invalidation is the shared update path.

Parent-facing notices for Adviser or ICT account/student edits are persisted in
`parent_account_change_notifications`. The shared
`parentAccountChangeNotifications.ts` helper is called by Adviser student
updates, ICT student updates, ICT User Management parent edits, and ICT
parent-student link corrections. It records the actor and changed-field labels
only for completed, active Parent accounts; the Parent notification API serves
and marks these notices read alongside existing notification sources.

Parent profile reads and updates use `/api/parents/me`. The profile page applies
the confirmed update response to local state immediately; audit, account-link,
report-snapshot, and realtime follow-up work must not change a successful
profile update into an error response.

ICT and Principal Audit Trail pages use their respective authorized
`/api/{ict,principal}/audit-log?export=pdf&date=YYYY-MM-DD` routes. The export
is a PDF of all events on the chosen Manila calendar date; CSV is not an
export option. Their table response also includes role-authorized summary totals
for total events, logins, edit actions, and security alerts. Those totals follow
the selected **Recent** or **Archived** tab while deliberately ignoring search,
date, module, status, and pagination filters. The shared export modal and
protected routes reject future Manila dates while continuing to allow today and
earlier dates.

Announcement deletion is confirmed in the client before a role-specific DELETE
request is sent. `AnnouncementDeleteConfirmationModal.tsx` is shared by the
Adviser, Guidance, ICT, and Principal announcement UIs; their existing
role-scoped announcement APIs remain the authorization boundary.

The public `/contact-us` form marks its required Name, Email, Subject, and
Message fields with an accessible `*`; browser and `/api/contact-us`
validation continue to reject empty or invalid details before a message is
delivered. While Send is disabled, hovering or keyboard-focusing its wrapper
lists the outstanding client-side fields and CAPTCHA verification.

### Scheduled deletion and archive

`scheduled_deletions` is the source of truth for deletion requests, approvals,
the recovery period, archive/restore history, and the protected scheduled
processor. Database triggers retain requester/target reference rows and create
Parent in-app deletion notices when a Parent deletion becomes scheduled. The
retired `deletion_email_jobs` queue and its items table are not part of this
flow; migration `20261110120000_remove_legacy_deletion_email_tables.sql`
locks and removes them only when both are empty.

ICT User Management's bulk-deletion candidates are compact, unpaginated lists
for Advisers, Guidance Counselors, Parents, and Students; the paginated
directory is never the authorization source. `/api/scheduled-deletions`
re-resolves every selected root from its role table, rejects archived or
already-scheduled records, and derives staff names/email destinations from the
protected row. `20261111100000_enforce_one_active_scheduled_deletion_per_target.sql`
adds the final concurrent-request guard: at most one Pending ICT or Scheduled
request may exist per target. Parents retain their in-app notice/suspension
flow, while scheduled Adviser and Guidance accounts receive the existing
archive email when their saved address is valid.

For an explicitly authorized, one-off permanent Grade 1 purge,
`supabase/manual-sql/20261111_permanently_delete_grade_1.sql` is a manual
Supabase SQL Editor script, not an application migration. It validates that
every selected Parent and scheduled-deletion request is Grade-1-only, removes
the corresponding report conversations and standalone staff-to-Parent message
threads, then temporarily bypasses only the two hard-delete guard triggers
inside one transaction.

### Profile settings

Parent, Adviser, Guidance, and Principal profile settings are client-side
dialogs in their respective `dashboard/*/profile/page.tsx` pages. They use
`src/components/UnsavedChangesDialog.tsx` to confirm discarding an edited
profile or password draft before close, cancel, backdrop click, or Escape.
The dialog receives the role theme (`parent`, `adviser`, `guidance`, or
`principal`) so the confirmation matches the owning dashboard. Adviser
advisory-section selections are held per selected grade in the dialog; only
the active grade and its selected sections are sent in the existing approval
request. The Adviser profile's latest assignment-request notice can be
dismissed in that adviser's browser by request ID; it persists across reloads
without modifying the approval record, and a newer request is shown. Guidance
uses the latest profile request already returned by `/api/guidance/me` to show
a request-ID-based dismissible notice in its own blue theme. Its dismissal is
also stored only in that Guidance Counselor's browser, persists across reloads,
and does not alter the approval record.

ICT staff-profile approvals are served by `/api/ict/approvals`. Adviser and
Guidance request tables have independent IDs, so the User Management modal
uses a compound `role:id` selection key and sends both values to the API. A
successful response is required before the selected row changes status; the
other request rows remain pending. User Management keeps approval review in its
Approval Requests sidebar card, avoiding duplicate header and directory-filter
entry points. The ICT sidebar uses the same protected API to show the current
Pending count beside User Management and refreshes it from the existing ICT
audit/account invalidations and visibility recovery path.

## Development and verification

Use PowerShell-compatible commands in this repository:

```powershell
npm.cmd run dev
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
git diff --check
```

Focused checks are declared in `package.json` and implemented in `scripts/`.
Run the test matching the changed flow, for example
`npm.cmd run test:attendance-auto-absence` or
`npm.cmd run test:attendance-notifications` or
`npm.cmd run test:attendance-email-failover` or
`npm.cmd run test:profile-save-flows` or
`npm.cmd run test:parent-account-change-notifications` or
`npm.cmd run test:ict-approval-selection`. There is no single catch-all test
script declared in `package.json`.
