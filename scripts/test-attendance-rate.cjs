const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  attendedDayCount,
  calculateAttendanceRate,
  isAttendedAttendanceStatus,
  isAttendanceRateEligibleStatus,
} = require("../src/lib/attendanceRate.cjs");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

assert.equal(isAttendedAttendanceStatus("Present"), true);
assert.equal(isAttendedAttendanceStatus("On Time"), true);
assert.equal(isAttendedAttendanceStatus("Late"), true);
assert.equal(isAttendedAttendanceStatus("Absent"), false);
assert.equal(isAttendedAttendanceStatus("Excused"), false);

assert.equal(isAttendanceRateEligibleStatus("Present"), true);
assert.equal(isAttendanceRateEligibleStatus("Late"), true);
assert.equal(isAttendanceRateEligibleStatus("Absent"), true);
assert.equal(isAttendanceRateEligibleStatus("Excused"), false);

assert.equal(attendedDayCount({ present: 2, late: 1 }), 3);
assert.equal(calculateAttendanceRate({ present: 1, late: 1, absent: 1 }), 66.7);
assert.equal(calculateAttendanceRate({ present: 0, late: 1, absent: 0 }), 100);
assert.equal(calculateAttendanceRate({ present: 0, late: 0, absent: 1 }), 0);
assert.equal(calculateAttendanceRate({ present: 0, late: 0, absent: 0 }), 0);
assert.equal(calculateAttendanceRate({ present: 1, late: 0, absent: 0, excused: 4 }), 100);

const parentAttendance = read("src/app/dashboard/parent/attendance/page.tsx");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const adviserStudentsApi = read("src/app/api/students/route.ts");
const principalDashboardApi = read("src/app/api/principal/dashboard/route.ts");

assert.match(parentAttendance, /calculateAttendanceRate\(/, "Parent Attendance must use the shared attendance-rate rule.");
assert.match(parentAttendance, /attendedDayCount\(/, "Parent Attendance total days must include late arrivals.");
assert.match(parentDashboard, /calculateAttendanceRate\(/, "Parent dashboard must use the shared attendance-rate rule.");
assert.match(parentDashboard, /attendedDayCount\(/, "Parent dashboard days present must include late arrivals.");
assert.match(adviserStudentsApi, /isAttendedAttendanceStatus\(log\.status\)/, "Adviser student rates must count Late as attended.");
assert.match(principalDashboardApi, /isAttendedAttendanceStatus\(record\.status\)/, "Principal attendance percentage must use the shared attended-status rule.");

console.log("Attendance-rate rules passed: Present and Late attended; Absent counted; Excused neutral; no records 0%.");
