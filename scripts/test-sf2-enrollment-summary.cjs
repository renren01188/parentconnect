/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src/lib/sf2EnrollmentSummary.ts");
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(compiled, sourcePath);

const { calculateSf2EnrollmentSummary } = loaded.exports;

// This covers an actual school year that begins during October rather than
// June. The template wording stays official, but the month is derived from
// the configured school-year start month.
const summary = calculateSf2EnrollmentSummary({
  schoolYearStart: "2026-10-21",
  selectedYear: 2026,
  selectedMonth: 11,
  students: [
    // Registered before the October cut-off, then left during November.
    { id: 1, gender: "M", registrationDate: "2026-10-01", remarks: [
      { id: 1, remark_type: "Transferred Out", effectivity_date: "2026-11-20" },
    ] },
    // A November registration remains active at month end.
    { id: 2, gender: "F", registrationDate: "2026-11-03", remarks: [] },
    // A learner registered after the selected month cannot enter November totals.
    { id: 3, gender: "M", registrationDate: "2026-12-01", remarks: [] },
  ],
});

assert.equal(summary.cutoffDate, "2026-10-02", "Cut-off must be the first Friday of the configured start month.");
assert.equal(summary.enrollmentLabel, "* Enrolment as of (1st Friday of October)");
assert.deepEqual(summary.enrolmentAtCutoff, { male: 1, female: 0, total: 1 });
assert.deepEqual(summary.lateEnrolment, { male: 0, female: 1, total: 1 });
assert.deepEqual(summary.registeredAtMonthEnd, { male: 0, female: 1, total: 1 });

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
for (const file of [
  "src/app/api/attendance/monthly/route.ts",
  "src/app/api/attendance/monthly-summary/route.ts",
]) {
  const route = read(file);
  assert.doesNotMatch(route, /enrollment_date/, `${file} must use the automatic student registration date, not an adviser-entered enrolment date.`);
  assert.match(route, /registrationDate\(student\.created_at\)/, `${file} must derive the SF2 cut-off from the saved manual-add/SF1-import date.`);
  assert.match(route, /calculateSf2EnrollmentSummary/, `${file} must use the shared SF2 calculation.`);
}
for (const file of [
  "src/app/dashboard/adviser/attendance/page.tsx",
  "src/app/dashboard/principal/AttendanceSummary/page.tsx",
]) {
  const page = read(file);
  assert.match(page, /lateEnrollmentRow/, `${file} must populate the Late enrolment row.`);
  assert.match(page, /enrollmentLabel/, `${file} must update the official template's start-month label.`);
  assert.match(page, /function setSf2SummaryCount/, `${file} must explicitly format SF2 summary zeros as 0.`);
  assert.match(page, /cell\.numFmt = "0"/, `${file} must override the template's dot-for-zero number format.`);
}

console.log("SF2 enrolment summary checks passed.");
