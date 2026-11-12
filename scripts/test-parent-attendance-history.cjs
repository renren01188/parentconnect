/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const parentHistory = read("src/app/api/attendance/parent-history/route.ts");
const parentAttendance = read("src/app/dashboard/parent/attendance/page.tsx");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const adviserNotifications = read("src/app/api/adviser/notifications/route.ts");

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
assert.match(parentHistory, /isScheduledAttendanceDate/);
assert.match(parentHistory, /school_holidays/);
assert.match(parentHistory, /class_sessions/);
assert.match(parentHistory, /getTodayClassSchedule/);
assert.match(parentHistory, /todaySchedule: \{/);
assert.match(parentHistory, /todayClassStatus: todayClassSchedule\.hasClassToday \? "Scheduled" : "No Class For Today"/);
assert.match(parentDashboard, /data\.todayClassStatus !== "No Class For Today"/);
assert.match(parentDashboard, /No Class For Today/);

// An automatic Absent Time Out confirms that the learner never checked out.
// The Parent retains the actual Time In but must not see an invented Time Out
// or an RFID-verified "at school" banner. Both Parent and Adviser feeds must
// include the recorded arrival time in their missing-Time-Out explanation.
assert.match(parentHistory, /missing_time_out: boolean/);
assert.match(parentHistory, /const isAutomaticMissingTimeOut = log\.status === "Absent" && log\.via === "Auto"/);
assert.match(parentDashboard, /missingTimeOut: boolean/);
assert.match(parentDashboard, /was marked absent today because no Time Out was recorded/);
assert.match(parentDashboard, /No Time Out recorded/);
assert.match(parentNotifications, /Attendance Alert: Missing Time Out/);
assert.match(parentNotifications, /because no Time Out was recorded after checking in at/);
assert.match(adviserNotifications, /const timeInByStudentId = new Map<string, string>\(\)/);
assert.match(adviserNotifications, /checked in at \$\{attendanceTimeLabel\(timeIn\)\} but has no Time Out recorded/);

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
