/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
const scanRoute = read("src/app/api/attendance/scan/route.ts");
const correctionRoute = read("src/app/api/attendance/rapid-tap-correction/route.ts");
const queueStorage = read("src/lib/attendanceRapidTapQueue.ts");
const migration = read("supabase/migrations/20261022103000_add_attendance_scan_request_id.sql");

assert.match(adviserPage, /type RfidScannerMode = "default" \| "rapid"/);
assert.match(adviserPage, />\s*Default\s*</);
assert.match(adviserPage, />\s*Rapid Tap\s*</);
assert.match(adviserPage, /if \(rfidScannerMode === "rapid"\)[\s\S]*?enqueueRapidTapScan\(value\)/);
assert.match(adviserPage, /Rapid Tap captured/);
assert.match(adviserPage, /All attendance records have been recorded\. Thank you!/);
assert.match(adviserPage, /beforeunload/);
assert.match(adviserPage, /Finish or retry the Rapid Tap queue before switching to Default mode/);
assert.match(adviserPage, /scan_id: savingItem\.id/);
assert.match(adviserPage, /scan_date: savingItem\.scanDate/);
assert.match(adviserPage, /session_type: savingItem\.sessionType/);
assert.match(adviserPage, /reconcile_only: !isScanningOpen/);
assert.match(adviserPage, /needsManualReview\?: boolean/);
assert.match(adviserPage, /Confirming \$\{rapidTapPendingCount\} interrupted scan/);
assert.match(adviserPage, /requiresManualReview: true/);
assert.match(adviserPage, /applyManualReviewRapidTapScan/);
assert.match(adviserPage, /removeManualReviewRapidTapScan/);
assert.match(adviserPage, /\/api\/attendance\/rapid-tap-correction/);
assert.match(adviserPage, /setRapidTapResults\(\(current\) => current\.filter\(\(result\) => result\.id !== item\.id\)\)/, "Removing an item must clear its stale queue result.");
assert.match(adviserPage, /"Apply"/);
assert.match(adviserPage, />\s*Remove\s*</);
assert.match(adviserPage, /outOfSection\?: boolean/);
assert.match(adviserPage, /if \(data\.outOfSection\)[\s\S]*?removeRapidTapQueueItem\(savingItem\.id\)[\s\S]*?setScanMessage\(`⚠ \$\{message\} Ready for the next RFID tap\.\`\)/);
assert.match(adviserPage, /outcome: "out-of-section"/);

assert.match(queueStorage, /indexedDB\.open/);
assert.match(queueStorage, /queueOrder/);
assert.match(queueStorage, /scope/);
assert.match(queueStorage, /transaction\.oncomplete/);

assert.match(scanRoute, /scan_id\?: string/);
assert.match(scanRoute, /reconcile_only\?: boolean/);
assert.match(scanRoute, /getRecordedRapidTapScan/);
assert.match(scanRoute, /if \(reconcileOnly\)[\s\S]*needsManualReview: true/);
assert.match(scanRoute, /scan_request_id: scanRequestId \|\| null/);
assert.match(scanRoute, /requestedScanDate && requestedScanDate !== today/);
assert.match(scanRoute, /requestedSessionType && requestedSessionType !== sessionType/);
assert.match(scanRoute, /attendanceSuccessPayload\(recorded\.log, recorded\.student, true\)/);
assert.match(scanRoute, /outOfSection: Boolean\(anyStudent && anyStudent\.length > 0\)/);
assert.match(scanRoute, /This student is not in your assigned section\. No attendance was recorded\./);

assert.match(correctionRoute, /getAdviserFromToken/);
assert.match(correctionRoute, /getScheduledStudentLrns/);
assert.match(correctionRoute, /scanDate !== schoolClock\.date/);
assert.match(correctionRoute, /assignedSession !== sessionType/);
assert.match(correctionRoute, /scan_request_id", scanId/);
assert.match(correctionRoute, /existingTimeIn && !\(existingTimeIn\.status === "Absent" && existingTimeIn\.via === "Auto"\)/);
assert.match(correctionRoute, /Rapid Tap Attendance Corrected/);
assert.match(correctionRoute, /SMS skipped: Rapid Tap attendance was applied as an adviser correction\./);

assert.match(migration, /ADD COLUMN IF NOT EXISTS scan_request_id text/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_scan_request_id_unique/);

console.log("Rapid Tap RFID queue coverage checks passed.");
