/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const route = read("src/app/api/attendance/history/route.ts");
const page = read("src/app/dashboard/adviser/attendance/page.tsx");
const migration = read("supabase/migrations/20261022113000_snapshot_attendance_student_scope.sql");

assert.match(route, /isValidDateOnly\(date\)/, "History must reject invalid date query values.");
assert.match(route, /student_grade_snapshot, student_section_snapshot/, "History must read the recorded adviser scope.");
assert.match(route, /eq\("student_section_snapshot", activeSection\)/, "History must scope records by the recorded section.");
assert.match(route, /eq\("student_grade_snapshot", adviser\.grade\)/, "History must scope records by the recorded grade.");
assert.match(route, /eq\("archive_status", "active"\)/, "No-record roster rows must be limited to active students.");
assert.match(route, /historyStudentsById/, "Students with historical logs must remain available in History.");
assert.doesNotMatch(route, /sectionSessionByKey/, "History must not discard records based on a section's current session assignment.");
assert.match(route, /stats: \{ total: summary\.length/, "History totals must include retained historical rows.");

assert.match(page, /historyRequestRef\.current\?\.abort\(\)/, "Changing dates must cancel the prior History request.");
assert.match(page, /historyRequestRef\.current !== controller/, "A stale History response must not replace the selected date's data.");

assert.match(migration, /student_grade_snapshot text/);
assert.match(migration, /student_section_snapshot text/);
assert.match(migration, /capture_attendance_student_scope/);
assert.match(migration, /BEFORE INSERT ON public\.attendance_logs/);

console.log("Adviser attendance History coverage checks passed.");
