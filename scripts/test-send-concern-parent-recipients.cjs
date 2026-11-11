/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const recipients = read("src/lib/parentMessageRecipients.ts");
const gradeLevels = read("src/lib/schoolGradeLevels.ts");
const staffRoute = read("src/app/api/reports/staff-messages/route.ts");
const adviserRoute = read("src/app/api/reports/adviser-messages/route.ts");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");

// One recipient is returned for every active parent_student_links row. This
// is what lets one signed-up Parent appear once for each of their children.
assert.match(recipients, /from\("parent_student_links"\)/);
assert.match(recipients, /recipients\.push\(toRecipient\(parent, student, link\.relationship\)\)/);
assert.match(recipients, /coveredPairs/);
assert.match(recipients, /isLegacyDirectLink/);
assert.doesNotMatch(recipients, /email\.trim\(\)\s*\?/, "SMS-only Parent accounts must remain visible in the recipient list.");

// A school-family placeholder is never exposed as a recipient, even when an
// old import incorrectly marked it active with a password value.
assert.match(recipients, /hasCompletedActiveParentSignup/);
assert.match(recipients, /isImportedParentPlaceholder/);
assert.match(recipients, /filter\(\(parent\) => !isImportedParentPlaceholder\(parent\)\)/);
assert.match(recipients, /accountStatus: canReceive \? "Active" : "Not Active"/);
assert.match(staffRoute, /if \(!recipient\.canReceive\)/);
assert.match(adviserRoute, /if \(!recipient\.canReceive\)/);
assert.match(staffRoute, /select\("id, parent_first_name, parent_last_name, password_set, status, archive_status"\)/);
assert.match(staffRoute, /return Boolean\(data && parentHasCompletedSignup\(data\)\)/);

// Guidance and Principal get the full school list; the Adviser endpoint keeps
// the list within the signed-in Adviser's own grade and section(s).
assert.match(staffRoute, /current\.type === "guidance" \|\| current\.type === "principal"/);
assert.match(adviserRoute, /parent\.grade === adviser\.grade[\s\S]*?adviserSections\.includes\(parent\.section\)/);

// Each modal identifies the child, class, Parent, and account status, and
// prevents an inactive Parent row from being selected or submitted.
for (const source of [adviserReports, guidanceReports, principalReports]) {
  assert.match(source, /accountStatus: "Active" \| "Not Active"/);
  assert.match(source, /canReceive: boolean/);
  assert.match(source, /disabled=\{!\w+\.canReceive\}/);
  assert.match(source, /selectedRecipient\.type !== "parent" \|\| selectedRecipient\.canReceive/);
  assert.match(source, /fixed inset-0 z-50 flex items-start justify-end/);
}
assert.match(adviserReports, /Choose Section/);
assert.match(adviserReports, /p\.actualParentName \|\| p\.name[\s\S]*?Student Name: \{p\.studentName\}/);
assert.match(guidanceReports, /p\.actualParentName \|\| p\.name[\s\S]*?Student Name: \{p\.student\}/);
assert.match(principalReports, /parent\.actualParentName \|\| parent\.name[\s\S]*?Student Name: \{parent\.student\}/);
assert.doesNotMatch(guidanceReports, /list\.findIndex\(\(item\) => item\.id === parent\.id\)/, "Guidance must not collapse sibling rows by parent ID.");

// The school-wide recipient controls retain all elementary grades even where
// no Parent has completed registration in a grade yet.
assert.match(gradeLevels, /"Grade 1"[\s\S]*"Grade 2"[\s\S]*"Grade 3"[\s\S]*"Grade 4"[\s\S]*"Grade 5"[\s\S]*"Grade 6"/);
for (const source of [guidanceReports, principalReports]) {
  assert.match(source, /import \{ schoolGradeLevelOptions \} from "@\/lib\/schoolGradeLevels"/);
  assert.match(source, /schoolGradeLevelOptions\(parentRecipients\.map\(\(parent\) => parent\.gradeLevel\)\)/);
}

console.log("send-concern parent recipient checks passed");
