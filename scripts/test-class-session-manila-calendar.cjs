const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const attendanceGuardRoutes = [
  ["attendance", "class-session", "route.ts"],
  ["attendance", "scan", "route.ts"],
  ["attendance", "manual", "route.ts"],
  ["attendance", "mark-absent", "route.ts"],
  ["students", "route.ts"],
];
const schoolCalendar = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "schoolCalendar.ts"), "utf8");

function isWeekendForCalendarDate(date) {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

assert.equal(isWeekendForCalendarDate("2026-10-19"), false);
assert.equal(isWeekendForCalendarDate("2026-10-17"), true);
assert.equal(isWeekendForCalendarDate("2026-10-18"), true);

assert.ok(schoolCalendar.includes("Date.UTC(year, month - 1, day)"));
assert.ok(schoolCalendar.includes("getUTCDay()"));

for (const segments of attendanceGuardRoutes) {
  const routePath = path.join(__dirname, "..", "src", "app", "api", ...segments);
  const route = fs.readFileSync(routePath, "utf8");
  assert.ok(route.includes("isScheduledAttendanceDate"), routePath);
  assert.ok(!route.includes("T00:00:00+08:00`).getDay()"), routePath);
}

console.log("Class session Manila calendar checks passed.");
