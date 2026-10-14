/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const reportForm = read("src/app/report/page.tsx");
const studentReportsRoute = read("src/app/api/student-reports/route.ts");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const reportRealtimeHook = read("src/hooks/useReportMessagesRealtime.ts");

// The public form always renders the widget, only accepts Google's successful
// callback token, and keeps the native submit control unavailable until both
// form validation and CAPTCHA verification have completed.
assert.match(reportForm, /https:\/\/www\.google\.com\/recaptcha\/api\.js\?render=explicit/);
assert.match(reportForm, /callback: \(token\) => \{ setRecaptchaToken\(token\);/);
assert.match(reportForm, /"expired-callback": \(\) => \{ setRecaptchaToken\(""\);/);
assert.match(reportForm, /const canSubmit = hasRequiredReportDetails && Boolean\(recaptchaToken\) && !loading/);
assert.match(reportForm, /disabled=\{!canSubmit\}/);
assert.match(reportForm, /Complete the reCAPTCHA verification before submitting your report\./);
assert.match(reportForm, /typeof window\.grecaptcha\?\.render === "function"\) setRecaptchaLoaded\(true\)/);
assert.match(reportForm, /Complete the CAPTCHA to enable Submit Report\./);

// The endpoint remains the security boundary; client-side gating alone must
// never be enough to save a public report.
assert.match(studentReportsRoute, /if \(!await verifyGoogleRecaptcha\(recaptchaToken\)\)/);
assert.match(studentReportsRoute, /The reCAPTCHA verification is invalid, expired, or incomplete/);
assert.match(studentReportsRoute, /\.insert\(\{[\s\S]*?\.select\("id"\)[\s\S]*?\.single\(\)/);

// Once committed, wake only the assigned Adviser's data-free account channel;
// the Adviser page reloads its authorized Student Reports list in place. The
// request version guard prevents an older initial fetch from hiding the new
// report after the Realtime event arrives.
assert.match(studentReportsRoute, /await publishRealtimeInvalidation\(\[\s*\{ role: "adviser", id: Number\(adviser\.id\) \},\s*\], "students"\)/);
assert.match(reportRealtimeHook, /if \(invalidation\.scope === "students"\)[\s\S]*?studentReportUpdateRef\.current/);
assert.match(adviserReports, /const studentReportsRequestVersionRef = useRef\(0\)/);
assert.match(adviserReports, /const requestVersion = \+\+studentReportsRequestVersionRef\.current/);
assert.match(adviserReports, /if \(requestVersion !== studentReportsRequestVersionRef\.current\) return/);
assert.match(adviserReports, /onStudentReportUpdate: loadStudentReports/);

console.log("student report CAPTCHA and Realtime delivery checks passed");
