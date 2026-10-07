/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const source = fs.readFileSync("src/lib/rfid.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(output, sandbox);
const rfid = sandbox.exports;

assert.equal(rfid.normalizeRfidCard(" 04a1b2c3\r\n"), "04A1B2C3");
assert.equal(rfid.normalizeRfidCard(null), "");

// Reproduce the first-tap race: React state contains the UID before the final
// character, while the Enter event's input value already contains the full UID.
const staleReactState = "04A1B2C";
const enterEventInput = "04a1b2c3\r";
assert.equal(rfid.resolveRfidScanValue(enterEventInput, staleReactState), "04A1B2C3");
assert.equal(rfid.resolveRfidScanValue("", staleReactState), "04A1B2C");

const attendancePage = fs.readFileSync("src/app/dashboard/adviser/attendance/page.tsx", "utf8");
const scanRoute = fs.readFileSync("src/app/api/attendance/scan/route.ts", "utf8");
assert.match(attendancePage, /handleScan\(e\.currentTarget\.value\)/);
assert.match(attendancePage, /scanInFlightRef\.current/);
assert.match(scanRoute, /const rfidCard = normalizeRfidCard\(body\.rfid_card\)/);
assert.match(scanRoute, /\.ilike\("rfid_card", rfidCard\)/);
assert.match(scanRoute, /RFID_TIME_OUT_MIN_DELAY_SECONDS/);
assert.match(scanRoute, /60 \* 60/);

console.log("RFID first-tap and normalized-lookup tests passed");
