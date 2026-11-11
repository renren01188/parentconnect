/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

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

const worker = loadTypeScriptModule("src/lib/attendanceSmsWorker.ts", {
  "@/lib/supabase": { supabase: {} },
  "@/lib/attendanceNotificationSettings": { isAttendanceSmsEnabled: async () => true },
  "@/lib/attendanceSmsRoute": { configuredAttendanceSmsRoute: () => "regular" },
  "@/lib/deletionEmailQueue": { mapWithConcurrency: async () => [] },
  "@/lib/smsProvider": {
    getSemaphoreMessageStatus: async () => ({ state: "sent" }),
    sendSms: async () => ({}),
    SmsProviderError: class SmsProviderError extends Error {},
  },
});

const workerSource = read("src/lib/attendanceSmsWorker.ts");
const absenceSource = read("src/lib/automaticAttendanceAbsence.ts");
const migration = read("supabase/legacy-migrations/20261023101000_reduce_attendance_worker_cpu.sql");

assert.equal(worker.shouldRunScheduledSemaphoreReconciliation(0), true);
assert.equal(worker.shouldRunScheduledSemaphoreReconciliation(60_000), false);
assert.equal(worker.shouldRunScheduledSemaphoreReconciliation(5 * 60_000), true);
assert.match(workerSource, /SCHEDULED_SEMAPHORE_RECONCILIATION_INTERVAL_MINUTES = 5/);
assert.match(workerSource, /processAttendanceSmsJobs\(\{[\s\S]*?reconcile: shouldRunScheduledSemaphoreReconciliation\(\)/);
assert.match(workerSource, /options\?\.reconcile === false[\s\S]*?checked: 0/);
assert.match(workerSource, /claimFreshJob\(options\?\.attendanceLogId\)/, "Fresh SMS jobs must still be claimed on every dispatcher pass.");

assert.match(absenceSource, /const sessionsByScope = new Map<string, SessionSchedule>\(\)/);
assert.match(absenceSource, /\.eq\("session_date", schoolClock\.date\)[\s\S]*?\.in\("grade", gradeNames\)[\s\S]*?\.in\("session_type", \["Morning", "Afternoon"\]\)/);
assert.match(absenceSource, /sessionsByScope\.get\(`\$\{grade\}\|\$\{sessionType\}`\)[\s\S]*?getOrCreateSessionSnapshot/);

assert.match(migration, /audit_log_password_session_revocation_lookup_idx/);
assert.match(migration, /target_type = 'user'/);
assert.match(migration, /parents_student_id_idx/);

console.log("Attendance worker CPU safeguards passed.");
