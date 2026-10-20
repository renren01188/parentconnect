/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadTypeScriptModule(file) {
  const filename = path.join(root, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const {
  getSchoolClock,
  getSchoolYearScannerAvailability,
  getClassSessionAvailability,
} = loadTypeScriptModule("src/lib/attendanceScannerSchedule.ts");

// The configured school clock—not a browser timezone—drives all cutoffs.
assert.deepEqual(
  getSchoolClock(new Date("2026-10-20T00:49:00.000Z")),
  { date: "2026-10-20", time: "08:49:00", minutes: 529 },
);

const schoolYearStart = getSchoolYearScannerAvailability("2026-10-19", "2026-10-20", "2026-10-24");
assert.equal(schoolYearStart.available, false);
assert.match(schoolYearStart.message, /has not started/i);

const schoolYearActive = getSchoolYearScannerAvailability("2026-10-20", "2026-10-20", "2026-10-24");
assert.equal(schoolYearActive.available, true);

const schoolYearEnded = getSchoolYearScannerAvailability("2026-10-25", "2026-10-20", "2026-10-24");
assert.equal(schoolYearEnded.available, false);
assert.match(schoolYearEnded.message, /school year ended/i);

const beforeSession = getClassSessionAvailability(7 * 60 + 59, "08:00", "20:20");
assert.equal(beforeSession.status, "Not Started");
assert.equal(beforeSession.available, false);

const activeSession = getClassSessionAvailability(8 * 60, "08:00", "20:20");
assert.equal(activeSession.status, "Active");
assert.equal(activeSession.available, true);

const lastActiveMinute = getClassSessionAvailability(20 * 60 + 19, "08:00", "20:20");
assert.equal(lastActiveMinute.status, "Active");

// The session closes at its end time even though the school year is still open.
const endedSession = getClassSessionAvailability(20 * 60 + 20, "08:00", "20:20");
assert.equal(schoolYearActive.available, true);
assert.equal(endedSession.status, "Ended");
assert.equal(endedSession.available, false);
assert.match(endedSession.message, /class session has ended/i);

const scanRoute = read("src/app/api/attendance/scan/route.ts");
const classSessionRoute = read("src/app/api/attendance/class-session/route.ts");
const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");

assert.match(scanRoute, /getSchoolClock/);
assert.match(scanRoute, /getSchoolYearScannerAvailability/);
assert.match(scanRoute, /getClassSessionAvailability/);
assert.ok(
  scanRoute.indexOf("const sessionStatus = await getScheduledSessionStatus") < scanRoute.indexOf("let query = supabase"),
  "The schedule must reject an expired scan before an attendance record can be looked up or inserted.",
);
assert.match(scanRoute, /ICT-configured class schedule has ended/);
assert.match(classSessionRoute, /availability: schoolYearAvailability/);
assert.match(classSessionRoute, /no active school year is configured/);
assert.match(adviserPage, /data\.availability\?\.message/);
assert.match(adviserPage, /window\.setInterval\(refreshWhenVisible, 15_000\)/);

console.log("Attendance scanner school-year and class-session schedule checks passed.");
