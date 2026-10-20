const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

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

const smsQueue = loadTypeScriptModule("src/lib/attendanceSmsQueue.ts", {
  "@/lib/supabase": { supabase: {} },
  "@/lib/attendanceNotificationSettings": { isAttendanceSmsEnabled: async () => true },
  "@/lib/parentAccountAccess": { parentAccountCanAccess: () => true },
});

const studentName = "DAVID DAVID DAVID";
const timeInMessage = smsQueue.buildAttendanceSmsMessage({
  studentName,
  attendanceDate: "2026-10-19",
  timeLogged: "07:05:00",
  attendanceType: "Time In",
});
const timeOutMessage = smsQueue.buildAttendanceSmsMessage({
  studentName,
  attendanceDate: "2026-10-19",
  timeLogged: "16:37:00",
  attendanceType: "Time Out",
});

assert.equal(
  timeInMessage,
  "PConnect: Good Morning! DAVID DAVID DAVID scanned their RFID tag upon entering the classroom on October 19, 2026, at 7:05 AM.",
);
assert.equal(
  timeOutMessage,
  "PConnect: Good Afternoon! DAVID DAVID DAVID scanned their RFID tag upon leaving the classroom on October 19, 2026, at 4:37 PM.",
);

// Execute the real Semaphore request builder with a mocked network request.
// This validates the exact payload that would be sent without sending an SMS.
const originalFetch = global.fetch;
const originalProvider = process.env.SMS_PROVIDER;
const originalKey = process.env.SEMAPHORE_API_KEY;
const originalSenderName = process.env.SEMAPHORE_SENDER_NAME;
let capturedRequest = null;

void (async () => {
try {
  process.env.SMS_PROVIDER = "semaphore";
  process.env.SEMAPHORE_API_KEY = "test-semaphore-key";
  delete process.env.SEMAPHORE_SENDER_NAME;
  const capturedRequests = [];
  global.fetch = async (url, init) => {
    capturedRequests.push({ url: String(url), init });
    capturedRequest = capturedRequests[0];
    return new Response(JSON.stringify([{ message_id: "provider-message-id", status: "Queued" }]), { status: 200 });
  };

  const smsProvider = loadTypeScriptModule("src/lib/smsProvider.ts");
  const result = await smsProvider.sendSms({
    recipient: "09171234567",
    message: timeInMessage,
    queueId: "attendance-sms-test-job",
  });
  const timeOutResult = await smsProvider.sendSms({
    recipient: "09171234567",
    message: timeOutMessage,
    queueId: "attendance-sms-test-job-time-out",
  });

  assert.equal(result.provider, "semaphore");
  assert.equal(timeOutResult.provider, "semaphore");
  assert.equal(capturedRequests.length, 2);
  assert.equal(capturedRequest.url, "https://api.semaphore.co/api/v4/messages");
  assert.equal(capturedRequest.init.method, "POST");
  assert.equal(capturedRequest.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(capturedRequest.init.body);
  assert.equal(form.get("apikey"), "test-semaphore-key");
  assert.equal(form.get("number"), "09171234567");
  assert.equal(form.get("message"), timeInMessage);
  const timeOutForm = new URLSearchParams(capturedRequests[1].init.body);
  assert.equal(timeOutForm.get("message"), timeOutMessage);
} finally {
  global.fetch = originalFetch;
  if (originalProvider === undefined) delete process.env.SMS_PROVIDER;
  else process.env.SMS_PROVIDER = originalProvider;
  if (originalKey === undefined) delete process.env.SEMAPHORE_API_KEY;
  else process.env.SEMAPHORE_API_KEY = originalKey;
  if (originalSenderName === undefined) delete process.env.SEMAPHORE_SENDER_NAME;
  else process.env.SEMAPHORE_SENDER_NAME = originalSenderName;
}

const queueSource = fs.readFileSync(path.join(root, "src/lib/attendanceSmsQueue.ts"), "utf8");
const workerSource = fs.readFileSync(path.join(root, "src/lib/attendanceSmsWorker.ts"), "utf8");
const unismsStatusSource = fs.readFileSync(
  path.join(root, "src/app/api/webhooks/unisms/sms-status/route.ts"),
  "utf8",
);
const scanSource = fs.readFileSync(path.join(root, "src/app/api/attendance/scan/route.ts"), "utf8");
const normalizedJobsMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261020090000_normalize_attendance_sms_jobs.sql"),
  "utf8",
);
assert.doesNotMatch(queueSource, /recorded attendance at Santiago Elementary School/i);
assert.doesNotMatch(queueSource, /attendanceGreeting/);
for (const source of [queueSource, workerSource, unismsStatusSource]) {
  assert.match(source, /attendance_sms_jobs/);
  assert.doesNotMatch(source, /attendance_sms_job(?!s)/);
}
assert.match(queueSource, /\.update\(\{ message \}\)[\s\S]*?\.eq\("status", "pending"\)/);
assert.match(queueSource, /onConflict: "attendance_log_id,parent_id"/);
assert.match(workerSource, /sendSms\(\{ recipient: job\.recipient_phone, message: job\.message, queueId: job\.id \}\)/);
assert.doesNotMatch(scanSource, /PConnect:\s*Your child/i);
assert.match(scanSource, /enqueueAttendanceSms\(input\)[\s\S]*processAttendanceSmsJobs\(\{ attendanceLogId: input\.attendanceLogId/);
assert.match(normalizedJobsMigration, /sms_job\.status = 'pending'/);
assert.match(normalizedJobsMigration, /PConnect: Good Morning!/);
assert.match(normalizedJobsMigration, /PConnect: Good Afternoon!/);
assert.match(normalizedJobsMigration, /attendance_sms_jobs_template_guard/);

console.log("RFID Time In/Out SMS templates and Semaphore payload checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
