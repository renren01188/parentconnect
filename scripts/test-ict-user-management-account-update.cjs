const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const userManagementRoute = read("src/app/api/ict/user-management/route.ts");
const userManagementPage = read("src/app/dashboard/ict/user-management/page.tsx");
const studentProfiles = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const realtime = read("src/lib/realtimeInvalidation.ts");
const attendanceSettingsRoute = read("src/app/api/ict/attendance-notification-settings/route.ts");
const attendanceCreditsRoute = read("src/app/api/ict/attendance-notification-settings/credits/route.ts");

assert.match(userManagementRoute, /await publishAccountChange\(\[\{ role: "adviser", id: Number\(data\.id\) \}\]\)/);
assert.match(userManagementRoute, /await publishAccountChange\(\[\{ role: "guidance", id: Number\(data\.id\) \}\]\)/);
assert.match(userManagementRoute, /await Promise\.all\(\[\.\.\.reconciledStudentIds\]\.map\(\(studentDbId\) => publishStudentRealtimeInvalidation\(\{ studentDbId \}\)\)\)/);
assert.match(userManagementRoute, /Each recorded contact number must be exactly 11 digits\./);
assert.match(userManagementRoute, /login_contact_number: normalizedParentPhone/);
assert.doesNotMatch(userManagementPage, /<FLabel>Remarks<\/FLabel>/);
assert.doesNotMatch(userManagementRoute, /parent_remarks: user\.parentRemarks/);
assert.match(userManagementRoute, /wasPendingParent[\s\S]*?normalizeParentPhone\(student\.contactNumber\)/);
assert.match(userManagementPage, /event\.scope === "accounts" \|\| event\.scope === "students" \|\| event\.scope === "audit"/);
assert.match(userManagementPage, /Recorded Contact Number/);
assert.match(userManagementPage, /Leave blank when SF1 has no number/);
assert.match(userManagementPage, /isPendingImportedParent && editableStudents\.map\(\(student, index\) => \(/);
assert.match(studentProfiles, /event\.scope === "students" \|\| event\.scope === "accounts"/);
assert.match(studentProfiles, /event\.scope === "dashboard" \|\| event\.scope === "accounts"/);
assert.match(studentProfiles, /if \(!scope \|\| scope === "dashboard"\) void loadSettings\(\)/);
assert.match(studentProfiles, /referenceRefreshKey/);
assert.match(realtime, /const ictRecipients = await recipientsForRoles\(\["ict"\]\)/);
assert.match(attendanceSettingsRoute, /await publishAttendanceSettingsRefresh\(\)/);
assert.match(attendanceSettingsRoute, /publishRealtimeInvalidation\(recipients, "dashboard"\)/);
assert.match(attendanceCreditsRoute, /await publishAttendanceSettingsRefresh\(\)/);
assert.match(attendanceCreditsRoute, /publishRealtimeInvalidation\(recipients, "dashboard"\)/);

console.log("ICT user-management account update checks passed.");
