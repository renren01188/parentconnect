/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = read("src/app/report/subject-teacher/page.tsx");
const submitRoute = read("src/app/api/subject-teacher-reports/route.ts");
const migration = read("supabase/migrations/20261110130000_route_subject_teacher_reports_to_student_reports.sql");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");

const categories = [
  "Academic Concern",
  "Health/Medical",
  "Behavioral Issue",
  "Attendance",
  "Other",
  "Permission Request",
  "General Inquiry",
];

for (const category of categories) assert.match(page, new RegExp(category));
assert.match(page, /toggleCategory/);
assert.match(page, /form\.categories\.length === 0/);
assert.match(page, /checked=\{selected\}/);

// The server accepts only the defined options, requires at least one, and
// saves the canonical ordered list on the Student Report source row.
assert.match(submitRoute, /SUBJECT_TEACHER_REPORT_CATEGORIES/);
assert.match(submitRoute, /submittedCategories\.some/);
assert.match(submitRoute, /subject_teacher_categories: categories/);

// The database keeps the complete selection even though Student Reports has
// one primary category for its list filter.
assert.match(migration, /subject_teacher_categories text\[\] NOT NULL DEFAULT '\{\}'/);

// Adviser Student Report detail renders every saved category.
assert.match(adviserReports, /const displayCategories = selectedStudRep\.subject_teacher_categories\?\.length/);
assert.match(adviserReports, /displayCategories\.map\(\(category\) =>/);

console.log("subject teacher report category checks passed");
