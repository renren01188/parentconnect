/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const reportsRoute = read("src/app/api/student-reports/route.ts");
const notifyParentRoute = read("src/app/api/student-reports/[id]/notify-parent/route.ts");
const adviserReportsPage = read("src/app/dashboard/adviser/reports/page.tsx");
const adviserData = read("src/app/dashboard/adviser/data.ts");

// The reports snapshot must tell the modal whether an active account has both
// completed registration and been linked to the exact student.
assert.match(reportsRoute, /function isRegisteredParentAccount/);
assert.match(reportsRoute, /parentAccountCanAccess\(parent\)/);
assert.match(reportsRoute, /parent\.password_set === true[\s\S]*?parent\.password_set === 1/);
assert.match(reportsRoute, /from\("parent_student_links"\)[\s\S]*?\.in\("student_id", studentIds\)/);
assert.match(reportsRoute, /parentLinked: studentsWithRegisteredParents\.has/);
assert.match(adviserData, /parentLinked\?: boolean/);

// The POST route repeats the authority check. It resolves the Parent account
// from the link rather than trusting a stale name/email saved in the report.
assert.match(notifyParentRoute, /from\("parent_student_links"\)[\s\S]*?\.eq\("student_id", studentReport\.student_id\)/);
assert.match(notifyParentRoute, /from\("parents"\)[\s\S]*?password_set, status, archive_status/);
assert.match(notifyParentRoute, /const registeredParents = .*isRegisteredParentAccount/);
assert.match(notifyParentRoute, /not linked to a registered Parent account yet\. The message cannot be sent\./);
assert.match(notifyParentRoute, /parent_email: parentEmail/);
assert.match(notifyParentRoute, /parentEmail,/);

// Unlinked students receive an explanatory notice and cannot send from the
// browser, while linked students retain the normal composer path.
assert.match(adviserReportsPage, /const hasRegisteredParent = studRep\.parentLinked === true/);
assert.match(adviserReportsPage, /No registered Parent account is linked yet\./);
assert.match(adviserReportsPage, /disabled=\{!hasRegisteredParent\}/);
assert.match(adviserReportsPage, /disabled=\{!hasRegisteredParent \|\| !message\.trim\(\) \|\| sending\}/);
assert.match(adviserReportsPage, /if \(!hasRegisteredParent \|\| !message\.trim\(\) \|\| sending\) return;/);

console.log("student report registered-parent link checks passed");
