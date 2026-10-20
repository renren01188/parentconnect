/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const ExcelJS = require("exceljs");
const attendanceRate = require("../src/lib/attendanceRate.cjs");

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

async function run() {
  const status = loadTypeScriptModule("src/lib/attendanceExportStatus.ts");
  const fixture = [
    ["On Time", "Present", "✓", true],
    ["Late", "Late", "✓", true],
    ["Absent", "Absent", "X", false],
    ["Excused", "Excused", "E", false],
    [null, null, null, false],
  ];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Attendance Detail");
  sheet.addRow(["Student", "Saved Status", "SF2 Cell", "Counts Attended"]);
  for (const [saved, expectedStatus, expectedCode, expectedAttended] of fixture) {
    const normalized = status.toAttendanceExportStatus(saved);
    assert.equal(normalized, expectedStatus, `Expected ${saved ?? "missing"} to retain its saved status.`);
    assert.equal(status.getSf2StatusCode(normalized), expectedCode, `Expected ${saved ?? "missing"} to use its own SF2 code.`);
    assert.equal(status.isAttendedExportStatus(normalized), expectedAttended, `Expected attended rule for ${saved ?? "missing"}.`);
    sheet.addRow(["Fixture student", status.getAttendanceDetailStatus(normalized), status.getSf2StatusCode(normalized), status.isAttendedExportStatus(normalized)]);
  }
  assert.equal(status.getSf2StatusCode(null, true), "H", "A selected holiday must export as H.");
  sheet.addRow(["Fixture student", "Holiday", status.getSf2StatusCode(null, true), false]);

  const attended = fixture.filter(([, , , isAttended]) => isAttended).length;
  const absent = fixture.filter(([, normalized]) => normalized === "Absent").length;
  assert.equal(attended, 2, "Present and Late must both count as attended.");
  assert.equal(absent, 1, "Only an explicit Absent record may count as absent.");
  assert.equal(
    attendanceRate.calculateAttendanceRate({ present: 1, late: 1, absent: 1 }),
    66.7,
    "The rate must use Present + Late over Present + Late + Absent; Holiday and Excused are neutral.",
  );

  const output = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(output);
  const rows = reloaded.getWorksheet("Attendance Detail").getRows(2, 6);
  assert.deepEqual(rows.map((row) => row.getCell(2).value), ["Present", "Late", "Absent", "Excused", "No Record", "Holiday"]);
  assert.deepEqual(rows.map((row) => row.getCell(3).value), ["✓", "✓", "X", "E", null, "H"]);
  assert.deepEqual(rows.map((row) => row.getCell(4).value), [true, true, false, false, false, false]);

  const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
  const adviserRoute = read("src/app/api/attendance/monthly/route.ts");
  const principalPage = read("src/app/dashboard/principal/AttendanceSummary/page.tsx");
  const principalRoute = read("src/app/api/attendance/monthly-summary/route.ts");
  const automaticAbsence = read("src/lib/automaticAttendanceAbsence.ts");
  const excuseDecisionRoute = read("src/app/api/excuse-letters/[id]/route.ts");
  for (const [name, source] of [["adviser export", adviserPage], ["principal export", principalPage]]) {
    assert.match(source, /getSf2StatusCode\(savedStatus\)/, `${name} must write the saved status code to SF2.`);
    assert.match(source, /getSf2StatusCode\(null, true\)/, `${name} must write H for a selected holiday.`);
    assert.match(source, /isAttendedExportStatus\(savedStatus\)/, `${name} must count Late as attended.`);
    assert.match(source, /Attendance Detail/, `${name} must include an explicit-status worksheet.`);
    assert.doesNotMatch(source, /pastClassDays - absenceCount/, `${name} must not default a missing daily record to Present.`);
  }
  assert.match(adviserRoute, /shouldReplaceTimeIn/, "Adviser monthly data must retain the final saved Time In record.");
  assert.match(adviserRoute, /\.range\(from, from \+ pageSize - 1\)/, "Adviser monthly data must page through all attendance logs.");
  assert.match(adviserRoute, /schoolYearLabel/, "Adviser export must use the configured school-year label.");
  assert.match(principalRoute, /dailyStatuses/, "Principal summary must send final per-day statuses to its export.");
  assert.match(principalRoute, /schoolYearLabel/, "Principal export must use the configured school-year label.");
  assert.match(excuseDecisionRoute, /supabase\.rpc\("decide_excuse_letter"/, "Only the adviser approval workflow may create an approved excuse outcome.");
  assert.match(excuseDecisionRoute, /p_status: status/, "The excuse decision must pass the approved status to the attendance-updating RPC.");
  assert.doesNotMatch(automaticAbsence, /\.eq\("archive_status", "active"\)/, "Automatic absence marking must include imported learners with null archive status.");
  assert.match(automaticAbsence, /archiveStatus !== "archived" && archiveStatus !== "deleted"/, "Automatic absence marking must exclude only explicitly inactive learners.");

  console.log("Attendance export mark checks passed (✓, X, H, E, and No Record)." );
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
