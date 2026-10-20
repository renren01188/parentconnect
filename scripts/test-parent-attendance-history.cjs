/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const parentHistory = read("src/app/api/attendance/parent-history/route.ts");
const parentAttendance = read("src/app/dashboard/parent/attendance/page.tsx");

// The API must use the active school year's explicit date range and page
// through every row rather than showing an all-time or response-capped total.
assert.match(parentHistory, /from\("school_year_config"\)[\s\S]*?\.eq\("is_active", true\)/);
assert.match(parentHistory, /Attendance is unavailable because no active school year is configured/);
assert.match(parentHistory, /\.gte\("attendance_date", activeSchoolYear\.start_date\)/);
assert.match(parentHistory, /\.lte\("attendance_date", activeSchoolYear\.end_date\)/);
assert.match(parentHistory, /ATTENDANCE_LOG_PAGE_SIZE/);
assert.match(parentHistory, /\.range\(from, from \+ ATTENDANCE_LOG_PAGE_SIZE - 1\)/);
assert.match(parentHistory, /schoolYear: \{/);
assert.match(parentHistory, /generatedAt: new Date\(\)\.toISOString\(\)/);

// An unavailable API is not attendance of zero. The page must fail visibly on
// initial load and keep its last verified snapshot during a live refresh.
assert.match(parentAttendance, /if \(!attRes\.ok \|\| !attData\?\.success\)/);
assert.match(parentAttendance, /Live update could not be loaded\. Showing the last verified records\./);
assert.match(parentAttendance, /hasAttendanceRecords/);
assert.match(parentAttendance, /No attendance records yet/);
assert.match(parentAttendance, /Days Attended/);
assert.match(parentAttendance, /Last updated:/);

// Parent attendance responds to protected Realtime attendance events, while a
// visible-only refresh recovers safely if a browser misses a websocket event.
assert.match(parentAttendance, /useSessionInvalidation/);
assert.match(parentAttendance, /event\.scope === "attendance"[\s\S]*?scheduleAttendanceRefresh\(\)/);
assert.match(parentAttendance, /useVisibleRefresh\(\(\) => fetchAttendance\(\{ background: true \}\)\)/);

// Every attendance mutation that can change a parent's facts must emit the
// protected attendance invalidation consumed by the page above.
for (const file of [
  "src/app/api/attendance/scan/route.ts",
  "src/app/api/attendance/edit/route.ts",
  "src/app/api/attendance/manual/route.ts",
  "src/app/api/attendance/mark-absent/route.ts",
  "src/app/api/attendance/process-absences/route.ts",
  "src/app/api/excuse-letters/route.ts",
  "src/app/api/excuse-letters/[id]/route.ts",
]) {
  assert.match(read(file), /publishAttendanceRealtimeInvalidation/, `${file} must update the linked parent in Realtime.`);
}

console.log("Parent attendance history accuracy and live-update checks passed.");
