/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const realtime = read("src/lib/realtimeInvalidation.ts");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const parentAttendance = read("src/app/dashboard/parent/attendance/page.tsx");
const parentNotifications = read("src/app/dashboard/parent/context/NotificationContext.tsx");

assert.match(realtime, /attendanceRecipientsForStudent/, "Attendance changes must resolve the linked Parent recipient.");
assert.match(realtime, /role: "parent" as const/, "Attendance recipients must include linked Parents.");
assert.match(realtime, /publishRealtimeInvalidation\(recipients, "attendance"\)/, "Attendance events must publish to the Parent's protected channel.");

for (const file of [
  "src/app/api/attendance/scan/route.ts",
  "src/app/api/attendance/manual/route.ts",
  "src/app/api/attendance/mark-absent/route.ts",
  "src/app/api/excuse-letters/route.ts",
  "src/app/api/excuse-letters/[id]/route.ts",
]) {
  assert.match(read(file), /publishAttendanceRealtimeInvalidation/, `${file} must publish the durable attendance change.`);
}

assert.match(parentDashboard, /useSessionInvalidation/);
assert.match(parentDashboard, /\["attendance", "reports", "notifications", "announcements", "staff-messages"\]/);
assert.match(parentAttendance, /useSessionInvalidation/);
assert.match(parentAttendance, /event\.scope === "attendance"/);
assert.match(parentAttendance, /fetchAttendance\(\{ background: true \}\)/);
assert.match(parentNotifications, /scope === "notifications" \|\| scope === "announcements" \|\| scope === "attendance"/);

console.log("Parent RFID and attendance Realtime coverage checks passed.");
