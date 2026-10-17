/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = read("src/app/report/subject-teacher/page.tsx");
const submitRoute = read("src/app/api/subject-teacher-reports/route.ts");
const migration = read("supabase/migrations/20261017150000_add_subject_teacher_report_categories.sql");
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
// passes the canonical ordered list to the service-role-only RPC.
assert.match(submitRoute, /SUBJECT_TEACHER_REPORT_CATEGORIES/);
assert.match(submitRoute, /submittedCategories\.some/);
assert.match(submitRoute, /p_categories: categories/);

// The database procedure validates, de-duplicates, and saves the selection.
assert.match(migration, /p_categories text\[\]/);
assert.match(migration, /At least one valid concern category is required/);
assert.match(migration, /normalized_categories/);
assert.match(migration, /p_subject, normalized_categories/);

// Adviser Panel 2 and its detail view render every saved category.
assert.match(adviserReports, /\{r\.categories\.map\(cat =>/);
assert.match(adviserReports, /\{selectedReport\.categories\.map\(cat =>/);

console.log("subject teacher report category checks passed");
