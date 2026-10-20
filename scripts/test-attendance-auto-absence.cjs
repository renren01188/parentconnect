/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadTypeScriptModule(relativeFile, mocks = {}) {
  const filename = path.join(root, relativeFile);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    instance._compile(output, filename);
    return instance.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const absence = loadTypeScriptModule("src/lib/automaticAttendanceAbsence.ts", {
  "@/lib/supabase": { supabase: {} },
  "@/lib/audit": { logAudit: async () => undefined },
  "@/lib/schoolCalendar": { isScheduledAttendanceDate: () => true },
  "@/lib/attendanceScannerSchedule": {
    getSchoolClock: (now = new Date("2026-10-20T01:00:00.000Z")) => {
      const manila = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const hour = manila.getUTCHours();
      const minute = manila.getUTCMinutes();
      return {
        date: manila.toISOString().slice(0, 10),
        time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
        minutes: hour * 60 + minute,
      };
    },
    timeToMinutes: (value) => {
      const [hour, minute] = value.slice(0, 5).split(":").map(Number);
      return hour * 60 + minute;
    },
  },
});

// A session finishes at scheduled_end. The optional Absence After field is
// not an additional delay and RFID availability has no bearing on this rule.
assert.equal(absence.hasReachedSessionEnd(8 * 60 + 54, "08:55:00"), false);
assert.equal(absence.hasReachedSessionEnd(8 * 60 + 55, "08:55:00"), true);
assert.equal(absence.hasReachedSessionEnd(8 * 60 + 55, null), false);

const students = [
  { id: 1, student_id: "SCANNED", created_at: "2026-10-01T00:00:00.000Z" },
  { id: 2, student_id: "NO-SCAN", created_at: "2026-10-01T00:00:00.000Z" },
  { id: 3, student_id: "EXCUSED", created_at: "2026-10-01T00:00:00.000Z" },
  { id: 4, student_id: "NEW-TODAY", created_at: "2026-10-20T02:00:00.000Z" },
  { id: 5, student_id: "ENROLLED-BEFORE-END", created_at: "2026-10-20T00:30:00.000Z" },
];

const afterCompletedSession = absence.studentsMissingSessionAttendance({
  students,
  recordedStudentDbIds: [1], // RFID Time In is already Present/Late.
  excusedStudentIds: ["EXCUSED"],
  sessionDate: "2026-10-20",
});
assert.deepEqual(
  afterCompletedSession.map((student) => student.student_id),
  ["NO-SCAN"],
  "Only an enrolled, unrecorded, non-excused student receives Auto Absent.",
);

// The exact same missing-record calculation applies with the scanner disabled:
// it must not rely on an RFID card or an RFID-enabled flag.
const withRfidDisabled = absence.studentsMissingSessionAttendance({
  students,
  recordedStudentDbIds: [1],
  excusedStudentIds: ["EXCUSED"],
  sessionDate: "2026-10-20",
});
assert.deepEqual(withRfidDisabled.map((student) => student.student_id), ["NO-SCAN"]);

const sameDayEnrolment = absence.studentsMissingSessionAttendance({
  students,
  recordedStudentDbIds: [1],
  excusedStudentIds: ["EXCUSED"],
  sessionDate: "2026-10-20",
  sessionEnd: "08:55:00",
});
assert.deepEqual(
  sameDayEnrolment.map((student) => student.student_id),
  ["NO-SCAN", "ENROLLED-BEFORE-END"],
  "A student enrolled before today's session end is eligible; one enrolled after it is not retroactively absent.",
);

const repeatRun = absence.studentsMissingSessionAttendance({
  students,
  recordedStudentDbIds: [1, 2],
  excusedStudentIds: ["EXCUSED"],
  sessionDate: "2026-10-20",
});
assert.deepEqual(repeatRun, [], "A second run cannot create a duplicate absence.");

const processor = read("src/lib/automaticAttendanceAbsence.ts");
const studentRoute = read("src/app/api/students/route.ts");
const studentPage = read("src/app/dashboard/adviser/students/page.tsx");
const cronRoute = read("src/app/api/attendance/process-absences/route.ts");
const manualRoute = read("src/app/api/attendance/manual/route.ts");
const monthlyExportRoute = read("src/app/api/attendance/monthly/route.ts");
const vercel = JSON.parse(read("vercel.json"));

assert.match(processor, /hasReachedSessionEnd\(schoolClock\.minutes, session\.scheduled_end\)/);
assert.doesNotMatch(processor, /schoolClock\.minutes < timeToMinutes\(cutoff\)/);
assert.match(processor, /scope\?: AutomaticAbsenceScope/);
assert.match(processor, /isStudentInScope/);
assert.match(processor, /excuse_letters/);
assert.match(processor, /\.eq\("type", "Time In"\)/, "Only a missing Time In may be automatically marked absent.");
assert.match(processor, /status: "Absent"/);
assert.match(processor, /via: "Auto"/);
assert.match(processor, /rowError\.code === "23505"/, "Overlapping schedule invocations must safely reconcile duplicate writes.");
assert.match(processor, /sessionDate !== schoolClock\.date/, "The job must not silently backfill a historical day using the current clock.");
assert.match(processor, /isScheduledAttendanceDate/);
assert.match(processor, /school_holidays/);
assert.match(processor, /sessionEnd: session\.scheduled_end/, "The session-end processor must evaluate same-day enrolment against the saved session end.");
assert.match(studentRoute, /markAutomaticAbsences\(\{[\s\S]*?scope: \{ grade: adviser\.grade \?\? "", sections: \[activeSection\] \}/);
assert.match(studentRoute, /recordedStatus \?\? "—"/, "The adviser panel must render actual records, not infer an absence.");
assert.doesNotMatch(studentRoute, /hasReachedAbsenceCutoff/);
assert.doesNotMatch(studentPage, /isWeekendInApplicationTimezone/, "The Student panel must not hide configured weekend class records.");
assert.match(studentPage, /today_status: normalizeTodayStatus\(student\.today_status\)/, "The Student panel must display the server's schedule-aware status.");
assert.match(studentPage, /\["students", "accounts", "attendance", "dashboard"\]\.includes\(event\.scope\)/, "The Student panel must refresh after automatic attendance writes.");
assert.match(cronRoute, /CRON_SECRET/);
assert.match(cronRoute, /processDueAutomaticAbsences/);
assert.ok(
  vercel.crons.some((cron) => cron.path === "/api/attendance/process-absences" && cron.schedule === "* * * * *"),
  "A minute scheduler must invoke automatic absence processing.",
);
assert.match(monthlyExportRoute, /timeIn\?\.status === "Absent" \|\| isExcused/, "Exports must count Excused records with Absences while retaining their Excused detail status.");
assert.match(manualRoute, /Time Out requires a recorded On Time or Late Time In/);
assert.match(manualRoute, /A remark is required when correcting an automatic absence/);
assert.match(manualRoute, /existingSameType\.via === "Auto"/);

console.log("Automatic absence session-end, RFID-independent, scope, idempotency, and export checks passed.");
