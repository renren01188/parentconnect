/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadTypeScriptModule(file) {
  const source = read(file);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("exports", "module", compiled)(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

const { weekdayExportDatesForMonth } = loadTypeScriptModule("src/lib/attendanceExportCalendar.ts");

// October 2026 has multiple weeks and both weekends. Its first weekday is a
// Thursday, so it catches the old date/weekday calculations that ignored year.
const october2026 = weekdayExportDatesForMonth(2026, 10);
assert.equal(october2026.length, 22);
assert.deepEqual(october2026.slice(0, 3), [
  { date: "2026-10-01", day: 1, weekdayLabel: "TH" },
  { date: "2026-10-02", day: 2, weekdayLabel: "F" },
  { date: "2026-10-05", day: 5, weekdayLabel: "M" },
]);
assert.equal(october2026.some(({ date }) => date === "2026-10-03"), false, "Saturday must not get an SF2 weekday column.");
assert.equal(october2026.some(({ date }) => date === "2026-10-04"), false, "Sunday must not get an SF2 weekday column.");
assert.deepEqual(october2026.at(-1), { date: "2026-10-30", day: 30, weekdayLabel: "F" });

const configuredHoliday = new Set(["2026-10-20"]);
assert.equal(configuredHoliday.has(october2026[13].date), true, "A configured weekday holiday must remain a visible export column.");
assert.equal(october2026[13].weekdayLabel, "T");

const february2028 = weekdayExportDatesForMonth(2028, 2);
assert.equal(february2028.length, 21, "Leap-year weekday count must use the selected year.");
assert.deepEqual(february2028.at(-1), { date: "2028-02-29", day: 29, weekdayLabel: "T" });

const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
const principalPage = read("src/app/dashboard/principal/AttendanceSummary/page.tsx");
for (const [name, source] of [["Adviser", adviserPage], ["Principal", principalPage]]) {
  assert.match(source, /weekdayExportDatesForMonth/, `${name} export must use the shared full-month weekday calendar.`);
  assert.match(source, /getSf2StatusCode\(null, true\)/, `${name} export must retain H marks for holidays.`);
  assert.match(source, /getSf2StatusCode\(savedStatus\)/, `${name} export must retain saved Present, Late, Absent, and Excused status mapping.`);
  assert.match(source, /Attendance Detail/, `${name} workbook must retain its date-level attendance detail.`);
}

console.log("Monthly attendance export calendar checks passed (October 2026, configured holiday, and February 2028 leap year).");
