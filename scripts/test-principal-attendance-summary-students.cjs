/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const route = read("src/app/api/attendance/monthly-summary/route.ts");
const page = read("src/app/dashboard/principal/AttendanceSummary/page.tsx");
const createStudent = read("src/app/api/students/route.ts");
const importStudents = read("src/app/api/students/import/route.ts");
const invalidation = read("src/lib/realtimeInvalidation.ts");

assert.match(route, /function isVisibleStudent/, "The summary must explicitly include non-archived students.");
assert.match(route, /return status !== "archived" && status !== "deleted"/, "Only explicitly archived or deleted students may be excluded.");
assert.doesNotMatch(route, /\.eq\("archive_status", "active"\)/, "Legacy imports with a null archive status must not be hidden.");
assert.match(route, /const rangeStart = startDate \?\?/, "An absent school-year configuration must fall back to the selected calendar year's first date.");
assert.match(route, /const rangeEnd = endDate \?\?/, "An absent school-year configuration must fall back to the selected calendar year's last date.");
assert.match(route, /isScheduledAttendanceDate\(dateStr, rangeStart, rangeEnd, attendanceWeekdays\)/, "Fallback dates must still honor the configured weekday schedule.");
assert.match(route, /activeFrom <= summaryPeriodEnd/, "Students added after the selected month must remain excluded from historical data.");
assert.match(route, /summarySections\.set\(key, \{ key, grade: student\.grade\.trim\(\), name: student\.section!\.trim\(\) \}\)/, "Imported assignments missing from the sections catalog must still be displayed.");
assert.doesNotMatch(route, /parent_student_links/, "The Principal attendance roster must not require a Parent link.");
assert.doesNotMatch(route, /\.from\("parents"\)/, "The Principal attendance roster must not join parents.");

assert.match(page, /useSessionInvalidation/, "The summary page must subscribe to protected dashboard updates.");
assert.match(page, /"students"/, "The summary page must refresh when students are added or imported.");
assert.match(createStudent, /publishStudentRealtimeInvalidation/, "Manual student creation must notify principal rosters.");
assert.match(importStudents, /publishStudentsRealtimeInvalidation/, "Student import must notify principal rosters.");
assert.match(invalidation, /principals\.data/, "Student roster invalidation must target active principals.");

console.log("Principal attendance roster coverage checks passed.");
