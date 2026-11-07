/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadTypeScriptModule(file, aliases = {}) {
  const filename = path.join(root, file);
  const compiled = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (id) => aliases[id] ?? originalRequire(id);
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const schoolCalendar = loadTypeScriptModule("src/lib/schoolCalendar.ts");
const reportingCalendar = loadTypeScriptModule("src/lib/attendanceReportingCalendar.ts", {
  "@/lib/schoolCalendar": schoolCalendar,
});
const scannerSchedule = loadTypeScriptModule("src/lib/attendanceScannerSchedule.ts");

// A scan was valid while the school year was open. ICT then ends that school
// year before the selected November report is opened.
const savedNovemberScan = "2026-11-06";
const reportDays = reportingCalendar.attendanceReportDaysForMonth({
  year: 2026,
  month: 11,
  schoolYearStart: "2026-10-21",
  schoolYearEnd: "2026-10-27",
  attendanceWeekdays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  recordedDates: [savedNovemberScan],
});
assert.ok(reportDays.includes(savedNovemberScan), "A saved scan must remain in its selected month after the end date changes.");
assert.ok(reportDays.includes("2026-11-02"), "A historical export must retain the month’s applicable configured weekdays.");

const reportableDays = reportingCalendar.reportableAttendanceDays({
  reportDays,
  today: "2026-11-07",
  holidayDates: [savedNovemberScan, "2026-11-05"],
  recordedDates: [savedNovemberScan],
});
assert.ok(reportableDays.includes(savedNovemberScan), "A later holiday edit cannot hide an existing attendance record.");
assert.equal(reportableDays.includes("2026-11-05"), false, "An empty holiday date stays outside attendance totals.");

const deactivatedScanner = scannerSchedule.getSchoolYearScannerAvailability(
  "2026-11-07",
  "2026-10-21",
  "2026-10-27",
);
assert.equal(deactivatedScanner.available, false, "Changing the end date must still block new RFID scans.");

const adviserMonthly = read("src/app/api/attendance/monthly/route.ts");
const principalSummary = read("src/app/api/attendance/monthly-summary/route.ts");
const adviserHistory = read("src/app/api/attendance/history/route.ts");
for (const [name, source] of [["Adviser monthly", adviserMonthly], ["Principal monthly", principalSummary]]) {
  assert.match(source, /attendanceReportDaysForMonth/, `${name} must use the record-preserving report calendar.`);
  assert.match(source, /\.gte\("attendance_date", monthStart\)/, `${name} must read the complete selected calendar month.`);
  assert.match(source, /\.lte\("attendance_date", monthEnd\)/, `${name} must read the complete selected calendar month.`);
  assert.doesNotMatch(source, /\.gte\("attendance_date", validDays\[0\]\)/, `${name} must not suppress logs when the current schedule has no days.`);
}
assert.match(adviserMonthly, /student_grade_snapshot, student_section_snapshot/, "Adviser monthly data must keep recorded adviser scope.");
assert.match(principalSummary, /student_grade_snapshot, student_section_snapshot/, "Principal monthly data must keep recorded student scope.");
assert.match(principalSummary, /reportableAttendanceDays/, "Principal totals must retain saved attendance through a later holiday or date-range edit.");
assert.match(adviserHistory, /student_grade_snapshot, student_section_snapshot/, "History remains based on the same saved scope.");
assert.doesNotMatch(adviserMonthly, /\.eq\("via"/, "Adviser export must include RFID and Today’s Manual Attendance.");
assert.doesNotMatch(principalSummary, /\.eq\("via"/, "Principal totals must include RFID and Today’s Manual Attendance.");

console.log("Historical attendance reporting checks passed (saved scan retained after deactivation; new scan remains blocked).");
