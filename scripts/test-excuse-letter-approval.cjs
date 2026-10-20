/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const middleware = read("src/middleware.ts");
const adviserListRoute = read("src/app/api/excuse-letters/adviser/route.ts");
const decisionRoute = read("src/app/api/excuse-letters/[id]/route.ts");
const parentRoute = read("src/app/api/excuse-letters/route.ts");
const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
const parentPage = read("src/app/dashboard/parent/attendance/page.tsx");
const adviserAuth = read("src/lib/getAdviserFromToken.ts");

// Parent collection requests are authenticated by the Parent middleware, but
// the Adviser list and decision endpoints must reach their own Adviser guard.
assert.match(middleware, /pathname === "\/api\/excuse-letters"/);
assert.doesNotMatch(middleware, /pathname\.startsWith\("\/api\/excuse-letters"\)/);
assert.match(adviserListRoute, /await getAdviserFromToken\(\)/);
assert.match(decisionRoute, /await getAdviserFromToken\(\)/);
assert.match(adviserAuth, /if \(tokenAdviser\.role !== "adviser" \|\| !isCurrentDashboardIdleSession\(payload\)\) return null/);

// The list is restricted to the authenticated adviser's assigned grade and
// section(s); a caller-provided section cannot expand that scope.
assert.match(adviserListRoute, /adviserSections\.includes\(requestedSection\) \? \[requestedSection\] : \[\]/);
assert.match(adviserListRoute, /\.in\("section", sections\)[\s\S]*?\.eq\("grade", grade\)/);
assert.match(decisionRoute, /supabase\.rpc\("decide_excuse_letter",[\s\S]*?p_adviser_id: adviser\.id/);

// A Parent can create/list only for a linked student, with exactly one
// validated attachment. Parent status changes are delivered through the
// attendance invalidation already used by the attendance page.
assert.match(parentRoute, /validateSingleAttachment\(attachments\)/);
assert.match(parentRoute, /\.eq\("parent_id", parentId\)[\s\S]*?\.eq\("student_id", student_id\)/);
assert.match(parentRoute, /publishAttendanceRealtimeInvalidation\(\{ studentDbId: Number\(studentRow\.id\) \}\)/);
assert.match(decisionRoute, /publishAttendanceRealtimeInvalidation\(\{ studentId: decision\.student_id \}\)/);

// Browser requests explicitly retain the authenticated same-origin cookie.
assert.match(adviserPage, /\/api\/excuse-letters\/adviser\?\$\{params\.toString\(\)\}[\s\S]*?credentials: "same-origin"/);
assert.match(adviserPage, /method: "PATCH",[\s\S]*?credentials: "same-origin"/);
assert.match(parentPage, /fetch\("\/api\/excuse-letters", \{[\s\S]*?credentials: "same-origin"/);

console.log("excuse letter approval checks passed");
