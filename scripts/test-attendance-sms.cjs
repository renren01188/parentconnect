/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

// Execute the actual pure helpers without creating a Supabase client. The
// queue itself is covered by its database uniqueness constraint and worker.
let source = fs.readFileSync("src/lib/attendanceSmsQueue.ts", "utf8");
source = source.replace(
  /import \{ supabase \} from "@\/lib\/supabase";\r?\n/,
  "const supabase = {};\n",
);
source = source.replace(
  /import \{ parentAccountCanAccess \} from "@\/lib\/parentAccountAccess";\r?\n/,
  "const parentAccountCanAccess = () => true;\n",
);
source = source.replace(
  /import \{ isAttendanceSmsEnabled \} from "@\/lib\/attendanceNotificationSettings";\r?\n/,
  "const isAttendanceSmsEnabled = async () => true;\n",
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, require, console };
vm.runInNewContext(output, sandbox);
const sms = sandbox.exports;

assert.equal(
  sms.buildAttendanceSmsMessage({
    studentName: "Juan Dela Cruz",
    attendanceDate: "2026-09-12",
    timeLogged: "07:30:00",
  }),
  "PConnect: Your child, Juan Dela Cruz, recorded attendance at Santiago Elementary School on September 12, 2026 at 7:30 AM.",
);
assert.equal(sms.normalizePhilippineMobile("+63 917 123 4567"), "09171234567");
assert.equal(sms.normalizePhilippineMobile("12345"), "");
assert.equal(sms.formatAttendanceSmsTime("12:05:00"), "12:05 PM");

// An attendance event has exactly one durable job. Repeated RFID requests can
// therefore never make two queue rows for the same attendance log.
const queueSchema = fs.readFileSync("database/attendance_sms_queue.sql", "utf8");
const queueTrigger = fs.readFileSync("database/attendance_sms_enqueue_trigger.sql", "utf8");
const workerSource = fs.readFileSync("src/lib/attendanceSmsWorker.ts", "utf8");
assert.match(queueSchema, /unique\s*\(attendance_log_id\)/i);
assert.match(queueTrigger, /on conflict\s*\(attendance_log_id\)\s*do nothing/i);
assert.match(queueTrigger, /new\.via is distinct from 'RFID'/i);
assert.match(workerSource, /failStaleProcessingJobs/);
assert.match(workerSource, /UNKNOWN_PROCESSING_ERROR/);

function loadSmsProvider(fetchImpl) {
  const providerSource = fs.readFileSync("src/lib/smsProvider.ts", "utf8");
  const providerOutput = ts.transpileModule(providerSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const providerSandbox = {
    exports: {},
    require,
    console,
    process,
    Buffer,
    AbortSignal,
    URLSearchParams,
    fetch: fetchImpl,
  };
  vm.runInNewContext(providerOutput, providerSandbox);
  return providerSandbox.exports;
}

function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function testProviderHandling() {
  const oldProvider = process.env.SMS_PROVIDER;
  const oldKey = process.env.SEMAPHORE_API_KEY;
  process.env.SMS_PROVIDER = "semaphore";
  process.env.SEMAPHORE_API_KEY = "test-key-only";

  try {
    let submitted = "";
    const successProvider = loadSmsProvider(async (_url, init) => {
      submitted = String(init.body);
      return fakeResponse(200, {
        message_id: "mock-message-1",
        status: "Queued",
        number: "09171234567",
        message: "This must not be persisted in provider_response",
      });
    });
    const accepted = await successProvider.sendSms({
      recipient: "09171234567",
      message: "mock attendance message",
      queueId: "queue-1",
    });
    assert.match(submitted, /number=09171234567/);
    assert.deepEqual({ ...accepted.response }, {
      provider_status: "Queued",
      provider_message_id: "mock-message-1",
    });

    const rejectedProvider = loadSmsProvider(async () => fakeResponse(400, {
      error_code: "INVALID_RECIPIENT",
      number: "09171234567",
      message: "provider echoed the SMS content",
    }));
    await assert.rejects(
      rejectedProvider.sendSms({ recipient: "09171234567", message: "mock", queueId: "queue-2" }),
      (error) => {
        assert(error instanceof rejectedProvider.SmsProviderError);
        assert.equal(error.retryable, false);
        assert.equal(rejectedProvider.canRetrySmsProviderError(error), false);
        assert.deepEqual({ ...error.response }, { http_status: 400, provider_code: "INVALID_RECIPIENT" });
        assert.doesNotMatch(error.message, /09171234567|echoed/i);
        return true;
      },
    );

    const uncertainProvider = loadSmsProvider(async () => {
      throw new Error("network connection reset");
    });
    await assert.rejects(
      uncertainProvider.sendSms({ recipient: "09171234567", message: "mock", queueId: "queue-3" }),
      (error) => {
        assert(error instanceof uncertainProvider.SmsProviderError);
        assert.equal(error.outcomeUnknown, true);
        assert.equal(uncertainProvider.canRetrySmsProviderError(error), false);
        return true;
      },
    );
  } finally {
    if (oldProvider === undefined) delete process.env.SMS_PROVIDER;
    else process.env.SMS_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.SEMAPHORE_API_KEY;
    else process.env.SEMAPHORE_API_KEY = oldKey;
  }
}

testProviderHandling()
  .then(() => console.log("attendance SMS format, idempotency, and provider-mock tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
