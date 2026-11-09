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
const transition = read("src/lib/attendanceDeliveryTransition.ts");
const scheduledWorker = read("src/app/api/internal/process-attendance-sms/route.ts");
const emailJobsRoute = read("src/app/api/ict/attendance-email-jobs/route.ts");

// A freshly deployed database can have the table before it has the singleton
// row. Reads and saves must create the defaults without overwriting ICT data.
assert.match(settings, /initializeAttendanceNotificationSettings/);
assert.match(settings, /\.upsert\([\s\S]*?id: true[\s\S]*?ignoreDuplicates: true/);
assert.match(settings, /if \(!data\) return initializeAttendanceNotificationSettings\(\)/);
assert.match(settingsRoute, /await initializeAttendanceNotificationSettings\(\);/);
assert.match(creditsRoute, /await initializeAttendanceNotificationSettings\(\);/);
assert.match(settings, /isEmailOnlyDelivery/);

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
assert.match(parentPreferencesRoute, /schoolDelivery/);
assert.match(parentProfile, /School delivery is currently/);
assert.doesNotMatch(parentProfile, /<Toggle/);
assert.match(smsQueue, /attendance_sms_notifications/);
assert.match(emailQueue, /attendance_email_notifications/);

// New Parent creation has the same durable default across both enrollment
// flows. Existing saved preference values remain authoritative.
assert.match(parentEnrollment, /attendance_email_notifications: false,[\s\S]*?attendance_sms_notifications: true,[\s\S]*?attendance_notification_preference: "SMS"/);
assert.match(verifyTempPassword, /attendance_email_notifications: false,[\s\S]*?attendance_sms_notifications: true,[\s\S]*?attendance_notification_preference: "SMS"/);

// RFID always queues both possible channels after the attendance row is
// committed. Email gets an initial safe worker attempt; SMS/email retry work
// continues through the shared authenticated scheduled worker.
assert.match(scanRoute, /await enqueueAttendanceSms\(input\)/);
assert.match(scanRoute, /await enqueueAttendanceEmail\(input\);[\s\S]*?await processAttendanceEmailJobs\(\{ attendanceLogId: input\.attendanceLogId/);
assert.doesNotMatch(scanRoute, /SCHEDULED_ATTENDANCE_SMS_WORKER/);
assert.doesNotMatch(scanRoute, /SCHEDULED_ATTENDANCE_EMAIL_WORKER/);
assert.match(scheduledWorker, /processAttendanceEmailJobs/);

// Email-only is a school-wide override for a completed, active Parent with a
// valid email. An explicit Neither remains an opt-out. Pending SMS jobs that
// never reached Semaphore are retired and re-queued as email jobs; claimed or
// sent jobs are not touched.
assert.match(emailQueue, /password_set/);
assert.match(emailQueue, /explicitlyOptedOut/);
assert.match(emailQueue, /emailOnly \? explicitlyOptedOut\(row\)/);
assert.match(settingsRoute, /movePendingAttendanceSmsToEmail/);
assert.match(transition, /\.eq\("status", "pending"\)[\s\S]*?\.eq\("attempts", 0\)[\s\S]*?\.is\("provider_requested_at", null\)/);
assert.match(transition, /enqueueAttendanceEmail/);
assert.match(emailJobsRoute, /attendance_email_jobs/);
assert.doesNotMatch(emailJobsRoute, /recipient_email/);
assert.doesNotMatch(emailJobsRoute, /, message,/);

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

console.log("Attendance notification settings, Email-only override, and queue delivery checks passed.");
