const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const settings = read("src/lib/attendanceNotificationSettings.ts");
const settingsRoute = read("src/app/api/ict/attendance-notification-settings/route.ts");
const creditsRoute = read("src/app/api/ict/attendance-notification-settings/credits/route.ts");
const scanRoute = read("src/app/api/attendance/scan/route.ts");
const parentPreferencesRoute = read("src/app/api/parents/attendance-notification-preferences/route.ts");
const parentNotificationsRoute = read("src/app/api/parents/notifications/route.ts");
const parentProfile = read("src/app/dashboard/parent/profile/page.tsx");
const smsQueue = read("src/lib/attendanceSmsQueue.ts");
const emailQueue = read("src/lib/attendanceEmailQueue.ts");
const parentEnrollment = read("src/lib/parentEnrollment.ts");
const verifyTempPassword = read("src/app/api/parents/verify-temp-password/route.ts");
const parentPreferenceMigration = read("supabase/migrations/20261020140000_default_parent_attendance_notifications_to_sms.sql");

// A freshly deployed database can have the table before it has the singleton
// row. Reads and saves must create the defaults without overwriting ICT data.
assert.match(settings, /initializeAttendanceNotificationSettings/);
assert.match(settings, /\.upsert\([\s\S]*?id: true[\s\S]*?ignoreDuplicates: true/);
assert.match(settings, /if \(!data\) return initializeAttendanceNotificationSettings\(\)/);
assert.match(settingsRoute, /await initializeAttendanceNotificationSettings\(\);/);
assert.match(creditsRoute, /await initializeAttendanceNotificationSettings\(\);/);

// The UI receives an actionable, secret-free message when Vercel lacks the
// Semaphore credential. The provider key itself is never returned.
assert.match(creditsRoute, /SEMAPHORE_API_KEY to the server environment/);
assert.doesNotMatch(creditsRoute, /process\.env\.SEMAPHORE_API_KEY/);

// Parent delivery allows Email, SMS, or Neither. The server enforces the same
// rule as the radio UI, so a crafted request cannot create a "Both" preference.
assert.match(parentPreferencesRoute, /if \(body\.emailEnabled && body\.smsEnabled\)/);
assert.match(parentPreferencesRoute, /type AttendancePreference = "SMS" \| "Email" \| "Neither"/);
assert.match(parentPreferencesRoute, /attendance_notification_preference: preference/);
assert.match(parentPreferencesRoute, /attendance_email_notifications === null[\s\S]*?attendance_sms_notifications === null/);
assert.match(parentPreferencesRoute, /attendance_email_notifications: false,[\s\S]*?attendance_sms_notifications: true,[\s\S]*?attendance_notification_preference: "SMS"/);
assert.match(parentProfile, /saveNotificationPreferences\(true, false\)/);
assert.match(parentProfile, /saveNotificationPreferences\(false, true\)/);
assert.match(parentProfile, /saveNotificationPreferences\(false, false\)/);
assert.match(parentProfile, /setEmailNotif\]\s*=\s*useState\(false\)/);
assert.match(parentProfile, /setSmsNotif\]\s*=\s*useState\(true\)/);
assert.doesNotMatch(parentProfile, /<Toggle/);
assert.match(smsQueue, /attendance_sms_notifications/);
assert.match(emailQueue, /attendance_email_notifications/);

// New Parent creation has the same durable default across both enrollment
// flows. The migration only marks existing stored combinations, preserving
// an existing Email or Neither choice rather than overwriting it with SMS.
assert.match(parentEnrollment, /attendance_email_notifications: false,[\s\S]*?attendance_sms_notifications: true,[\s\S]*?attendance_notification_preference: "SMS"/);
assert.match(verifyTempPassword, /attendance_email_notifications: false,[\s\S]*?attendance_sms_notifications: true,[\s\S]*?attendance_notification_preference: "SMS"/);
assert.match(parentPreferenceMigration, /ALTER COLUMN attendance_email_notifications SET DEFAULT false/);
assert.match(parentPreferenceMigration, /ALTER COLUMN attendance_sms_notifications SET DEFAULT true/);
assert.match(parentPreferenceMigration, /WHEN attendance_email_notifications = true[\s\S]*?THEN 'Email'/);
assert.match(parentPreferenceMigration, /WHEN attendance_email_notifications = false[\s\S]*?attendance_sms_notifications = false THEN 'Neither'/);

// Every RFID tap receives an initial post-response send attempt; it no longer
// depends on an external Cron route for SMS or email delivery.
assert.match(scanRoute, /await enqueueAttendanceSms\(input\);[\s\S]*?await processAttendanceSmsJobs\(\{ attendanceLogId: input\.attendanceLogId/);
assert.match(scanRoute, /await enqueueAttendanceEmail\(input\);[\s\S]*?await processAttendanceEmailJobs\(\{ attendanceLogId: input\.attendanceLogId/);
assert.doesNotMatch(scanRoute, /SCHEDULED_ATTENDANCE_SMS_WORKER/);
assert.doesNotMatch(scanRoute, /SCHEDULED_ATTENDANCE_EMAIL_WORKER/);

// The in-app feed must show every attendance event independently from the
// optional external SMS/email channels. A parent can be linked through the
// multi-student table or an older parents.student_id record, but never by an
// unrelated student's attendance log.
assert.match(parentNotificationsRoute, /from\("parent_student_links"\)[\s\S]*?\.eq\("parent_id", session\.id\)/);
assert.match(parentNotificationsRoute, /from\("parents"\)[\s\S]*?\.select\("student_id"\)[\s\S]*?\.eq\("id", session\.id\)/);
assert.match(parentNotificationsRoute, /\.in\("student_id", linkedStudentIds\)/);
assert.match(parentNotificationsRoute, /select\("id, student_id, attendance_date, time_logged, type, status, via"\)/);
assert.match(parentNotificationsRoute, /function attendanceNotificationCopy/);
assert.match(parentNotificationsRoute, /Attendance Time In/);
assert.match(parentNotificationsRoute, /Attendance Time Out/);
assert.doesNotMatch(parentNotificationsRoute, /\.eq\("status", "Absent"\)/);

console.log("Attendance notification initialization and RFID SMS dispatch checks passed.");
