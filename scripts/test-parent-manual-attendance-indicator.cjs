/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/legacy-migrations/20261023103000_add_parent_attendance_recording_source.sql");
const manual = read("src/app/api/attendance/manual/route.ts");
const scan = read("src/app/api/attendance/scan/route.ts");
const rapidTap = read("src/app/api/attendance/rapid-tap-correction/route.ts");
const edit = read("src/app/api/attendance/edit/route.ts");
const history = read("src/app/api/attendance/parent-history/route.ts");
const parentPage = read("src/app/dashboard/parent/attendance/page.tsx");

// Persist a source that cannot be confused with the mutable operational
// `via` field used by Adviser corrections.
assert.match(migration, /ADD COLUMN IF NOT EXISTS parent_recording_source text/);
assert.match(migration, /IN \('RFID', 'Manual'\)/);
assert.match(migration, /via = 'RFID'/);
assert.match(migration, /Historical Manual rows are not/);

// Today's Manual Attendance alone marks its inserts and corrections Manual.
assert.match(manual, /update\(\{ parent_recording_source: "Manual" \}\)/);
assert.match(manual, /parent_recording_source: "Manual"/);
assert.match(scan, /parent_recording_source: "RFID"/);
assert.match(rapidTap, /parent_recording_source: "RFID"/);
assert.doesNotMatch(edit, /parent_recording_source/);

// Parent history groups both recording methods per saved attendance date and
// keeps source separate from the status used by summary calculations.
assert.match(history, /parent_recording_source/);
assert.match(history, /rfid_scan: boolean/);
assert.match(history, /manual_attendance: boolean/);
assert.match(history, /if \(log\.parent_recording_source === "RFID"\)/);
assert.match(history, /if \(log\.parent_recording_source === "Manual"\)/);
assert.match(history, /const present = records\.filter/);

// The Parent monthly table renders exact RFID Scan and Manual indicators and
// formats the stored calendar date without a browser-timezone shift.
assert.match(parentPage, /type AttendanceRecordingSource = "RFID Scan" \| "Manual"/);
assert.match(parentPage, /recordingSources/);
assert.match(parentPage, /recordingSourceBadgeClass/);
assert.match(parentPage, /timeZone: "UTC"/);
assert.match(parentPage, /recordingSources\.push\("RFID Scan"\)/);
assert.match(parentPage, /recordingSources\.push\("Manual"\)/);
assert.match(parentPage, /Recorded Via/);

console.log("Parent manual-attendance indicator checks passed.");
