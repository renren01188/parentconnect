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
  intentionally contains only public navigation; lower institutional marks
  are separate visual content. `SchoolBackground.tsx` makes every login banner
  use the same local `/hero-school-4.png` asset as the landing, About, and
  Contact headers.
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

Attendance notification jobs are queued in `attendanceSmsQueue.ts`, processed
by `attendanceSmsWorker.ts`, and exposed to ICT through
`/api/ict/attendance-sms-jobs`. Email notification counterparts are in
`attendanceEmailQueue.ts` and `attendanceEmailWorker.ts`.

### Reports and messages

Parent/Adviser report operations are centered on
`/api/reports/parent-adviser` and its `_lib.ts`; Guidance and Principal status
routes live beneath `/api/reports/guidance` and `/api/reports/principal`.
Report payloads and the Guidance dashboard queue resolve a current Student
Profile name by LRN at read time, falling back to the stored report-name
snapshot only when that student record is unavailable. This keeps corrected
student names consistent in existing Parent, Adviser, Guidance, and Principal
report views without rewriting report history.
Realtime report updates use `realtimeInvalidation.ts` and report-message hooks.
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
The public Subject Teacher submission route always creates the Adviser report
after the student and Adviser are verified. A link to an eligible Parent is
retained when one exists, but a Parent email is optional; absent or
pre-signup Parent records never block the Adviser-only submission.

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
export option.

Announcement deletion is confirmed in the client before a role-specific DELETE
request is sent. `AnnouncementDeleteConfirmationModal.tsx` is shared by the
Adviser, Guidance, ICT, and Principal announcement UIs; their existing
role-scoped announcement APIs remain the authorization boundary.

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
dismissed locally by request ID without modifying its approval record. Guidance
uses the latest profile request already returned by `/api/guidance/me` to show
the same local-only, dismissible request-status notice in its own blue theme.

ICT staff-profile approvals are served by `/api/ict/approvals`. Adviser and
Guidance request tables have independent IDs, so the User Management modal
uses a compound `role:id` selection key and sends both values to the API. A
successful response is required before the selected row changes status; the
other request rows remain pending. The ICT sidebar uses the same protected API
to show the current Pending count beside User Management and refreshes it from
the existing ICT audit/account invalidations and visibility recovery path.

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
`npm.cmd run test:profile-save-flows` or
`npm.cmd run test:parent-account-change-notifications` or
`npm.cmd run test:ict-approval-selection`. There is no single catch-all test
script declared in `package.json`.
