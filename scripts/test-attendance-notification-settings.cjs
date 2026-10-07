/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

function loadModule(path, replacements = {}, globals = {}) {
  let source = fs.readFileSync(path, "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replace(from, to);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = { exports: {}, require, console, process, Buffer, AbortSignal, URLSearchParams, ...globals };
  vm.runInNewContext(output, sandbox);
  return sandbox.exports;
}

const settings = loadModule("src/lib/attendanceNotificationSettings.ts", {
  'import { supabase } from "@/lib/supabase";': "const supabase = {};",
});

assert.deepEqual({ ...settings.channelsForDelivery("sms") }, { smsEnabled: true, emailEnabled: false });
assert.deepEqual({ ...settings.channelsForDelivery("email") }, { smsEnabled: false, emailEnabled: true });
assert.deepEqual({ ...settings.channelsForDelivery("both") }, { smsEnabled: true, emailEnabled: true });
assert.deepEqual({ ...settings.channelsForDelivery("none") }, { smsEnabled: false, emailEnabled: false });
assert.equal(settings.deliveryFromChannels(true, false), "sms");
assert.equal(settings.deliveryFromChannels(false, true), "email");
assert.equal(settings.deliveryFromChannels(true, true), "both");
assert.equal(settings.deliveryFromChannels(false, false), "none");
assert.equal(settings.isLowSmsCredit(50, 50), true);
assert.equal(settings.isLowSmsCredit(51, 50), false);
assert.equal(settings.isLowSmsCredit(null, 50), false);
assert.equal(settings.normalizeLowCreditThreshold(0), 0);
assert.equal(settings.normalizeLowCreditThreshold(-1), null);

const schema = fs.readFileSync("database/20261006_attendance_notification_settings.sql", "utf8");
assert.match(schema, /attendance_notification_settings/i);
assert.match(schema, /insert into public\.attendance_notification_settings/i);
assert.match(schema, /attendance_email_jobs_one_delivery_per_event unique \(attendance_log_id\)/i);
assert.match(schema, /or not coalesce\(\(select sms_enabled/i);
assert.match(schema, /new\.via is distinct from 'RFID'/i);
const settingsRoute = fs.readFileSync("src/app/api/ict/attendance-notification-settings/route.ts", "utf8");
assert.match(settingsRoute, /updated_by_ict_id: ict\.id/);
assert.match(settingsRoute, /\.update\(\{/);

const disabledSmsQueue = loadModule("src/lib/attendanceSmsQueue.ts", {
  'import { supabase } from "@/lib/supabase";': "const supabase = { from: () => { throw new Error('should not query when disabled'); } };",
  'import { isAttendanceSmsEnabled } from "@/lib/attendanceNotificationSettings";': "const isAttendanceSmsEnabled = async () => false;",
  'import { parentAccountCanAccess } from "@/lib/parentAccountAccess";': "const parentAccountCanAccess = () => true;",
});

const dispatch = loadModule("src/lib/attendanceNotificationDispatch.ts");
(async () => {
  const disabledResult = await disabledSmsQueue.enqueueAttendanceSms({
    attendanceLogId: 11,
    studentId: "10000000001",
    studentName: "Mock Student",
    attendanceDate: "2026-10-06",
    timeLogged: "08:00:00",
  });
  assert.deepEqual({ ...disabledResult }, { queued: 0, skipped: true, disabled: true });

  // Provider or queue errors settle independently. A caller can therefore
  // return a successful attendance response before either task finishes.
  const outcomes = await dispatch.settleAttendanceNotificationTasks([
    { channel: "sms", run: async () => { throw new Error("mock SMS provider unavailable"); } },
    { channel: "email", run: async () => ({ queued: 1 }) },
  ]);
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].status, "rejected");
  assert.equal(outcomes[1].status, "fulfilled");

  function fakeResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  }
  const oldProvider = process.env.SMS_PROVIDER;
  const oldKey = process.env.SEMAPHORE_API_KEY;
  process.env.SMS_PROVIDER = "semaphore";
  process.env.SEMAPHORE_API_KEY = "test-key-only";
  try {
    let accountRequest = "";
    const provider = loadModule("src/lib/smsProvider.ts", {}, {
      fetch: async (url) => {
        accountRequest = String(url);
        return fakeResponse(200, { credit_balance: 17 });
      },
    });
    assert.equal(await provider.getSemaphoreCreditBalance(), 17);
    assert.match(accountRequest, /\/api\/v4\/account\?apikey=test-key-only/);

    const unavailableProvider = loadModule("src/lib/smsProvider.ts", {}, {
      fetch: async () => { throw new Error("mock provider unavailable"); },
    });
    await assert.rejects(unavailableProvider.getSemaphoreCreditBalance(), /could not be checked/i);
  } finally {
    if (oldProvider === undefined) delete process.env.SMS_PROVIDER;
    else process.env.SMS_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.SEMAPHORE_API_KEY;
    else process.env.SEMAPHORE_API_KEY = oldKey;
  }

  const scanRoute = fs.readFileSync("src/app/api/attendance/scan/route.ts", "utf8");
  const emailWorker = fs.readFileSync("src/lib/attendanceEmailWorker.ts", "utf8");
  assert.match(scanRoute, /queueNotificationsAfterAttendance/);
  assert.match(scanRoute, /settleAttendanceNotificationTasks/);
  assert.ok(scanRoute.indexOf('.from("attendance_logs")') < scanRoute.lastIndexOf("queueNotificationsAfterAttendance({"));
  assert.match(emailWorker, /status: "failed"/);
  assert.match(emailWorker, /Never retry automatically/);
  console.log("attendance notification choices, persistence schema, credit mocks, and provider-isolation tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
