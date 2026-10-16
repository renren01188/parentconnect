/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const notifyParentRoute = read("src/app/api/student-reports/[id]/notify-parent/route.ts");
const parentReportsRoute = read("src/app/api/reports/parent-adviser/route.ts");
const parentReportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const parentReportsPage = read("src/app/dashboard/parent/reports/page.tsx");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const parentNotificationContext = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentSessionGate = read("src/app/dashboard/parent/ParentSessionGate.tsx");
const parentProfile = read("src/app/dashboard/parent/profile/page.tsx");
const parentData = read("src/app/dashboard/parent/data.ts");
const adviserReportsPage = read("src/app/dashboard/adviser/reports/page.tsx");
const studentReportStatusRoute = read("src/app/api/student-reports/[id]/status/route.ts");

// The Adviser forwarding action must resolve a real parent/student link
// before it either looks for or creates a Parent Report. This prevents a
// matching email or another guardian's conversation from leaking in.
assert.match(notifyParentRoute, /from\("parent_student_links"\)[\s\S]*?\.eq\("student_id", studentReport\.student_id\)/);
assert.match(notifyParentRoute, /parents!inner\(id, email\)/);
assert.match(notifyParentRoute, /const parentId = Number\(parentRow\.id\)/);
assert.match(
  notifyParentRoute,
  /\.eq\("parent_id", parentId\)[\s\S]*?\.eq\("adviser_id", adviser\.id\)[\s\S]*?\.eq\("student_id", studentReport\.student_id\)[\s\S]*?\.eq\("subject", subject\)/,
);
assert.match(notifyParentRoute, /parent_id: parentId/);

// Each persisted or retried forwarded report wakes the linked parent and the
// assigned Adviser on their existing report channels without creating a row.
assert.equal(
  (notifyParentRoute.match(/await publishReportRealtimeInvalidation\(/g) ?? []).length,
  2,
  "new and idempotent forwarded student concerns must both publish a report refresh",
);
assert.match(notifyParentRoute, /parentId,[\s\S]*?adviserId: adviser\.id,[\s\S]*?reportId: parentReport\.id,[\s\S]*?kind: "message"/);

// Parent Reports remain scoped to the authenticated parent and to students
// actually linked to that parent; this is the server-side visibility boundary.
assert.match(parentReportsRoute, /const parent = await getParentSession\(\)/);
assert.match(parentReportsRoute, /getLinkedStudentIds\(parent\.id\)/);
assert.match(parentReportsRoute, /\.eq\("parent_id", parent\.id\)[\s\S]*?\.in\("student_id", linkedStudentIds\)[\s\S]*?\.is\("cancelled_at", null\)/);

// The Parent API retains the student's origin instead of guessing from the
// category, and both the Reports page and dashboard card display that origin.
assert.match(parentReportMapper, /function isStudentConcernReport\(row: Pick<ReportRow, "subject">\)/);
assert.match(parentReportMapper, /const isStudentSubmittedConcern = isStudentConcernReport\(row\)/);
assert.match(parentReportMapper, /isStudentSubmittedConcern,/);
assert.match(parentReportsPage, /Student concern/);
assert.match(parentReportsPage, /Student-submitted concern/);
assert.match(parentDashboard, /r\.isStudentSubmittedConcern \? "Student concern"/);
assert.match(parentDashboard, /\["attendance", "reports", "notifications", "announcements", "staff-messages"\]/);

// The Parent Notifications feed derives forwarded Student Concerns from the
// same parent-and-student-scoped report row and uses the saved Adviser message
// as its visible text/read state. It never needs sample dashboard data.
assert.match(parentNotifications, /\.eq\("parent_id", session\.id\)[\s\S]*?\.in\("student_id", \[\.\.\.studentNames\.keys\(\)\]\)[\s\S]*?\.ilike\("subject", "\[Student Concern\]%"\)/);
assert.match(parentNotifications, /\.from\("parent_adviser_report_messages"\)[\s\S]*?\.in\("sender_role", \["adviser", "guidance", "principal", "subject_teacher"\]\)/);
assert.match(parentNotifications, /title: isStudentConcern \? report\.subject : "New Subject Teacher Report"/);
assert.match(parentNotifications, /msg: messageBody \|\| report\.subject/);
assert.match(parentNotifications, /await publishRealtimeInvalidation\(\[\{ role: "parent", id: session\.id \}\], "reports"\)/);
assert.match(parentNotificationContext, /scope === "reports" \|\| scope === "staff-messages"[\s\S]*?refreshUnreadReportsCount\(\), refreshNotificationFeed\(\)/);
assert.doesNotMatch(parentDashboard, /FALLBACK_STUDENTS|REMOVED_REPORT_SAMPLE|REMOVED_MESSAGE_SAMPLE/);
assert.doesNotMatch(parentData, /INITIAL_REPORTS|INITIAL_NOTIFICATIONS/);

// Refreshes only leave the dashboard for an explicit invalid/expired session.
// Temporary profile/API failures retain the HttpOnly cookie and offer a retry.
assert.match(parentSessionGate, /response\.status === 401 \|\| response\.status === 403/);
assert.match(parentSessionGate, /Your session has not been signed out\./);
assert.match(parentSessionGate, /Try again/);
assert.match(parentProfile, /res\.status === 401 \|\| res\.status === 403/);
assert.match(parentProfile, /setLoadError\(data\?\.message \|\| "Unable to load your profile\. Please try again\."\)/);

// Parent notification is a terminal action for resolving a student concern.
// Keep the visual control inert and enforce the same rule if a stale modal or
// direct request tries to resolve it after a live update.
assert.match(adviserReportsPage, /const isParentNotified = notifiedStudentReports\.has\(selectedStudRep\.id\)/);
assert.match(adviserReportsPage, /disabled=\{isParentNotified \|\| resolvingStudent\}/);
assert.match(adviserReportsPage, /if \(!isParentNotified\) setStudentResolveTargetId\(selectedStudRep\.id\)/);
assert.match(adviserReportsPage, /Resolve unavailable/);
assert.match(adviserReportsPage, /if \(notifiedStudentReports\.has\(studentResolveTargetId\)\)[\s\S]*?setStudentResolveTargetId\(null\)[\s\S]*?return;/);
assert.match(studentReportStatusRoute, /select\("id, student_id, student_name, status, notified_parent"\)/);
assert.match(studentReportStatusRoute, /if \(existing\.notified_parent && nextStatus === "resolved"\)[\s\S]*?status: 409/);

console.log("student concern parent-report linkage and delivery checks passed");
