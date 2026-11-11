const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const userManagementRoute = read("src/app/api/ict/user-management/route.ts");
const userManagementPage = read("src/app/dashboard/ict/user-management/page.tsx");
const bulkDeletionModal = read("src/app/dashboard/ict/user-management/BulkDeletionModal.tsx");
const guidanceDisplayLabel = read("src/lib/guidanceDisplayLabel.ts");
const adviserTransfersRoute = read("src/app/api/adviser-transfers/route.ts");
const studentProfiles = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const realtime = read("src/lib/realtimeInvalidation.ts");
const attendanceSettingsRoute = read("src/app/api/ict/attendance-notification-settings/route.ts");
const attendanceCreditsRoute = read("src/app/api/ict/attendance-notification-settings/credits/route.ts");
const adviserTransferModal = userManagementPage.slice(
  userManagementPage.indexOf("function EditAdviserModal"),
  userManagementPage.indexOf("function AdviserTransferQueueModal"),
);
const adviserTransferQueue = userManagementPage.slice(
  userManagementPage.indexOf("function AdviserTransferQueueModal"),
  userManagementPage.indexOf("function EditParentModal"),
);

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
assert.match(guidanceDisplayLabel, /GUIDANCE_DEPARTMENT_LABEL = "Student Support and Advising"/);
assert.match(guidanceDisplayLabel, /GUIDANCE_RESPONSIBILITY_LABEL = "Student support and advising"/);
assert.match(userManagementRoute, /classGrade: GUIDANCE_DEPARTMENT_LABEL/);
assert.match(userManagementPage, /GUIDANCE_DEPARTMENT_LABEL/);
assert.match(userManagementPage, /GUIDANCE_RESPONSIBILITY_LABEL/);
assert.match(bulkDeletionModal, /GUIDANCE_DEPARTMENT_LABEL/);
assert.doesNotMatch(userManagementRoute, /Student Support Services/);
assert.doesNotMatch(userManagementPage, /Student Support Services|Student support services/);
assert.match(userManagementPage, /all: \["User", "Role", "Class \/ Grade", "Student\(s\)", ""\]/);
assert.match(userManagementPage, /adviser: \["User", "Role", "Class \/ Grade", "Assignment", ""\]/);
assert.match(userManagementPage, /ict: \["User", "Role", "Department", "Responsibility", ""\]/);
assert.match(userManagementPage, /guidance: \["User", "Role", "Department", "Responsibility", ""\]/);
assert.match(userManagementPage, /parent: \["Student", "Link status", "Class \/ Grade", "Parents \/ Guardian", ""\]/);
assert.match(userManagementPage, /const userDirectoryHeaders = USER_DIRECTORY_HEADERS\[filterMode\]/);
assert.match(userManagementPage, /userDirectoryHeaders\.map\(h =>/);
assert.match(userManagementPage, /flex shrink-0 flex-col gap-2 border-t border-gray-200/);
assert.match(userManagementPage, /flex flex-wrap justify-end gap-2/);
assert.match(userManagementPage, /shrink-0 whitespace-nowrap[\s\S]*?<Save className="w-4 h-4" \/> Review Changes/);
assert.match(userManagementPage, /Transfer Affective Immediately/);
assert.doesNotMatch(userManagementPage, /Effect Transfer Immediately/);
assert.match(adviserTransfersRoute, /Transfer Affective Immediately/);
assert.doesNotMatch(adviserTransfersRoute, /Effect Transfer Immediately/);
assert.match(userManagementPage, /function TransferConfirmationModal/);
assert.match(userManagementPage, /role="alertdialog"/);
assert.match(adviserTransferModal, /showImmediateTransferConfirmation/);
assert.match(adviserTransferModal, /setShowImmediateTransferConfirmation\(true\)/);
assert.match(adviserTransferModal, /Transfer section immediately\?/);
assert.doesNotMatch(adviserTransferModal, /window\.confirm/);
assert.match(adviserTransferModal, /const \[assignmentPickerKey, setAssignmentPickerKey\] = useState\(0\);/);
assert.match(adviserTransferModal, /function discardPendingClassAssignment\(\) \{[\s\S]*?setForm\(\(current\) => \(\{ \.\.\.current, classGrade: user\.classGrade \}\)\);[\s\S]*?setAssignmentPickerKey\(\(current\) => current \+ 1\);[\s\S]*?setStep\("edit"\);/);
assert.match(adviserTransferModal, /<GradeSectionPicker key=\{assignmentPickerKey\} value=\{form\.classGrade\}/);
assert.match(adviserTransferModal, /\{\(step === "confirm" \|\| step === "transfer"\) && \([\s\S]*?onClick=\{discardPendingClassAssignment\}/);
assert.match(adviserTransferModal, /<button onClick=\{discardPendingClassAssignment\}[\s\S]*?>Cancel<\/button>/);
assert.match(adviserTransferModal, /<button onClick=\{handleSend\} disabled=\{saving\}[\s\S]*?Save Changes/);
assert.match(adviserTransferModal, /await onTransferChanged\?\.\(\);/);
assert.match(userManagementPage, /onTransferChanged=\{loadData\}/);
const adviserTransferCheckBranch = adviserTransfersRoute.slice(
  adviserTransfersRoute.indexOf('if (action === "check")'),
  adviserTransfersRoute.indexOf('if (action !== "schedule" && action !== "immediate")'),
);
assert.match(adviserTransferCheckBranch, /if \(action === "check"\) return NextResponse\.json\(\{ success: true, conflicts, relocation \}\);/);
assert.doesNotMatch(adviserTransferCheckBranch, /\.insert\(|\.update\(/);
assert.match(adviserTransferQueue, /transferToCancel/);
assert.match(adviserTransferQueue, /Cancel scheduled transfer\?/);
assert.doesNotMatch(adviserTransferQueue, /window\.confirm/);
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
