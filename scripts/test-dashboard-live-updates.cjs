/* eslint-disable @typescript-eslint/no-require-imports */
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
assert.match(invalidationSubscription, /credentials: "same-origin"/);
assert.match(sessionInvalidation, /removeChannel\(current\)/);
assert.match(sessionInvalidation, /stopSharedChannelWhenUnused/);
assert.match(sessionInvalidation, /listeners\.size === 0 \|\| connecting \|\| channel/);
assert.match(sessionInvalidation, /channel && lastConnectionStatus === "SUBSCRIBED"/);
assert.match(sessionInvalidation, /listener\(reconnectRefresh\)/);
assert.match(reportsRealtime, /useSessionInvalidation/);
assert.match(staffRealtime, /useSessionInvalidation/);
assert.match(realtime, /A browser receiving one must\s+\*\s+re-read its normal, server-authorized API view/);
assert.match(realtime, /publishAttendanceRealtimeInvalidation/);
assert.match(realtime, /publishAccountRealtimeInvalidation/);
assert.match(realtime, /publishStudentsRealtimeInvalidation/);
assert.match(realtime, /studentRealtimeRecipientsForStudents/);
assert.match(realtime, /if \(!options\.sessionRevoked\) \{[\s\S]*?publishRealtimeInvalidation\(\[\.\.\.ictRecipients, \.\.\.targets\], "accounts"\)/);

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
assert.match(principalAttendance, /!scope \|\| \["attendance", "students", "dashboard"\]/);
assert.match(principalAttendance, /useDebouncedRealtimeRefresh/);
assert.match(ictDashboard, /\["accounts", "students", "audit", "announcements", "dashboard"\]/);
assert.match(ictDashboard, /useDebouncedRealtimeRefresh/);
assert.match(guidanceDashboard, /\["reports", "tickets", "audit"\]/);
assert.match(guidanceDashboard, /useDebouncedRealtimeRefresh/);
assert.match(userManagement, /!event\.scope \|\| event\.scope === "accounts" \|\| event\.scope === "students" \|\| event\.scope === "audit"/);

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
assert.match(realtime, /publishStudentRealtimeInvalidation[\s\S]*?recipientsForRoles\(\["ict"\]\)/);
assert.match(read("src/app/api/excuse-letters/route.ts"), /publishAttendanceRealtimeInvalidation/);

// Shared operational changes must wake every affected dashboard even when the
// user is not on the feature page that performed the write.
const classSessionRoute = read("src/app/api/attendance/class-session/route.ts");
const schoolYearRoute = read("src/app/api/school-year/route.ts");
const studentImportRoute = read("src/app/api/students/import/route.ts");
const scheduledDeletionRoute = read("src/app/api/scheduled-deletions/route.ts");
const studentProfiles = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
assert.match(classSessionRoute, /recipientsForRoles\(\["parent"\]\)/);
assert.match(classSessionRoute, /publishRealtimeInvalidation\(parentRecipients, "attendance"\)/);
assert.match(schoolYearRoute, /publishSchoolYearRealtimeInvalidation/);
assert.match(studentImportRoute, /publishStudentsRealtimeInvalidation/);
assert.match(studentImportRoute, /publishAccountRealtimeInvalidation/);
assert.match(read("src/app/api/student-reports/route.ts"), /publishStudentReportsRealtimeInvalidation/);
assert.match(read("src/app/api/student-reports/[id]/status/route.ts"), /publishStudentReportsRealtimeInvalidation/);
assert.match(read("src/app/api/subject-teacher-reports/route.ts"), /publishReportRealtimeInvalidation/);
assert.match(read("src/app/dashboard/principal/reports/page.tsx"), /onStudentReportUpdate: loadPrincipalReports/);
assert.match(scheduledDeletionRoute, /publishScheduledDeletionInvalidations/);
assert.match(scheduledDeletionRoute, /publishAccountRealtimeInvalidation\(targets\)/);
assert.match(scheduledDeletionRoute, /publishRealtimeInvalidation\(parentTargets, "notifications"\)/);
assert.match(studentProfiles, /function ClassControlModal[\s\S]*?scope === "dashboard"[\s\S]*?sessionRefreshKey/);

for (const file of [
  "src/app/api/principal/notifications/read/route.ts",
  "src/app/api/guidance/notifications/read/route.ts",
  "src/app/api/ict/notifications/read/route.ts",
]) {
  assert.match(read(file), /publishRealtimeInvalidation/, `${file} must synchronize persisted read state across the user's open tabs.`);
}

// Adviser layout and roster views must refresh their own authorized snapshots
// after account or student changes, not only their sidebar summaries.
const adviserNotificationContext = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const adviserSidebar = read("src/app/dashboard/adviser/components/Sidebar.tsx");
const adviserStudentsPage = read("src/app/dashboard/adviser/students/page.tsx");
const adviserStudentDetail = read("src/app/dashboard/adviser/students/[id]/page.tsx");
const adviserTransferPage = read("src/app/dashboard/adviser/transfer-level/page.tsx");
const adviserAttendancePage = read("src/app/dashboard/adviser/attendance/page.tsx");
const guidanceNotificationContext = read("src/app/dashboard/guidance/context/NotificationContext.tsx");
const guidanceNotificationsPage = read("src/app/dashboard/guidance/notifications/page.tsx");
const guidanceSidebar = read("src/app/dashboard/guidance/components/Sidebar.tsx");
const guidanceProfilePage = read("src/app/dashboard/guidance/profile/page.tsx");

assert.match(adviserNotificationContext, /scope === "accounts"[\s\S]*?adviser-profile-updated/);
assert.match(adviserSidebar, /fetch\("\/api\/adviser\/me", \{ cache: "no-store" \}\)/);
assert.match(adviserStudentsPage, /const scheduleStudentsRefresh = useDebouncedRealtimeRefresh\([\s\S]*?fetchStudents\(page, \{ background: true \}\)/);
assert.match(adviserStudentsPage, /!event\.scope \|\| event\.scope === "students" \|\| event\.scope === "accounts"[\s\S]*?scheduleStudentsRefresh\(\)/);
assert.match(adviserStudentDetail, /useSessionInvalidation/);
assert.match(adviserStudentDetail, /liveUpdatePending/);
assert.match(adviserStudentDetail, /void loadStudent\(\{ background: true \}\)/);
assert.match(adviserTransferPage, /const scheduleTransferRosterRefresh = useDebouncedRealtimeRefresh\([\s\S]*?fetchStudents\(page, \{ background: true \}\)/);
assert.match(adviserTransferPage, /!event\.scope \|\| event\.scope === "students" \|\| event\.scope === "accounts"[\s\S]*?scheduleTransferRosterRefresh\(\)/);
assert.match(adviserAttendancePage, /event\.scope === "students" \|\| event\.scope === "accounts"\) \{[\s\S]*?scheduleStudentsRefresh\(\);[\s\S]*?scheduleAttendanceRefresh\(\);/);

// Guidance tickets are notifications as well as workload items. Account
// approvals must refresh the persistent Sidebar profile without clobbering a
// Profile settings draft; the deferred snapshot is loaded once it closes.
assert.match(guidanceNotificationContext, /if \(scope === "tickets"\) \{[\s\S]*?Promise\.all\(\[refreshGuidanceCounts\(\), refreshNotificationCounts\(\)\]\)/);
assert.match(guidanceNotificationsPage, /scope === "tickets"/);
assert.match(guidanceNotificationContext, /scope === "accounts"[\s\S]*?guidance-profile-updated/);
assert.match(guidanceSidebar, /guidance-profile-updated/);
assert.match(guidanceProfilePage, /pendingAccountRefreshRef/);
assert.match(guidanceProfilePage, /if \(settingsOpen\) \{[\s\S]*?pendingAccountRefreshRef\.current = true/);
assert.match(guidanceProfilePage, /if \(settingsOpen \|\| !pendingAccountRefreshRef\.current\) return;[\s\S]*?setProfileRefreshKey/);

// A page can mount just after login while the layout is already joining its
// authorized Realtime topic. Every independently loaded, changing view must
// accept the scope:null recovery event, rather than waiting for a second
// mutation or a browser refresh.
const freshLoginRecoveryPages = [
  "src/app/dashboard/parent/page.tsx",
  "src/app/dashboard/parent/attendance/page.tsx",
  "src/app/dashboard/parent/profile/page.tsx",
  "src/app/dashboard/parent/ParentSessionGate.tsx",
  "src/app/dashboard/adviser/page.tsx",
  "src/app/dashboard/adviser/attendance/page.tsx",
  "src/app/dashboard/adviser/students/page.tsx",
  "src/app/dashboard/adviser/students/[id]/page.tsx",
  "src/app/dashboard/adviser/transfer-level/page.tsx",
  "src/app/dashboard/adviser/profile/page.tsx",
  "src/app/dashboard/guidance/profile/page.tsx",
  "src/app/dashboard/principal/page.tsx",
  "src/app/dashboard/principal/AttendanceSummary/page.tsx",
  "src/app/dashboard/principal/audit-trail/page.tsx",
  "src/app/dashboard/principal/profile/page.tsx",
  "src/app/dashboard/ict/user-management/page.tsx",
  "src/app/dashboard/ict/StudentProfiles/page.tsx",
  "src/app/dashboard/ict/audit-trail/page.tsx",
  "src/app/dashboard/ict/profile/page.tsx",
  "src/app/dashboard/ict/user-management/create-user/page.tsx",
];
for (const file of freshLoginRecoveryPages) {
  assert.match(read(file), /!event\.scope|!scope|event\.scope &&/, `${file} must reconcile its initial snapshot after a shared-channel join.`);
}

console.log("Dashboard live-update coverage checks passed.");
