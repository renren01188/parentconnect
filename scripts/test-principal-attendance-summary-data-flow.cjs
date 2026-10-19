/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
const manualAttendance = read("src/app/api/attendance/manual/route.ts");
const rfidAttendance = read("src/app/api/attendance/scan/route.ts");
const principalSummary = read("src/app/api/attendance/monthly-summary/route.ts");
const principalPage = read("src/app/dashboard/principal/AttendanceSummary/page.tsx");
const invalidation = read("src/lib/realtimeInvalidation.ts");

assert.match(adviserPage, /fetch\("\/api\/attendance\/manual"/, "Adviser manual entry must use the secured manual attendance endpoint.");
assert.match(adviserPage, /fetch\("\/api\/attendance\/scan"/, "Adviser RFID scans must use the secured scan endpoint.");

for (const [name, source] of [["manual attendance", manualAttendance], ["RFID attendance", rfidAttendance]]) {
  assert.match(source, /\.from\("attendance_logs"\)/, `${name} must write to the shared attendance table.`);
  assert.match(source, /student_db_id:\s*student\.id/, `${name} must preserve the student database key used by the Principal summary.`);
  assert.match(source, /attendance_date:\s*attendanceDate/, `${name} must save the attendance date used by the Principal summary.`);
  assert.match(source, /publishAttendanceRealtimeInvalidation\(\{ studentDbId: student\.id \}\)/, `${name} must notify the Principal after the durable row is saved.`);
}

assert.match(principalSummary, /\.from\("attendance_logs"\)/, "The Principal summary must read the shared attendance table.");
assert.match(principalSummary, /\.select\("id, student_db_id, attendance_date, time_logged, type, status"\)/, "The Principal summary must read the matching attendance fields.");
assert.match(principalSummary, /if \(log\.type && log\.type !== "Time In"\) continue/, "The Principal daily summary must use the Time In status once per student/day.");
assert.match(principalSummary, /\.gte\("attendance_date", validDays\[0\]\)/, "The Principal summary must constrain records to the selected month and valid school days.");
assert.match(principalSummary, /\(!activeSY \|\| \(date >= activeSY\.start_date && date <= activeSY\.end_date\)\)/, "The Summary must use the active school-year bounds when configured and fallback weekdays otherwise.");
assert.doesNotMatch(principalSummary, /parent_student_links/, "The Principal summary must not require a Parent link.");

assert.match(invalidation, /supabase\.from\("principals"\)\.select\("id"\)/, "Attendance changes must include active Principals as recipients.");
assert.match(principalPage, /\["attendance", "students", "dashboard"\]\.includes\(scope\)/, "The Principal page must refresh when attendance is saved.");
assert.match(principalPage, /\/api\/attendance\/monthly-summary/, "The Principal page must reload the shared attendance summary endpoint.");

console.log("Adviser/RFID to Principal attendance-summary data-flow checks passed.");
