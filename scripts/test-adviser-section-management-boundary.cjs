const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const sectionApi = read("src/app/api/sections/route.ts");
const registration = read("src/components/student-parent-registration/StudentParentRegistration.tsx");
const adviserStudentEdit = read("src/app/dashboard/adviser/students/[id]/page.tsx");

assert.match(sectionApi, /async function authorizeIctSectionChange[\s\S]*?getActiveIct\(\)/);
assert.match(sectionApi, /export async function POST[\s\S]*?await authorizeIctSectionChange/);
assert.match(sectionApi, /export async function DELETE[\s\S]*?await authorizeIctSectionChange/);
assert.match(sectionApi, /GET[\s\S]*?getActiveAdviser\(\)[\s\S]*?getActiveIct\(\)/);

for (const page of [registration, adviserStudentEdit]) {
  assert.doesNotMatch(page, /New Section/);
  assert.doesNotMatch(page, /saveNewSection/);
  assert.doesNotMatch(page, /setAddingNew/);
  assert.match(page, /\/api\/sections\?grade=/);
  assert.match(page, /Class sections are managed by ICT/);
}

console.log("Adviser section-management boundary checks passed.");
