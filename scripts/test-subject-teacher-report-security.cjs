/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = read("src/app/report/subject-teacher/page.tsx");
const verifyOtp = read("src/app/api/subject-teacher-reports/verify-otp/route.ts");
const submitReport = read("src/app/api/subject-teacher-reports/route.ts");
const migration = read("supabase/legacy-migrations/20261110130000_route_subject_teacher_reports_to_student_reports.sql");

// CAPTCHA tokens are single-use. A successful send must reset the widget so
// a resend cannot reuse the token that Google has already consumed.
assert.match(page, /setOtpSent\(true\);[\s\S]*?setCaptchaToken\(""\);[\s\S]*?setCaptchaResetSignal/);

// A browser retry keeps the same UUID as long as the form data is unchanged.
assert.match(page, /reportSubmissionRef/);
assert.match(page, /crypto\.randomUUID\(\)/);
assert.match(page, /submissionKey: reportSubmissionRef\.current\.key/);

// OTP attempts are changed only inside the locked database function.
assert.match(verifyOtp, /rpc\("consume_subject_teacher_report_otp"/);
assert.doesNotMatch(verifyOtp, /\.update\(\{ attempts:/);

// The public endpoint validates and checks the retry key before the daily
// limit, then writes the Adviser-owned Student Report source row.
assert.match(submitReport, /UUID_PATTERN\.test\(submissionKey\)/);
assert.match(submitReport, /subject_teacher_submission_key", submissionKey/);
assert.match(submitReport, /subject_teacher_submission_key: submissionKey/);
assert.match(submitReport, /report_source: "subject_teacher"/);
assert.doesNotMatch(submitReport, /rpc\("submit_subject_teacher_report"/);

// The database is the final concurrency boundary for Subject Teacher reports.
assert.match(migration, /subject_teacher_submission_key uuid/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS student_reports_subject_teacher_submission_key_idx/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /SUBJECT_TEACHER_DAILY_LIMIT/);

console.log("subject teacher report security checks passed");
