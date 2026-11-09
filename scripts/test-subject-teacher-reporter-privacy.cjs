/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const reportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const subjectTeacherSubmit = read("src/app/api/subject-teacher-reports/route.ts");
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

// The public submission notifies the Parent without interpolating the
// reporter's name/email, but keeps the identified staff notice for the Adviser.
assert.match(subjectTeacherSubmit, /recipientRole: "Parent \/ Guardian",[\s\S]*?revealReporter: false/);
assert.match(subjectTeacherSubmit, /recipientRole: "Class Adviser",[\s\S]*?teacherName,[\s\S]*?teacherEmail/);
assert.match(mailer, /revealReporter = true/);
assert.match(mailer, /A subject teacher submitted a report for/);
assert.match(mailer, /revealReporter\s*\?\s*`<p><strong>\$\{teacherName\}<\/strong> \(\$\{teacherEmail\}\)/);
assert.match(parentNotifications, /const isSubjectTeacherReport = latestMessage\?\.sender_role === "subject_teacher"/);
assert.match(parentNotifications, /const senderName = isSubjectTeacherReport\s*\?\s*"School staff"/);
assert.match(parentNotifications, /messageBody \|\| \(isSubjectTeacherReport \? "A subject teacher submitted a report for your child\." : report\.subject\)/);

// Adviser already shows the reporter. Guidance receives the original opening
// Subject Teacher message only after its existing escalation authorization,
// and Principal retains the same identity after Guidance escalates onward.
assert.match(adviserReports, /submitted_by_name \?\? selectedReport\.parent_name/);
assert.match(reportMapper, /const openingMessage = firstParentMessage \?\? subjectTeacherOpeningMessage \?\? firstGuidanceMessage/);
assert.match(reportMapper, /submitted_by_name: openingMessage\?\.sender_role === "subject_teacher" \? openingMessage\.sender_name : undefined/);
assert.match(guidanceReports, /Submitted by: \{selectedReport\.submitted_by_name\} · Subject Teacher/);
assert.match(principalReports, /Submitted by: \{selectedReport\.submitted_by_name\} · Subject Teacher/);

console.log("subject teacher reporter visibility checks passed");
