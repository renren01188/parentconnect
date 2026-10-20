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
const decisionMigration = read("supabase/migrations/20261020110000_fix_excuse_letter_decision_rpc.sql");
const manualExcuseMigration = read("supabase/migrations/20261020130000_add_manual_excuse_range_processing.sql");

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
assert.match(decisionMigration, /CREATE OR REPLACE FUNCTION public\.decide_excuse_letter/);
assert.match(decisionMigration, /SELECT excuse_letter\.\*/);
assert.match(decisionMigration, /WHERE excuse_letter\.id = p_letter_id/);
assert.match(decisionMigration, /UPDATE public\.excuse_letters AS excuse_letter/);
assert.match(decisionMigration, /WHERE attendance_log\.student_db_id = v_student\.id/);
assert.match(decisionMigration, /FOR UPDATE/, "The pending letter must be locked while it is decided.");
assert.match(decisionMigration, /SECURITY DEFINER/);
assert.match(decisionMigration, /GRANT EXECUTE ON FUNCTION public\.decide_excuse_letter\(bigint, bigint, text, text\)\s+TO service_role/);
assert.match(manualExcuseMigration, /PERFORM public\.decide_excuse_letter\(/, "Manual Excused must reuse the approval-modal decision routine.");

// A Parent can create/list only for a linked student. An attachment is
// optional, but a supplied attachment is still validated. Parent status
// changes are delivered through the attendance invalidation already used by
// the attendance page.
assert.match(parentRoute, /validateOptionalAttachment\(attachments\)/);
assert.match(parentRoute, /if \(value === undefined \|\| value === null\) return null/);
assert.match(parentRoute, /value\.length > 1/);
assert.match(parentRoute, /file_name: attachment\?\.file_name \?\? null/);
assert.match(parentRoute, /\.eq\("parent_id", parentId\)[\s\S]*?\.eq\("student_id", student_id\)/);
assert.match(parentRoute, /publishAttendanceRealtimeInvalidation\(\{ studentDbId: Number\(studentRow\.id\) \}\)/);
assert.match(decisionRoute, /publishAttendanceRealtimeInvalidation\(\{ studentId: decision\.student_id \}\)/);

// Browser requests explicitly retain the authenticated same-origin cookie.
assert.match(adviserPage, /\/api\/excuse-letters\/adviser\?\$\{params\.toString\(\)\}[\s\S]*?credentials: "same-origin"/);
assert.match(adviserPage, /method: "PATCH",[\s\S]*?credentials: "same-origin"/);
assert.match(parentPage, /fetch\("\/api\/excuse-letters", \{[\s\S]*?credentials: "same-origin"/);
assert.match(parentPage, /Attachment <span className="font-medium text-slate-400">\(optional\)<\/span>/);
assert.doesNotMatch(parentPage, /checked=\{accepted\}/);
assert.doesNotMatch(parentPage, /attachments\.length > 0 && !attachmentError/);

console.log("excuse letter approval checks passed");
