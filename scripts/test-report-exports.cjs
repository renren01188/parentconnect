/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const ExcelJS = require("exceljs");

function read(...parts) {
  return fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
}

const modal = read("src", "components", "reports", "ConcernExportModal.tsx");
const adviserPage = read("src", "app", "dashboard", "adviser", "reports", "page.tsx");
const guidancePage = read("src", "app", "dashboard", "guidance", "reports", "page.tsx");
const principalPage = read("src", "app", "dashboard", "principal", "reports", "page.tsx");
const exportLibrary = read("src", "lib", "guidanceReportExport.ts");
const reportsApi = read("src", "app", "api", "reports", "parent-adviser", "route.ts");

// Every dashboard gets the same explicit export choices and clear error state.
assert.match(modal, /ConcernExportFormat = "excel" \| "pdf"/);
assert.match(modal, /ConcernExportScope = "all" \| "specific"/);
assert.match(modal, /allLabel = "All Concerns"/);
assert.match(modal, /\$\{allLabel\} \(\$\{options\.length\}\)/);
assert.match(modal, /Specific Concern/);
assert.match(modal, /matching the active filters/);
assert.match(modal, /setError\(/);
assert.match(modal, /themeClasses/);

// Adviser exports exactly the concerns matching its status/category filters.
assert.match(adviserPage, /const exportableReports = reports\.filter/);
assert.match(adviserPage, /adviserReportStatusCategory\(report\)/);
assert.match(adviserPage, /<ConcernExportModal/);
assert.match(adviserPage, /theme="emerald"/);
assert.match(adviserPage, /role=adviser&reportId=\$\{id\}/);
assert.match(adviserPage, /items\.length !== reportIds\.length/);
assert.match(adviserPage, /buildAdviserReportsExcel/);
assert.match(adviserPage, /buildAdviserReportsPdf/);

// Guidance retains its established all/specific filtered export flow.
assert.match(guidancePage, /function ExportReportsModal/);
assert.match(guidancePage, /All Concerns \(\$\{reports\.length\}\)/);
assert.match(guidancePage, /Specific Concern/);
assert.match(guidancePage, /filterGuidanceReports\(reports, filterTab, categoryFilter\)/);
assert.match(guidancePage, /role=guidance&reportId=\$\{id\}/);
assert.match(guidancePage, /items\.length !== reportIds\.length/);
assert.match(guidancePage, /setExportError\(/);

// Principal starts from the already-filtered, role-authorized monitoring list
// and narrows it to one record only when the user selects a specific concern.
assert.match(principalPage, /<ConcernExportModal/);
assert.match(principalPage, /theme="violet"/);
assert.match(principalPage, /scope === "all" \? items : selected \? \[selected\] : \[\]/);
assert.match(principalPage, /items=\{filteredMonitoringEntries\}/);
assert.match(principalPage, /exportMonitoringToExcel\(exportItems, exportSummary, filename\)/);
assert.match(principalPage, /exportMonitoringToPdf\(exportItems, exportSummary, filename\)/);

// Export requests never bypass the existing role-specific authorization paths.
assert.match(reportsApi, /if \(role === "adviser"\)/);
assert.match(reportsApi, /\.eq\("adviser_id", adviser\.id\)/);
assert.match(reportsApi, /if \(role === "guidance"\)/);
assert.match(reportsApi, /\.eq\("escalated_to_guidance", true\)/);
assert.match(reportsApi, /if \(role === "principal"\)/);

// The shared Excel/PDF builders preserve the office identity, generated time,
// filter summary, and a readable table while allowing Adviser branding.
assert.match(exportLibrary, /reportTitle\?: string/);
assert.match(exportLibrary, /sheetName\?: string/);
assert.match(exportLibrary, /confidentialityLabel\?: string/);
assert.match(exportLibrary, /accentColor\?: string/);
assert.match(exportLibrary, /Active filters:/);
assert.match(exportLibrary, /Included records:/);
assert.match(exportLibrary, /wrapText: true/);
assert.match(exportLibrary, /Page \$\{index \+ 1\} of \$\{pages\.length\}/);

function loadTypeScriptModule(source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  const testRequire = (request) => {
    const imported = require(request);
    // TypeScript lowers the dynamic ExcelJS import to require() in this
    // Node-only regression harness. Mirror the bundler's default-import shape.
    return request === "exceljs" ? { default: imported.default ?? imported } : imported;
  };
  new Function("exports", "module", "require", compiled)(loadedModule.exports, loadedModule, testRequire);
  return loadedModule.exports;
}

async function verifyFormattedExportOutput() {
  const exporter = loadTypeScriptModule(exportLibrary);
  const items = [{
    id: 44,
    parent_name: "Avery Parent",
    student_name: "Jamie Learner",
    grade: "Grade 5",
    section: "Exodus",
    subject: "Attendance concern",
    categories: ["Attendance", "Health/Medical"],
    concernLevel: 75,
    status: "Ongoing",
    submitted_at: "November 5, 2026, 10:40 AM",
    attachment: "medical-note.pdf",
    message: "Please review the attendance record for this learner.",
  }];
  const context = {
    scopeLabel: "Selected report",
    filters: ["Status: Ongoing", "Category: Attendance"],
    generatedAt: new Date("2026-11-05T02:45:00.000Z"),
    reportTitle: "Adviser Reports",
    sheetName: "Adviser Reports",
    schoolName: "Santiago Elementary School - Adviser Office",
    confidentialityLabel: "Confidential - Adviser use only",
    accentColor: "FF059669",
  };

  const excelBlob = await exporter.createGuidanceReportsExcel(items, context);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await excelBlob.arrayBuffer());
  const sheet = workbook.getWorksheet("Adviser Reports");
  assert.ok(sheet, "The Adviser export must create a readable, role-labeled worksheet.");
  assert.equal(sheet.getCell("A1").value, "Adviser Reports");
  assert.equal(sheet.getCell("A2").value, "Santiago Elementary School - Adviser Office");
  assert.match(String(sheet.getCell("A3").value), /Included records: 1/);
  assert.match(String(sheet.getCell("A4").value), /Status: Ongoing/);
  assert.equal(sheet.getCell("A7").value, "Report #");
  assert.equal(sheet.getCell("B8").value, "Avery Parent");
  assert.equal(sheet.getCell("K8").value, "Please review the attendance record for this learner.");
  assert.equal(sheet.getCell("A1").fill.fgColor.argb, "FF059669");

  const pdfBlob = exporter.createGuidanceReportsPdf(items, context);
  const pdf = await pdfBlob.text();
  assert.match(pdf, /Adviser Reports/);
  assert.match(pdf, /Confidential - Adviser use only/);
  assert.match(pdf, /Status: Ongoing/);
}

verifyFormattedExportOutput()
  .then(() => console.log("role report export coverage checks passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
