const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const emailQueue = read("src/lib/attendanceEmailQueue.ts");
const transition = read("src/lib/attendanceDeliveryTransition.ts");
const settingsRoute = read("src/app/api/ict/attendance-notification-settings/route.ts");
const scheduledWorker = read("src/app/api/internal/process-attendance-sms/route.ts");
const parentPreferences = read("src/app/api/parents/attendance-notification-preferences/route.ts");
const emailJobsRoute = read("src/app/api/ict/attendance-email-jobs/route.ts");
const ictModal = read("src/app/dashboard/ict/StudentProfiles/page.tsx");

// Email-only must include active completed Parents with valid email regardless
// of an ordinary SMS preference, but must preserve an explicit Neither.
assert.match(emailQueue, /isEmailOnlyDelivery/);
assert.match(emailQueue, /passwordSet/);
assert.match(emailQueue, /explicitlyOptedOut/);
assert.match(emailQueue, /emailOnly \? explicitlyOptedOut\(row\) : !row\.attendance_email_notifications/);

// Switching modes only transitions untouched SMS jobs. It never alters a
// claimed, provider-requested, or already-sent message.
assert.match(transition, /provider_requested_at/);
assert.match(transition, /\.eq\("status", "pending"\)/);
assert.match(transition, /\.eq\("attempts", 0\)/);
assert.match(transition, /enqueueAttendanceEmail/);
assert.match(settingsRoute, /deliveryTransition/);

// The existing every-minute cron endpoint processes both durable queues.
assert.match(scheduledWorker, /dispatchAttendanceSmsJobs\(\)/);
assert.match(scheduledWorker, /processAttendanceEmailJobs\(\)/);

// Parent UI/API disclose the school override, while Parent preference keeps a
// distinct choice so Email-only can still respect Neither.
assert.match(parentPreferences, /schoolDelivery/);
assert.match(parentPreferences, /attendance_notification_preference/);

// ICT may inspect delivery status but cannot receive email addresses/bodies.
assert.match(emailJobsRoute, /attendance_email_jobs/);
assert.doesNotMatch(emailJobsRoute, /recipient_email/);
assert.doesNotMatch(emailJobsRoute, /, message,/);
assert.match(ictModal, /Email delivery queue/);
assert.match(ictModal, /Search email delivery queue/);

console.log("Attendance Email-only override and durable queue failover checks passed.");
