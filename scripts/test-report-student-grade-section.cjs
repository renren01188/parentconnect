/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const formatter = read("src/lib/studentGradeSection.ts");
assert.match(formatter, /if \(!cleanGrade \|\| !cleanSection\) return ""/);
assert.match(formatter, /Grade \$\{cleanGrade\}.*· \$\{cleanSection\}/);

const reportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
for (const mapper of ["toAdviserReport", "toGuidanceReport", "toPrincipalReport"]) {
  const mapperStart = reportMapper.indexOf(`export function ${mapper}`);
  assert.notEqual(mapperStart, -1, `${mapper} should exist`);
  const mapperSource = reportMapper.slice(mapperStart, reportMapper.indexOf("\nexport ", mapperStart + 1));
  assert.match(mapperSource, /grade: row\.grade \?\? ""/);
  assert.match(mapperSource, /section: row\.section \?\? ""/);
}

for (const pagePath of [
  "src/app/dashboard/guidance/reports/page.tsx",
  "src/app/dashboard/adviser/reports/page.tsx",
  "src/app/dashboard/principal/reports/page.tsx",
]) {
  const page = read(pagePath);
  assert.match(page, /import \{ formatStudentGradeSection \} from "@\/lib\/studentGradeSection"/);
  assert.match(page, /Student Name:/);
  assert.match(page, /formatStudentGradeSection\([^)]*grade[^)]*section[^)]*\).*truncate/);
}

for (const pagePath of [
  "src/app/dashboard/guidance/reports/page.tsx",
  "src/app/dashboard/adviser/reports/page.tsx",
]) {
  const page = read(pagePath);
  assert.match(page, /function parentStudentGroupKey\(report: Report\)/);
  assert.match(page, /parentStudentGroupKey\(report\) === selectedParent\.key/);
}

console.log("report student grade/section checks passed");
