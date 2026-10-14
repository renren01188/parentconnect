const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const form = read("src/components/student-parent-registration/StudentParentRegistration.tsx");
const api = read("src/app/api/students/route.ts");

assert.match(form, /RELIGION_OPTIONS = \["Catholic", "Christian", "Muslim", "INC", "Others"\]/);
assert.match(form, /<select[\s\S]*value=\{form\.religion\}/);
assert.match(form, /form\.religion === "Others" && \(/);
assert.match(form, /label="Specify Religion"/);
assert.match(form, /religionOther: value === "Others" \? prev\.religionOther : ""/);
assert.match(form, /religion: student\.religion === "Others" \? student\.religionOther\.trim\(\) : student\.religion/);
assert.match(form, /religionSelection: student\.religion/);
assert.match(form, /Specify the religion when Others is selected/);

assert.match(api, /STUDENT_RELIGION_OPTIONS = \["Catholic", "Christian", "Muslim", "INC", "Others"\]/);
assert.match(api, /religionSelection, religionOther/);
assert.match(api, /if \(selectedReligion === "Others"\)/);
assert.match(api, /resolvedReligion = customReligion/);
assert.match(api, /resolvedReligion = selectedReligion/);
assert.match(api, /Select a religion before submitting/);
assert.match(api, /religion: resolvedReligion \|\| null/);

console.log("student religion checks passed");
