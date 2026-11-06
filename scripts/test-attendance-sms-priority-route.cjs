const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function loadTypeScriptModule(relativeFile) {
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
  instance._compile(output, filename);
  return instance.exports;
}

const originalFetch = global.fetch;
const originalProvider = process.env.SMS_PROVIDER;
const originalKey = process.env.SEMAPHORE_API_KEY;
const originalAttendanceRoute = process.env.SEMAPHORE_ATTENDANCE_ROUTE;

void (async () => {
  try {
    delete process.env.SEMAPHORE_ATTENDANCE_ROUTE;
    const route = loadTypeScriptModule("src/lib/attendanceSmsRoute.ts");
    assert.equal(route.configuredAttendanceSmsRoute(undefined), "regular");
    assert.equal(route.configuredAttendanceSmsRoute("regular"), "regular");
    assert.equal(route.configuredAttendanceSmsRoute(" priority "), "priority");
    assert.equal(route.configuredAttendanceSmsRoute("unexpected-value"), "regular");

    process.env.SMS_PROVIDER = "semaphore";
    process.env.SEMAPHORE_API_KEY = "test-semaphore-key";
    const requestedUrls = [];
    const requestBodies = [];
    global.fetch = async (url, options) => {
      requestedUrls.push(String(url));
      requestBodies.push(String(options?.body ?? ""));
      return new Response(JSON.stringify([{ message_id: "provider-message-id", status: "Pending" }]), { status: 200 });
    };

    const smsProvider = loadTypeScriptModule("src/lib/smsProvider.ts");
    const priorityResult = await smsProvider.sendSms({
      recipient: "09171234567",
      message: "Attendance test",
      queueId: "attendance-sms-test-job",
      semaphoreRoute: "priority",
    });
    const regularResult = await smsProvider.sendSms({
      recipient: "09171234567",
      message: "Attendance test",
      queueId: "attendance-sms-test-job",
    });
    const otpResult = await smsProvider.sendSms({
      recipient: "09171234567",
      message: "ParentConnect verification code: {otp}.",
      queueId: "parent-otp-test",
      semaphoreRoute: "otp",
      semaphoreOtpCode: "123456",
    });

    assert.deepEqual(requestedUrls, [
      "https://api.semaphore.co/api/v4/priority",
      "https://api.semaphore.co/api/v4/messages",
      "https://api.semaphore.co/api/v4/otp",
    ]);
    assert.match(requestBodies[2], /(?:^|&)code=123456(?:&|$)/);
    assert.match(requestBodies[2], /message=ParentConnect\+verification\+code%3A\+%7Botp%7D\./);
    assert.equal(priorityResult.providerRoute, "priority");
    assert.equal(priorityResult.response.provider_route, "priority");
    assert.equal(regularResult.providerRoute, "regular");
    assert.equal(regularResult.response.provider_route, "regular");
    assert.equal(otpResult.providerRoute, "otp");
    assert.equal(otpResult.response.provider_route, "otp");
  } finally {
    global.fetch = originalFetch;
    if (originalProvider === undefined) delete process.env.SMS_PROVIDER;
    else process.env.SMS_PROVIDER = originalProvider;
    if (originalKey === undefined) delete process.env.SEMAPHORE_API_KEY;
    else process.env.SEMAPHORE_API_KEY = originalKey;
    if (originalAttendanceRoute === undefined) delete process.env.SEMAPHORE_ATTENDANCE_ROUTE;
    else process.env.SEMAPHORE_ATTENDANCE_ROUTE = originalAttendanceRoute;
  }

  const attendanceWorkerSource = fs.readFileSync(path.join(root, "src/lib/attendanceSmsWorker.ts"), "utf8");
  assert.match(attendanceWorkerSource, /semaphoreRoute:\s*configuredAttendanceSmsRoute\(\)/);

  console.log("Attendance SMS Priority-route configuration and endpoint selection passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
