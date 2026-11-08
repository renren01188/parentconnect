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
const todayStatus = loadTypeScriptModule("src/lib/todayAttendanceStatus.ts");

// ICT's saved Absent After time is the attendance deadline. It is independent
// of the scanning window, so no Morning/Afternoon preset changes it.
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
  "A student enrolled before today's absence deadline is eligible; one enrolled after it is not retroactively absent.",
);

const repeatRun = absence.studentsMissingSessionAttendance({
  students,
  recordedStudentDbIds: [1, 2],
  excusedStudentIds: ["EXCUSED"],
  sessionDate: "2026-10-20",
});
assert.deepEqual(repeatRun, [], "A second run cannot create a duplicate absence.");

const missingTimeOut = absence.studentsMissingSessionTimeOut({
  students,
  presentOrLateTimeInStudentDbIds: [1],
  recordedTimeOutStudentDbIds: [],
  excusedStudentIds: ["EXCUSED"],
});
assert.deepEqual(
  missingTimeOut.map((student) => student.student_id),
  ["SCANNED"],
  "A recorded On Time/Late arrival without a Time Out becomes final Absent after session end.",
);
assert.deepEqual(
  absence.studentsMissingSessionTimeOut({
    students,
    presentOrLateTimeInStudentDbIds: [1],
    recordedTimeOutStudentDbIds: [1],
    excusedStudentIds: ["EXCUSED"],
  }),
  [],
  "A recorded Time Out prevents a duplicate final-absent record.",
);

const scheduledSession = {
  isScheduledClassDay: true,
  hasScheduledSession: true,
  hasApprovedExcuse: false,
};
assert.equal(
  todayStatus.resolveTodayAttendanceStatus({ ...scheduledSession, recordedStatus: "Present", sessionEnded: false }),
  "Present",
  "A recorded RFID Time In must appear immediately, even before the class ends.",
);
assert.equal(
  todayStatus.resolveTodayAttendanceStatus({ ...scheduledSession, recordedStatus: "Late", sessionEnded: false }),
  "Late",
  "A late Time In must appear immediately, even before the class ends.",
);
assert.equal(
  todayStatus.resolveTodayAttendanceStatus({ ...scheduledSession, recordedStatus: "Absent", sessionEnded: false }),
  "—",
  "Absent must remain pending until ICT's configured absence deadline.",
);
assert.equal(
  todayStatus.resolveTodayAttendanceStatus({ ...scheduledSession, recordedStatus: "Absent", sessionEnded: true }),
  "Absent",
  "A durable absence must appear after ICT's configured absence deadline.",
);

const processor = read("src/lib/automaticAttendanceAbsence.ts");
const studentRoute = read("src/app/api/students/route.ts");
const studentPage = read("src/app/dashboard/adviser/students/page.tsx");
const cronRoute = read("src/app/api/attendance/process-absences/route.ts");
const manualRoute = read("src/app/api/attendance/manual/route.ts");
const monthlyExportRoute = read("src/app/api/attendance/monthly/route.ts");
const historyRoute = read("src/app/api/attendance/history/route.ts");
const principalSummaryRoute = read("src/app/api/attendance/monthly-summary/route.ts");
const vercel = JSON.parse(read("vercel.json"));

assert.match(processor, /const absenceDeadline = session\.absent_after \?\? session\.scheduled_end/);
assert.match(processor, /hasReachedSessionEnd\(schoolClock\.minutes, absenceDeadline\)/);
assert.doesNotMatch(processor, /schoolClock\.minutes < timeToMinutes\(cutoff\)/);
assert.match(processor, /scope\?: AutomaticAbsenceScope/);
assert.match(processor, /isStudentInScope/);
assert.match(processor, /processDueAutomaticAbsences[\s\S]*?activeStudentsForGrade/, "The scheduled worker must reuse its one roster read across due sessions.");
assert.match(processor, /\.eq\("grade", grade\)/, "An adviser-scope fallback must query only its grade instead of scanning every student.");
assert.match(processor, /excuse_letters/);
assert.match(processor, /studentsMissingSessionTimeOut/, "The worker must identify recorded arrivals that still lack a Time Out.");
assert.match(processor, /hasReachedSessionEnd\(schoolClock\.minutes, session\.scheduled_end\)/, "Final Absent must wait for the actual session end, rather than the no-show cutoff.");
assert.match(processor, /type: "Time Out" as const/, "The final Absent must preserve the original Time In as a separate event.");
assert.match(processor, /status: "Absent"/);
assert.match(processor, /via: "Auto"/);
assert.match(processor, /rowError\.code === "23505"/, "Overlapping schedule invocations must safely reconcile duplicate writes.");
assert.match(processor, /sessionDate !== schoolClock\.date/, "The job must not silently backfill a historical day using the current clock.");
assert.match(processor, /isScheduledAttendanceDate/);
assert.match(processor, /school_holidays/);
assert.match(processor, /sessionEnd: absenceDeadline/, "The absence processor must evaluate same-day enrolment against ICT's saved Absent After time.");
assert.match(studentRoute, /markAutomaticAbsences\(\{[\s\S]*?scope: \{ grade: adviser\.grade \?\? "", sections: \[activeSection\] \}/);
assert.match(studentRoute, /resolveTodayAttendanceStatus/, "The adviser panel must render durable Present\/Late records immediately.");
assert.match(studentRoute, /finalAttendanceBySession/, "The adviser roster must resolve one final status per student, date, and session.");
assert.match(studentRoute, /log\.type === "Time Out"[\s\S]*?status === "Absent"/, "A final Absent Time Out must override the provisional Time In on the adviser roster.");
assert.match(studentRoute, /hasReachedSessionEnd\(schoolClock\.minutes, session\.absent_after \?\? session\.scheduled_end\)/, "The adviser panel must defer Absent until ICT's saved Absent After time.");
assert.doesNotMatch(studentRoute, /registeredTodayIds/, "A student registered today must still display a recorded RFID Time In.");
assert.doesNotMatch(studentRoute, /hasReachedAbsenceCutoff/);
assert.doesNotMatch(studentPage, /isWeekendInApplicationTimezone/, "The Student panel must not hide configured weekend class records.");
assert.match(studentPage, /today_status: normalizeTodayStatus\(student\.today_status\)/, "The Student panel must display the server's schedule-aware status.");
assert.match(studentPage, /\["students", "accounts", "attendance", "dashboard"\]\.includes\(event\.scope\)/, "The Student panel must refresh after automatic attendance writes.");
assert.match(cronRoute, /CRON_SECRET/);
assert.match(cronRoute, /processDueAutomaticAbsences/);
assert.ok(
  vercel.crons.some((cron) => cron.path === "/api/attendance/process-absences" && cron.schedule === "*/5 * * * *"),
  "A five-minute scheduler must invoke automatic absence processing without continuously saturating the database.",
);
assert.match(monthlyExportRoute, /resolveFinalAttendanceExport\(/, "Adviser monthly data must resolve the final daily status from the saved Time In and Time Out records.");
assert.match(monthlyExportRoute, /is_auto_missing_time_out_absence/, "Adviser monthly data must preserve the automatic missing-Time-Out absence for SF2 rendering.");
assert.match(historyRoute, /timeOutLog\?\.status === "Absent"/, "Adviser history must show final Absent rather than the provisional Time In status.");
assert.match(principalSummaryRoute, /resolveFinalAttendanceExport\(/, "Principal summaries must use the same final Absent Time Out rule.");
assert.match(principalSummaryRoute, /dailyAutoMissingTimeOutAbsences/, "Principal summaries must preserve automatic missing-Time-Out absences for SF2 rendering.");
assert.match(manualRoute, /Time Out requires a recorded On Time or Late Time In/);
assert.match(manualRoute, /A remark is required when correcting an automatic absence/);
assert.match(manualRoute, /existingSameType\.via === "Auto"/);

console.log("Automatic absence cutoff, RFID-independent, scope, idempotency, and export checks passed.");
