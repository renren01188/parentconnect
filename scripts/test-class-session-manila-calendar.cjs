const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routePath = path.join(__dirname, "..", "src", "app", "api", "attendance", "class-session", "route.ts");
const route = fs.readFileSync(routePath, "utf8");

function isWeekendForCalendarDate(date) {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

assert.equal(isWeekendForCalendarDate("2026-10-19"), false);
assert.equal(isWeekendForCalendarDate("2026-10-17"), true);
assert.equal(isWeekendForCalendarDate("2026-10-18"), true);

assert.ok(route.includes('timeZone: "Asia/Manila"'));
assert.ok(route.includes("Date.UTC(year, month - 1, dayOfMonth)).getUTCDay()"));
assert.ok(!route.includes("T00:00:00+08:00`).getDay()"));

console.log("Class session Manila calendar checks passed.");
