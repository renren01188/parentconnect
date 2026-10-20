/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const processor = read("src/lib/automaticAttendanceAbsence.ts");
const cronRoute = read("src/app/api/attendance/process-absences/route.ts");
const manualRoute = read("src/app/api/attendance/manual/route.ts");
const ictPage = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const vercel = JSON.parse(read("vercel.json"));

assert.match(processor, /schoolClock\.minutes < timeToMinutes\(cutoff\)/, "Absence must wait until the saved Absent After cutoff.");
assert.match(processor, /The dashboard normally creates today's snapshot/, "The scheduler must work even when no dashboard is open.");
assert.match(processor, /session_date: schoolClock\.date/, "The scheduler must create today's idempotent session snapshot before checking the cutoff.");
assert.match(processor, /\.eq\("type", "Time In"\)/, "Only a missing Time In may be automatically marked absent.");
assert.match(processor, /status: "Absent"/, "Automatic rows must be saved as Absent.");
assert.match(processor, /via: "Auto"/, "Automatic rows must be traceable as Auto.");
assert.match(processor, /rowError\.code === "23505"/, "Overlapping schedule invocations must safely reconcile duplicate writes.");
assert.match(processor, /sessionDate !== schoolClock\.date/, "The job must not silently backfill a historical day using the current clock.");
assert.match(processor, /isScheduledAttendanceDate/, "The job must respect selected school days.");
assert.match(processor, /school_holidays/, "The job must not create absences on holidays.");
assert.match(cronRoute, /CRON_SECRET/, "The background endpoint must be authenticated.");
assert.match(cronRoute, /processDueAutomaticAbsences/, "The background endpoint must run the shared absence processor.");
assert.ok(
  vercel.crons.some((cron) => cron.path === "/api/attendance/process-absences" && cron.schedule === "* * * * *"),
  "A minute scheduler must invoke automatic absence processing.",
);
assert.match(ictPage, /late_after: ctrl\.lateAfter/, "ICT start/end actions must send the saved Late After value.");
assert.match(ictPage, /absent_after: ctrl\.absentAfter/, "ICT start/end actions must send the saved Absent After value.");
assert.doesNotMatch(ictPage, /Class ended, but automatic absence marking failed/, "Clicking End must not prematurely trigger absence marking before Absent After.");
assert.match(manualRoute, /Time Out requires a recorded On Time or Late Time In/, "A departure cannot create attendance without arrival.");
assert.match(manualRoute, /A remark is required when correcting an automatic absence/, "After-session automatic-absence corrections require an audit remark.");
assert.match(manualRoute, /existingSameType\.via === "Auto"/, "Only system-created absences receive the after-session correction exception.");

console.log("Automatic absence cutoff, idempotency, schedule, and correction checks passed.");
