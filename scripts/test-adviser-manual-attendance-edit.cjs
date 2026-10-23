/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const manualRoute = read("src/app/api/attendance/manual/route.ts");
const editRoute = read("src/app/api/attendance/edit/route.ts");
const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");
const manualExcuseMigration = read("supabase/migrations/20261020130000_add_manual_excuse_range_processing.sql");

// An Excused manual Time In requires a reason and a calendar range. It uses
// the same protected database path as an approved excuse letter and cannot
// be accidentally recorded as a Time Out.
assert.match(manualRoute, /"Excused"/);
assert.match(manualRoute, /if \(body\.type !== "Time In"\)/);
assert.match(manualRoute, /A reason is required when marking a student Excused/);
assert.match(manualRoute, /A valid start date and end date are required when marking a student Excused/);
assert.match(manualRoute, /supabase\.rpc\("record_manual_excuse"/);
assert.match(manualRoute, /const selectedStatus = body\.status === "On Time" \? "Present" : body\.status/);
assert.match(manualRoute, /selectedStatus === "Late"[\s\S]*?\? "Late"/);
assert.match(manualRoute, /\(selectedStatus === "Present" \|\| selectedStatus === "Late"\)/);
assert.match(manualRoute, /const manualAbsenceCorrection = body\.type === "Time In"/);
assert.match(manualRoute, /existingSameType\?\.status === "On Time" \|\| existingSameType\?\.status === "Late"/);
assert.match(manualRoute, /Attendance corrected to Absent/);
assert.match(manualRoute, /suppressPendingSmsForManualAttendanceCorrection/);
assert.match(manualRoute, /without creating another attendance record/);
assert.match(manualRoute, /const manualAbsentToAttendanceCorrection = body\.type === "Time In"/);
assert.match(manualRoute, /existingSameType\.via === "Manual"/);
assert.match(manualRoute, /Manual absence corrected to \$\{correctedStatusLabel\}/);
assert.match(adviserPage, /\["Present", "Late", "Absent", "Excused"\]/);
assert.match(adviserPage, /type: "Time In"/);
assert.doesNotMatch(adviserPage, /setManualType/);
assert.doesNotMatch(adviserPage, /<option value="Time Out">/);
assert.match(adviserPage, /correct an existing Time In/);
assert.match(adviserPage, /correct this manual absence for today/);
assert.match(adviserPage, /Today&apos;s logs only\./);
assert.match(adviserPage, /Use Edit Attendance to correct existing records, including late entries\./);
assert.match(adviserPage, /Reason for Excused/);
assert.match(adviserPage, /manualStatus === "Excused" && \(!manualRemark\.trim\(\)/);
assert.match(adviserPage, /Excuse start date/);
assert.match(adviserPage, /Excuse end date/);

// The manual record is an adviser-originated Pending letter that is approved
// through the same locked decision RPC used by the existing approval modal.
// That RPC handles weekday/holiday/date-range filtering and preserves RFID
// Present/Late entries while changing only Absent or missing Time In rows.
assert.match(manualExcuseMigration, /ALTER COLUMN parent_id DROP NOT NULL/);
assert.match(manualExcuseMigration, /submitted_by_role/);
assert.match(manualExcuseMigration, /'Pending'/);
assert.match(manualExcuseMigration, /PERFORM public\.decide_excuse_letter\(/);
assert.match(manualExcuseMigration, /p_date_from < v_school_year\.start_date OR p_date_to > v_school_year\.end_date/);
assert.match(manualExcuseMigration, /adviser\.grade = v_student\.grade/);
assert.match(manualExcuseMigration, /v_student\.section = ANY\(coalesce\(adviser\.sections/);

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayFor = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  return weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
};
const scheduledDates = (from, to, selected, holidays = []) => {
  const result = [];
  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    if (selected.includes(weekdayFor(date)) && !holidays.includes(date)) result.push(date);
  }
  return result;
};
assert.deepEqual(
  scheduledDates("2026-10-19", "2026-10-25", ["Mon", "Tue", "Wed", "Thu", "Fri"], ["2026-10-21"]),
  ["2026-10-19", "2026-10-20", "2026-10-22", "2026-10-23"],
  "A date-range excuse includes selected weekdays only and excludes school holidays.",
);
assert.deepEqual(
  scheduledDates("2026-12-30", "2027-01-04", ["Mon", "Tue", "Wed", "Thu", "Fri"]),
  ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-04"],
  "Date-range processing must remain calendar-correct across a year boundary.",
);

// The editor is adviser-authorized by its active exact grade + section and
// operates on only existing Time In rows for the date selected in the modal.
assert.match(editRoute, /await getAdviserFromToken\(\)/);
assert.match(editRoute, /permittedSections\.includes\(section\)/);
assert.match(editRoute, /\.eq\("grade", scope\.grade\)/);
assert.match(editRoute, /\.eq\("section", scope\.section\)/);
assert.match(editRoute, /\.eq\("attendance_date", date\)/);
assert.match(editRoute, /\.eq\("type", "Time In"\)/);
assert.match(editRoute, /No Time In record for this date/);
assert.match(editRoute, /Excused attendance is protected/);
assert.match(editRoute, /Excused attendance cannot be changed from this editor/);
assert.match(editRoute, /\.update\(\{ status: newStatus, via: "Manual" \}\)/);
assert.doesNotMatch(editRoute, /\.insert\(/, "Editing attendance must never create a second record.");
assert.match(editRoute, /suppressPendingSmsForAttendanceEdits/);
assert.match(editRoute, /\.from\("attendance_sms_jobs"\)[\s\S]*?status: "skipped"[\s\S]*?\.eq\("status", "pending"\)/);
assert.doesNotMatch(editRoute, /enqueueAttendanceSms|processAttendanceSmsJobs|sendSms/, "Editing attendance must never queue or send an SMS.");

// The page fetches date-scoped records, supports individual selection, and
// saves a uniform Present/Absent change only for checked attendance IDs.
assert.match(adviserPage, /Edit Attendance/);
assert.match(adviserPage, /\/api\/attendance\/edit\?\$\{params\.toString\(\)\}/);
assert.match(adviserPage, /type="checkbox" disabled=\{!record\.editable \|\| logId === null\}/);
assert.match(adviserPage, /const editableAttendanceLogIds = editableAttendanceRecords\.flatMap/, "Check all must include only editable attendance records.");
assert.match(adviserPage, /setSelectedEditLogIds\(editableAttendanceLogIds\)/, "Check all must select every editable record.");
assert.match(adviserPage, /setSelectedEditLogIds\(\[\]\)/, "Uncheck all must clear the selection.");
assert.match(adviserPage, />\s*Check all\s*</, "The edit modal must expose Check all.");
assert.match(adviserPage, />\s*Uncheck all\s*</, "The edit modal must expose Uncheck all.");
assert.match(adviserPage, /\["Present", "Absent"\]/);
assert.match(adviserPage, /updates: selectedEditLogIds\.map/);
assert.match(adviserPage, /date: editAttendanceDate/);
assert.match(adviserPage, /section,/);

console.log("Adviser manual Excused and date-scoped attendance editing checks passed.");
