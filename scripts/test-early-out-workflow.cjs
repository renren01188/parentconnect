/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20261112140000_add_early_out_requests.sql");
const dismissalMigration = read("supabase/migrations/20261112160000_add_parent_early_out_decision_dismissals.sql");
const adviserRoute = read("src/app/api/adviser/early-out-requests/route.ts");
const guidanceRoute = read("src/app/api/guidance/early-out-requests/route.ts");
const decisionRoute = read("src/app/api/guidance/early-out-requests/[id]/route.ts");
const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
const guidancePage = read("src/app/dashboard/guidance/AttendanceSummary/page.tsx");
const adviserNotifications = read("src/app/api/adviser/notifications/route.ts");
const adviserRead = read("src/app/api/adviser/notifications/read/route.ts");
const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const parentPage = read("src/app/dashboard/parent/notifications/page.tsx");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const earlyOutDecisionCopy = read("src/lib/earlyOutNotificationCopy.ts");
const automaticAbsence = read("src/lib/automaticAttendanceAbsence.ts");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.early_out_requests/, "Early Out requests need a durable source record.");
assert.match(migration, /attendance_date date NOT NULL/, "The original attendance date must be retained.");
assert.match(migration, /UNIQUE \(student_db_id, adviser_id, attendance_date\)/, "Duplicate submissions must be idempotent per student/date/adviser.");
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.early_out_notifications/, "Decisions need durable recipient notifications.");
assert.match(migration, /UNIQUE \(early_out_request_id, recipient_role, recipient_id\)/, "Decision retries must not duplicate notifications.");
assert.match(migration, /FOR UPDATE;[\s\S]*?v_request\.status <> 'Pending'/, "A decision must lock and accept only a pending request.");
assert.match(migration, /p_status = 'Rejected'[\s\S]*?rejection reason is required/i, "Rejection must require a reason in the transaction.");
assert.match(migration, /v_request\.attendance_date/, "Attendance writes must use the saved original date.");
assert.match(migration, /v_time_in\.status NOT IN \('Present', 'On Time', 'Late'\)/, "Existing Present/Late arrival records must be preserved.");
assert.match(migration, /v_time_out\.status = 'Absent' AND v_time_out\.via = 'Auto'/, "An automatic absence must be replaced after approval.");
assert.match(migration, /REVOKE ALL ON FUNCTION public\.decide_early_out_request[\s\S]*?FROM PUBLIC/, "Only the service role may execute the security-definer decision function.");
assert.match(migration, /created_at timestamptz NOT NULL DEFAULT/, "The database must save the server submission timestamp.");
assert.match(migration, /reviewed_at timestamptz/, "The database must save the server decision timestamp.");
assert.match(dismissalMigration, /parent_early_out_decision_dismissals/, "Parent dismissal must be durable, not browser-local.");
assert.match(dismissalMigration, /UNIQUE \(parent_id, early_out_notification_id\)/, "Each Parent decision dismissal must be idempotent.");

assert.match(adviserRoute, /getAdviserFromToken\(\)/, "Adviser requests must be authenticated server-side.");
assert.match(adviserRoute, /manilaDateString\(\)/, "The server must set the Manila attendance date.");
assert.match(adviserRoute, /student\.grade !== adviser\.grade[\s\S]*?sections\.includes\(student\.section\)/, "The server must enforce the adviser's section assignment.");
assert.match(guidanceRoute, /getGuidanceSession\(\)/, "Guidance review listing must be role-protected.");
assert.match(decisionRoute, /getGuidanceSession\(\)/, "Guidance decisions must be role-protected.");
assert.match(decisionRoute, /decide_early_out_request/, "Decisions must use the atomic database function.");
assert.match(decisionRoute, /select\("reviewed_at"\)/, "The decision response must use the committed server review timestamp.");
assert.match(decisionRoute, /publishAttendanceRealtimeInvalidation/, "An approval must refresh attendance readers.");
assert.match(decisionRoute, /publishRealtimeInvalidation\(recipients, "notifications"\)/, "Only the captured recipients must receive notification refreshes.");

assert.ok(adviserPage.indexOf("Early Out") < adviserPage.indexOf("Excuse Approval"), "Early Out must be immediately before Excuse Approval in the adviser header.");
assert.match(adviserPage, /Select Student[\s\S]*?Search name or student ID/, "The adviser modal must offer a searchable student selector.");
assert.match(adviserPage, /studentDbId: selectedStudent\.id/, "The modal must submit the selected roster record, not an untrusted name.");
assert.match(adviserPage, /Submit to Guidance/, "The adviser modal must submit to Guidance.");
assert.match(adviserPage, /Guidance reason:/, "Rejected requests must show Guidance's exact reason.");
assert.match(adviserPage, /Current time \(Asia\/Manila\):/, "The adviser modal must show the current Manila time.");
assert.match(adviserPage, /Submitted At:/, "The adviser history must show the saved submission time.");
assert.match(adviserPage, /Approved At:[\s\S]*?Rejected At:/, "The adviser history must distinguish approval and rejection times.");
assert.match(guidancePage, /Early Out Requests/, "Guidance Attendance Summary must expose Early Out review.");
assert.match(guidancePage, /Attendance date: \{request\.attendance_date\}/, "Guidance must see the original attendance date.");
assert.match(guidancePage, /Submitted At:/, "Guidance must see the server submission time.");
assert.match(guidancePage, /Approved At:[\s\S]*?Rejected At:/, "Guidance must distinguish approval and rejection times.");
assert.match(guidancePage, /Rejection reason[\s\S]*?required only to reject/, "Guidance rejection UI must require a reason.");

assert.match(adviserNotifications, /early_out_notifications/, "Adviser notifications must read exact Early Out recipients.");
assert.match(adviserNotifications, /earlyOutDecisionNotificationCopy/, "Adviser decisions must use the shared timestamped notice copy.");
assert.match(earlyOutDecisionCopy, /Early Out \$\{decisionLabel\}/, "Early Out decision notices must identify the outcome.");
assert.match(earlyOutDecisionCopy, /student may now be picked up from school/i, "Approval notices must include the pickup instruction.");
assert.match(adviserRead, /early-out-\(\\d\+\)/, "Adviser Early Out read state must be recipient-specific.");
assert.match(parentNotifications, /early_out_notifications/, "Parent notifications must read exact Early Out recipients.");
assert.match(parentNotifications, /earlyOutNotificationId/, "Parent read updates must retain the durable Early Out row ID.");
assert.match(parentNotifications, /earlyOutDecisionPopups/, "Parent notifications must return unseen Early Out decisions for the dashboard queue.");
assert.match(parentNotifications, /dismissEarlyOutNotificationId/, "Parent popup dismissal must be authorized and persisted server-side.");
assert.match(parentNotifications, /earlyOutDecisionNotificationCopy/, "Parent notices must use the same timestamped decision copy as the popup.");
assert.match(parentPage, /earlyOutNotificationIds/, "Parent Mark all as read must include Early Out notifications.");
assert.match(parentDashboard, /EarlyOutDecisionPopup/, "The Parent Dashboard must render the decision popup.");
assert.match(parentDashboard, /dismissEarlyOutDecision/, "The Parent Dashboard must persist a popup dismissal before removing it.");
assert.match(parentDashboard, /earlyOutDecisionPopups\[0\]/, "Multiple Parent decisions must be shown one at a time.");
assert.match(automaticAbsence, /filter\(\(log\) => log\.type === "Time Out"\)/, "A durable approved Early Out Time Out must stop automatic missing-checkout absence processing.");

console.log("Early Out workflow source, authorization, attendance, and notification checks passed.");
