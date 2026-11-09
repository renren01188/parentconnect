/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const reportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const reportsRoute = read("src/app/api/reports/parent-adviser/route.ts");
const guidanceTicketsRoute = read("src/app/api/reports/guidance/tickets/route.ts");
const guidanceDashboardRoute = read("src/app/api/guidance/dashboard/route.ts");

// Existing reports retain their stored name only as a fallback. The current
// Student Profile row is the display source for every normal report read.
assert.match(reportMapper, /export async function withCurrentStudentNames/);
assert.match(reportMapper, /\.from\("students"\)[\s\S]*?select\("student_id, first_name, middle_name, last_name, suffix"\)[\s\S]*?\.in\("student_id", studentIds\)/);
assert.match(reportMapper, /student_name: currentName/);
assert.match(reportMapper, /return currentName \? \{ \.\.\.row, student_name: currentName \} as T : row/);

// The shared Parent, Adviser, Guidance, and Principal report endpoint applies
// the live identity overlay before producing either summaries or details.
assert.match(reportsRoute, /async function resolveCurrentReportIdentities/);
assert.match(reportsRoute, /return withCurrentStudentNames\(parentResolvedRows\)/);
assert.equal((reportsRoute.match(/resolveCurrentReportIdentities\(/g) ?? []).length, 5);

// Guidance's separate ticket list uses the same display source.
assert.match(guidanceTicketsRoute, /withCurrentStudentNames/);
assert.match(guidanceTicketsRoute, /const currentStudentReports = await withCurrentStudentNames\(reports \?\? \[\]\)/);

// The Guidance landing dashboard has its own lightweight report query. It
// must use the same display overlay instead of a stale submission-time name.
assert.match(guidanceDashboardRoute, /withCurrentStudentNames/);
assert.match(guidanceDashboardRoute, /const reports = await withCurrentStudentNames\(\(allReports \?\? \[\]\) as GuidanceReportRow\[\]\)/);

for (const route of [
  "src/app/api/reports/parent-adviser/[id]/status/route.ts",
  "src/app/api/reports/guidance/[id]/status/route.ts",
  "src/app/api/reports/principal/[id]/status/route.ts",
]) {
  assert.match(read(route), /withCurrentStudentNames/, `${route} should return the current student name after a status update.`);
}

console.log("current student name report mapping checks passed");
