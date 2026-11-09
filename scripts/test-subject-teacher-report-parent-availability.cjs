/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const route = read("src/app/api/subject-teacher-reports/route.ts");
const page = read("src/app/report/subject-teacher/page.tsx");

// A report must be routable to the assigned Adviser even when a Parent has
// not completed signup, has no email, or is not linked yet. A live Parent ID
// is still retained when it exists, but email delivery is optional.
assert.match(route, /const parent = parents\.find\(parentAccountCanAccess\);/);
assert.match(route, /const parentId = parent\?\.id \?\? null;/);
assert.match(route, /const parentEmail = trimmed\(parent\?\.email\);/);
assert.doesNotMatch(route, /if \(!parent\?\.email\) return NextResponse\.json/);
assert.match(route, /p_parent_id: parentId,/);
assert.match(route, /p_parent_email: parentEmail,/);
assert.match(route, /parentId,/);
assert.match(route, /parentEmail \? sendSubjectTeacherReportNotificationEmail/);
assert.match(route, /No Parent account is linked to this student yet\./);

// The public confirmation must describe the actual notification outcome,
// rather than incorrectly claiming an unavailable Parent was notified.
assert.match(page, /const \[successMessage, setSuccessMessage\] = useState\(""\);/);
assert.match(page, /setSuccessMessage\(data\.message \|\| "Report submitted successfully\."\);/);
assert.match(page, /\{successMessage \|\| "Report submitted successfully\."\}/);

console.log("subject teacher report Parent-availability checks passed");
