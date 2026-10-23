/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const editRoute = read("src/app/api/attendance/edit/route.ts");
const adviserPage = read("src/app/dashboard/adviser/attendance/page.tsx");

// A modal save is one Adviser action, even when it updates many attendance
// rows. The route must write precisely one aggregate audit event, not one
// indistinguishable event per selected student.
assert.equal(
  (editRoute.match(/action: "Attendance Edited"/g) ?? []).length,
  1,
  "One Edit Attendance save must produce exactly one Attendance Edited audit event.",
);
assert.doesNotMatch(
  editRoute,
  /Promise\.all\(verifiedRows\.map\([\s\S]*?logAudit\(/,
  "Attendance editing must not audit once per selected student.",
);
assert.match(editRoute, /performedById: scope\.adviser\.id/);
assert.match(editRoute, /performedBy: buildFullName\(scope\.adviser\)/);
assert.match(editRoute, /attendanceDate: body\.date/);
assert.match(editRoute, /grade: scope\.grade/);
assert.match(editRoute, /section: scope\.section/);
assert.match(editRoute, /updatedRecordCount: verifiedRows\.length/);
assert.match(editRoute, /Edited \$\{verifiedRows\.length\} Time In attendance record/);
assert.match(editRoute, /publishAttendanceRealtimeInvalidations\(/);
assert.doesNotMatch(adviserPage, /logAudit\(/, "The browser must not write a duplicate audit event.");

console.log("Attendance edit audit aggregation checks passed.");
