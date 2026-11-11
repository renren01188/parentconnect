/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const reportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const subjectTeacherSubmit = read("src/app/api/subject-teacher-reports/route.ts");
const notifyParentRoute = read("src/app/api/student-reports/[id]/notify-parent/route.ts");
const mailer = read("src/lib/mailer.ts");
const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const parentData = read("src/app/dashboard/parent/data.ts");
const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");

// The Parent-facing report object and message metadata must be anonymous,
// while the original name remains available in the staff-only mappers.
assert.match(reportMapper, /subject: hasSubjectTeacherOpeningMessage \? "Subject Teacher Report" : row\.subject/);
assert.match(reportMapper, /senderName: isSubjectTeacherMessage \? "School staff"/);
assert.doesNotMatch(parentData, /submittedByName|submittedByRole|submittedAt/);
assert.doesNotMatch(parentReports, /submittedByRole|submittedByName/);

// Public submission stays in Student Reports, so it never emails or exposes
// the reporter to a Parent before the Adviser deliberately forwards it.
assert.doesNotMatch(subjectTeacherSubmit, /recipientRole: "Parent \/ Guardian"/);
assert.match(subjectTeacherSubmit, /recipientRole: "Class Adviser",[\s\S]*?teacherName,[\s\S]*?teacherEmail/);
assert.match(subjectTeacherSubmit, /subject_teacher_name: teacherName/);
assert.match(notifyParentRoute, /sender_role: "subject_teacher"/);
assert.match(notifyParentRoute, /sender_name: studentReport\.subject_teacher_name\.trim\(\)/);
assert.match(mailer, /revealReporter = true/);
assert.match(mailer, /A subject teacher submitted a report for/);
assert.match(mailer, /revealReporter\s*\?\s*`<p><strong>\$\{teacherName\}<\/strong> \(\$\{teacherEmail\}\)/);
assert.match(parentNotifications, /const subjectTeacherReportIds = new Set<number>\(\);/);
assert.match(parentNotifications, /const isSubjectTeacherReport = subjectTeacherReportIds\.has\(Number\(report\.id\)\)/);
assert.match(parentNotifications, /const senderName = latestIsSubjectTeacherMessage\s*\?\s*"School staff"/);
assert.match(parentNotifications, /title: isSubjectTeacherReport \? "New Subject Teacher Report"/);

// Adviser sees the reporter in Student Reports. Once forwarded, Guidance
// receives the preserved opening Subject Teacher message only through the
// existing escalation authorization, and Principal retains that identity.
assert.match(adviserReports, /selectedStudRep\.submitted_by_role === "Subject Teacher"/);
assert.match(adviserReports, /list_role\?: "Subject Teacher"/);
assert.match(adviserReports, /"Student & Subject Teacher Reports"/);
assert.match(adviserReports, /const listName = isSubjectTeacherReport \? r\.submitted_by_name \|\| "Subject Teacher" : r\.student_name/);
assert.match(adviserReports, /subject-teacher:\$\{r\.student_id\}:\$\{listName\.toLowerCase\(\)\}/);
assert.match(adviserReports, /\{selectedStudent\.list_name\}<\/p>/);
assert.match(adviserReports, /isSubjectTeacherReport \? `Student: \$\{r\.student_name\}` : r\.title/);
assert.match(adviserReports, />Subject Teacher Report<\/p>/);
assert.doesNotMatch(adviserReports, /selectedReport\?\.subject \?\? selectedStudRep\?\.title \?\? selectedAdminMsg\?\.subject/);
assert.match(adviserReports, /const detailHeading = isSubjectTeacherReport/);
assert.match(adviserReports, /Student: \$\{selectedStudRep\.student_name\}/);
assert.match(adviserReports, /Submitted by: \$\{selectedStudRep\.submitted_by_name\} \(Subject Teacher\)/);
assert.match(adviserReports, /const isSubjectTeacherReport = studRep\.submitted_by_role === "Subject Teacher"/);
assert.match(adviserReports, /studRep\.description\?\.trim\(\) \|\| "A concern was shared by school staff\."/);
assert.match(adviserReports, /Concern shared by school staff:/);
assert.match(reportMapper, /const openingMessage = firstParentMessage \?\? subjectTeacherOpeningMessage \?\? firstGuidanceMessage/);
assert.match(reportMapper, /submitted_by_name: openingMessage\?\.sender_role === "subject_teacher" \? openingMessage\.sender_name : undefined/);
assert.match(guidanceReports, /Submitted by: \{selectedReport\.submitted_by_name\} · Subject Teacher/);
assert.match(principalReports, /Submitted by: \{selectedReport\.submitted_by_name\} · Subject Teacher/);

console.log("subject teacher reporter visibility checks passed");
