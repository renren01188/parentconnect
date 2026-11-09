const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const jobsRoute = read("src/app/api/ict/attendance-sms-jobs/route.ts");
const emailJobsRoute = read("src/app/api/ict/attendance-email-jobs/route.ts");
const studentProfiles = read("src/app/dashboard/ict/StudentProfiles/page.tsx");

// The server must derive the queue window from the active school calendar,
// then use attendance_date (not a worker update timestamp) to limit jobs.
assert.match(jobsRoute, /scheduledAttendanceDates/);
assert.match(jobsRoute, /recentScheduledClassDays/);
assert.match(jobsRoute, /\.slice\(-configuredWeekdays\.length\)/);
assert.match(jobsRoute, /\.in\("attendance_logs\.attendance_date", recentClassDays\)/);

// The response contains names but intentionally not phone numbers or SMS text.
assert.match(jobsRoute, /parents \( first_name, middle_name, last_name, suffix \)/);
assert.match(jobsRoute, /students \( first_name, middle_name, last_name, suffix \)/);
assert.match(jobsRoute, /parent_name: nameOf\(row\.parents\)/);
assert.match(jobsRoute, /student_name: nameOf\(attendanceLog\?\.students\)/);
assert.doesNotMatch(jobsRoute, /recipient_phone/);
assert.doesNotMatch(jobsRoute, /, message,/);
assert.match(emailJobsRoute, /scheduledAttendanceDates/);
assert.match(emailJobsRoute, /recentScheduledClassDays/);
assert.match(emailJobsRoute, /attendance_email_jobs/);
assert.doesNotMatch(emailJobsRoute, /recipient_email/);

// A durable sent job must be presented as Sent even if its older provider
// snapshot remains pending while Semaphore's reconciliation catches up.
assert.match(studentProfiles, /if \(status === "sent"\)[\s\S]*?label: "Sent"/);
assert.match(studentProfiles, /stale provider snapshot must never make a sent job look Pending/);
assert.doesNotMatch(studentProfiles, /const attentionSmsJobs/);

// The modal provides a searchable, independently scrolling queue with parent
// first, student second, and no internal attendance-log number as its label.
assert.match(studentProfiles, /Search SMS delivery queue/);
assert.match(studentProfiles, /Email delivery queue/);
assert.match(studentProfiles, /Search email delivery queue/);
assert.match(studentProfiles, /placeholder="Search parent or student"/);
assert.match(studentProfiles, /max-h-80 space-y-2 overflow-y-auto/);
assert.match(studentProfiles, /\{job\.parent_name\}/);
assert.match(studentProfiles, /\{job\.student_name\}/);
assert.doesNotMatch(studentProfiles, /Attendance #\{job\.attendance_log_id\}/);

console.log("ICT attendance SMS delivery queue checks passed.");
