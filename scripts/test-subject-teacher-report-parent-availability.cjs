/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const route = read("src/app/api/subject-teacher-reports/route.ts");
const page = read("src/app/report/subject-teacher/page.tsx");
const migration = read("supabase/migrations/20261110130000_route_subject_teacher_reports_to_student_reports.sql");

// A report must be routable to the assigned Adviser even when a Parent has
// not completed signup, has no email, or is not linked yet. Parent details are
// only an optional snapshot for a later Adviser forwarding action.
assert.match(route, /const parent = parents\[0\] \?\? null;/);
assert.match(route, /const parentEmail = trimmed\(parent\?\.email\);/);
assert.doesNotMatch(route, /if \(!parent\?\.email\) return NextResponse\.json/);
assert.match(route, /\.from\("student_reports"\)[\s\S]*?report_source: "subject_teacher"/);
assert.match(route, /subject_teacher_submission_key: submissionKey/);
assert.match(route, /subject_teacher_report_date_manila: reportDay/);
assert.match(route, /report_date_manila: reportDay/);
assert.match(route, /await publishStudentReportsRealtimeInvalidation\(adviser\.id\)/);
assert.doesNotMatch(route, /\.rpc\("submit_subject_teacher_report"/);
assert.doesNotMatch(route, /recipientRole: "Parent \/ Guardian"/);
assert.match(route, /now in Student Reports until the adviser chooses to notify the Parent/);

// The source metadata and daily limit are kept on Student Reports, so this
// routing change does not weaken retry de-duplication or the two-per-day cap.
assert.match(migration, /report_source text NOT NULL DEFAULT 'student'/);
assert.match(migration, /subject_teacher_submission_key uuid/);
assert.match(migration, /student_reports_subject_teacher_submission_key_idx/);
assert.match(migration, /enforce_subject_teacher_student_report_daily_limit/);

// The public confirmation must describe the actual Adviser/Student Reports
// outcome, rather than incorrectly claiming an unavailable Parent was notified.
assert.match(page, /const \[successMessage, setSuccessMessage\] = useState\(""\);/);
assert.match(page, /setSuccessMessage\(data\.message \|\| "Report submitted successfully\."\);/);
assert.match(page, /\{successMessage \|\| "Report submitted successfully\."\}/);

console.log("subject teacher report Parent-availability checks passed");
