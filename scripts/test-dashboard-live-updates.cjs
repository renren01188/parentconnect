const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const sessionInvalidation = read("src/hooks/useSessionInvalidation.ts");
const invalidationSubscription = read("src/lib/subscribeRealtimeInvalidations.ts");
const reportsRealtime = read("src/hooks/useReportMessagesRealtime.ts");
const staffRealtime = read("src/hooks/useStaffMessagesRealtime.ts");
const realtime = read("src/lib/realtimeInvalidation.ts");

assert.match(sessionInvalidation, /const listeners = new Set/);
assert.match(invalidationSubscription, /\.channel\(data\.topic\)/);
assert.match(sessionInvalidation, /removeChannel\(current\)/);
assert.match(sessionInvalidation, /stopSharedChannelWhenUnused/);
assert.match(reportsRealtime, /useSessionInvalidation/);
assert.match(staffRealtime, /useSessionInvalidation/);
assert.match(realtime, /A browser receiving one must\s+\*\s+re-read its normal, server-authorized API view/);
assert.match(realtime, /publishAttendanceRealtimeInvalidation/);
assert.match(realtime, /publishAccountRealtimeInvalidation/);

for (const file of [
  "src/app/dashboard/parent/reports/page.tsx",
  "src/app/dashboard/adviser/reports/page.tsx",
  "src/app/dashboard/guidance/reports/page.tsx",
  "src/app/dashboard/principal/reports/page.tsx",
]) {
  assert.match(read(file), /useReportMessagesRealtime/, `${file} must receive report/message updates through the shared channel.`);
}

for (const file of [
  "src/app/dashboard/adviser/contact-ict/page.tsx",
  "src/app/dashboard/guidance/contact-ict/page.tsx",
  "src/app/dashboard/principal/contact-ict/page.tsx",
  "src/app/dashboard/ict/inbox/page.tsx",
]) {
  assert.match(read(file), /useStaffMessagesRealtime/, `${file} must receive staff-message updates through the shared channel.`);
}

for (const file of [
  "src/app/dashboard/parent/page.tsx",
  "src/app/dashboard/adviser/page.tsx",
  "src/app/dashboard/guidance/page.tsx",
  "src/app/dashboard/ict/page.tsx",
  "src/app/dashboard/principal/page.tsx",
  "src/app/dashboard/parent/attendance/page.tsx",
  "src/app/dashboard/adviser/attendance/page.tsx",
  "src/app/dashboard/ict/user-management/page.tsx",
]) {
  assert.match(read(file), /useSessionInvalidation/, `${file} must refresh its changing dashboard data through the shared channel.`);
}

const parentNotifications = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const adviserNotifications = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const principalAttendance = read("src/app/dashboard/principal/AttendanceSummary/page.tsx");
const ictDashboard = read("src/app/dashboard/ict/page.tsx");
const guidanceDashboard = read("src/app/dashboard/guidance/page.tsx");
const userManagement = read("src/app/dashboard/ict/user-management/page.tsx");

assert.match(parentNotifications, /scope === "attendance"/, "Parent notification counts must refresh for attendance writes.");
assert.match(adviserNotifications, /scope === "attendance"/, "Adviser notification views must refresh for attendance writes.");
assert.match(principalAttendance, /useSessionInvalidation/);
assert.match(principalAttendance, /\["attendance", "students", "dashboard"\]/);
assert.match(principalAttendance, /useDebouncedRealtimeRefresh/);
assert.match(ictDashboard, /\["accounts", "students", "audit", "announcements", "dashboard"\]/);
assert.match(ictDashboard, /useDebouncedRealtimeRefresh/);
assert.match(guidanceDashboard, /\["reports", "tickets", "audit"\]/);
assert.match(guidanceDashboard, /useDebouncedRealtimeRefresh/);
assert.match(userManagement, /event\.scope === "accounts" \|\| event\.scope === "students" \|\| event\.scope === "audit"/);

for (const file of [
  "src/app/api/reports/parent-adviser/[id]/messages/route.ts",
  "src/app/api/reports/parent-adviser/[id]/status/route.ts",
  "src/app/api/reports/guidance/[id]/status/route.ts",
  "src/app/api/reports/principal/[id]/status/route.ts",
]) {
  assert.match(read(file), /publishReportRealtimeInvalidation/, `${file} must invalidate its role-scoped report view after a write.`);
}

for (const file of [
  "src/app/api/reports/staff-messages/route.ts",
  "src/app/api/adviser-ict/messages/route.ts",
  "src/app/api/guidance-ict/messages/route.ts",
  "src/app/api/principal-ict/messages/route.ts",
]) {
  assert.match(read(file), /publishStaffMessagesRealtimeInvalidation|publishStaffMessageRealtimeInvalidation|publishRealtimeInvalidation/, `${file} must invalidate both sides of a staff conversation after a write.`);
}

for (const file of [
  "src/app/api/attendance/scan/route.ts",
  "src/app/api/attendance/manual/route.ts",
  "src/app/api/attendance/mark-absent/route.ts",
]) {
  assert.match(read(file), /publishAttendanceRealtimeInvalidation/, `${file} must invalidate linked attendance views after a write.`);
}

assert.match(read("src/app/api/ict/user-management/route.ts"), /publishAccountRealtimeInvalidation/);
assert.match(read("src/app/api/ict/user-management/route.ts"), /publishStudentRealtimeInvalidation/);
assert.match(read("src/app/api/students/route.ts"), /publishStudentRealtimeInvalidation/);
assert.match(read("src/app/api/students/route.ts"), /publishRealtimeInvalidation/);
assert.match(read("src/app/api/excuse-letters/route.ts"), /publishAttendanceRealtimeInvalidation/);

console.log("Dashboard live-update coverage checks passed.");
