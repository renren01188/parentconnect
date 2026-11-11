/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const reportForm = read("src/app/report/page.tsx");
const studentReportsRoute = read("src/app/api/student-reports/route.ts");
const adviserLayout = read("src/app/dashboard/adviser/layout.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const adviserNotifications = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const reportRealtimeHook = read("src/hooks/useReportMessagesRealtime.ts");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");
const studentReportStatusRoute = read("src/app/api/student-reports/[id]/status/route.ts");
const subjectTeacherReportsRoute = read("src/app/api/subject-teacher-reports/route.ts");

// The public form always renders the widget, only accepts Google's successful
// callback token, and keeps the native submit control unavailable until both
// form validation and CAPTCHA verification have completed.
assert.match(reportForm, /https:\/\/www\.google\.com\/recaptcha\/api\.js\?render=explicit/);
assert.match(reportForm, /callback: \(token\) => \{ setRecaptchaToken\(token\);/);
assert.match(reportForm, /"expired-callback": \(\) => \{ setRecaptchaToken\(""\);/);
assert.match(reportForm, /name="lrn"/);
assert.match(reportForm, /Learner Reference Number \(LRN\)/);
assert.match(reportForm, /pattern="\[0-9\]\{12\}"/);
assert.match(reportForm, /const canSubmit = hasRequiredReportDetails && termsAccepted && Boolean\(recaptchaToken\) && !loading/);
assert.match(reportForm, /disabled=\{!canSubmit\}/);
assert.match(reportForm, /Complete the reCAPTCHA verification before submitting your report\./);
assert.match(reportForm, /typeof window\.grecaptcha\?\.render === "function"\) setRecaptchaLoaded\(true\)/);
assert.match(reportForm, /Complete the CAPTCHA to enable Submit Report\./);
assert.match(reportForm, /Reporting Guidelines and Privacy Notice/);
assert.match(reportForm, /By submitting this Student Report, you acknowledge that the information you provide is accurate and truthful/);
assert.match(reportForm, /records the submitter&apos;s IP address and device\/browser information/);
assert.match(reportForm, /Only authorized ICT and Principal users may access these security details through the system&apos;s Audit Trail/);
assert.match(reportForm, /I have read and understood the Reporting Guidelines and Privacy Notice/);
assert.match(reportForm, /Acknowledge and Continue/);
assert.doesNotMatch(reportForm, /Terms and Agreement/);
assert.match(reportForm, /function sortGradeLevels/);
assert.match(reportForm, /includeEmptyOption/);
assert.match(reportForm, /onChange\(\"\"\); setOpen\(false\);/);

// The endpoint remains the security boundary; client-side gating alone must
// never be enough to save a public report.
assert.match(studentReportsRoute, /if \(!await verifyGoogleRecaptcha\(recaptchaToken\)\)/);
assert.match(studentReportsRoute, /The reCAPTCHA verification is invalid, expired, or incomplete/);
assert.match(studentReportsRoute, /const trimmedLrn = String\(lrn \?\? ""\)\.trim\(\)/);
assert.match(studentReportsRoute, /!\/\^\\d\{12\}\$\/\.test\(trimmedLrn\)/);
assert.match(studentReportsRoute, /\.eq\("student_id", trimmedLrn\)/);
assert.match(studentReportsRoute, /if \(termsAccepted !== true\)/);
assert.match(studentReportsRoute, /action: "Student Report Submitted"/);
assert.match(studentReportsRoute, /performedBy: "Student"/);
assert.match(studentReportsRoute, /performedByRole: "Student"/);
assert.doesNotMatch(studentReportsRoute, /Subject Teacher/);
assert.match(studentReportsRoute, /ipAddress: publicReportAuditIp\(req\)/);
assert.match(studentReportsRoute, /browser: req\.headers\.get\("user-agent"\)/);
assert.match(studentReportsRoute, /\.insert\(\{[\s\S]*?\.select\("id"\)[\s\S]*?\.single\(\)/);

// Once committed, wake the assigned Adviser and active Principal monitoring
// view over their data-free channels. The request version guard prevents an
// older initial fetch from hiding the new report after the Realtime event.
assert.match(studentReportsRoute, /publishStudentReportsRealtimeInvalidation/);
assert.match(studentReportStatusRoute, /await publishStudentReportsRealtimeInvalidation\(adviser\.id\)/);
assert.match(subjectTeacherReportsRoute, /await publishStudentReportsRealtimeInvalidation\(adviser\.id\)/);
assert.doesNotMatch(subjectTeacherReportsRoute, /\.rpc\("submit_subject_teacher_report"/);
assert.match(reportRealtimeHook, /if \(invalidation\.scope === "students"\)[\s\S]*?studentReportUpdateRef\.current/);
assert.match(adviserNotifications, /scope === "reports" \|\| scope === "students"/);
assert.match(adviserNotifications, /scope === "students"[\s\S]*?void loadReportCount\(\)/);
assert.match(adviserNotifications, /const actionableStudentReports = studentReports\.filter\([\s\S]*?report\.status === "New"/);
assert.match(adviserLayout, /<NotificationProvider>/);
assert.match(adviserReports, /const studentReportsRequestVersionRef = useRef\(0\)/);
assert.match(adviserReports, /const requestVersion = \+\+studentReportsRequestVersionRef\.current/);
assert.match(adviserReports, /if \(requestVersion !== studentReportsRequestVersionRef\.current\) return/);
assert.match(adviserReports, /onStudentReportUpdate: loadStudentReports/);
assert.match(principalReports, /onStudentReportUpdate: loadPrincipalReports/);

console.log("student report CAPTCHA and Realtime delivery checks passed");
