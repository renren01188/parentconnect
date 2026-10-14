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

console.log("student concern parent-report linkage and delivery checks passed");
