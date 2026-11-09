/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const parentRoute = read("src/app/api/parents/me/route.ts");
const parentProfile = read("src/app/dashboard/parent/profile/page.tsx");
const parentChildProfile = read("src/app/dashboard/parent/profile/child/[id]/page.tsx");
const adviserProfile = read("src/app/dashboard/adviser/profile/page.tsx");
const adviserRoute = read("src/app/api/adviser/me/route.ts");
const guidanceProfile = read("src/app/dashboard/guidance/profile/page.tsx");
const principalProfile = read("src/app/dashboard/principal/profile/page.tsx");
const ictProfile = read("src/app/dashboard/ict/profile/page.tsx");
const ictRoute = read("src/app/api/ict/me/route.ts");
const ictApprovalsRoute = read("src/app/api/ict/approvals/route.ts");
const unsavedChangesDialog = read("src/components/UnsavedChangesDialog.tsx");

const parentPatch = parentRoute.match(/export async function PATCH[\s\S]*?(?=export async function PUT)/)?.[0] || "";
const parentGet = parentRoute.match(/export async function GET\(\)[\s\S]*?(?=export async function PATCH)/)?.[0] || "";
assert.ok(parentPatch, "Parent profile PATCH route should exist.");
assert.ok(parentGet, "Parent profile GET route should exist.");

// A wrong re-authentication password is an inline form error, not a signal to
// discard a healthy parent dashboard session. Once the Parent row is saved,
// post-save propagation must not turn the successful update into a 500.
assert.match(parentPatch, /message: "Current password is incorrect\."[\s\S]*?\{ status: 400 \}/);
assert.match(parentRoute, /issueDashboardIdleSession/);
assert.match(parentRoute, /function queueProfilePostSaveTasks/);
assert.match(parentRoute, /function runProfilePostSaveTask/);
assert.match(parentPatch, /queueProfilePostSaveTasks\(\{[\s\S]*?parentId,[\s\S]*?normalizedPhone,/);
assert.match(parentPatch, /try \{[\s\S]*?issueDashboardIdleSession[\s\S]*?\} catch \(sessionRefreshError\)/);
assert.match(parentPatch, /if \(newToken\) \{[\s\S]*?response\.cookies\.set\("parent_token", newToken, dashboardSessionCookieOptions\);/);
assert.match(parentProfile, /import \{ useParentSession \} from "\.\.\/ParentSessionGate";/);
assert.match(parentProfile, /const \{ refreshSession \} = useParentSession\(\);/);
assert.match(parentProfile, /const savedProfile = data\.parent as Partial<ProfileData>;/);
assert.match(parentProfile, /setProfile\(\(previous\) => \(\{[\s\S]*?firstName: savedProfile\.firstName/);
assert.match(parentProfile, /void refreshSession\(\);/);
assert.match(parentProfile, /setStep\("edit"\);[\s\S]*?if \(tab === "profile"\) setAuthErr\(message\);/);
// Reopening Profile fetches the persisted Parent row and maps every editable
// field back to the same client-facing shape.
assert.match(parentGet, /firstName: primaryParent\.parent_first_name \?\? ""/);
assert.match(parentGet, /middleName: primaryParent\.parent_middle_name \?\? ""/);
assert.match(parentGet, /lastName: primaryParent\.parent_last_name \?\? ""/);
assert.match(parentGet, /phone: primaryParent\.contact_number \?\? ""/);
assert.match(parentGet, /address: students\[0\]\?\.address \|\| primaryParent\.address \|\| ""/);
assert.match(parentProfile, /if \(!res\.ok \|\| !data\?\.success\)/);
assert.match(parentProfile, /\/profile\/child\/\$\{encodeURIComponent\(String\(child\.id\)\)\}/);
assert.doesNotMatch(parentProfile, /Manage your children\/Ward/);
assert.match(parentChildProfile, /useParams<\{ id: string \}>/);
assert.match(parentChildProfile, /fetch\("\/api\/parents\/me"/);
assert.match(parentChildProfile, /students\.find\(\(student\) => String\(student\.id\) === childId\)/);

// Guidance requests must render a server error (including password or pending
// request errors) instead of failing silently.
assert.match(guidanceProfile, /const \[approvalError, setApprovalError\] = useState\(""\);/);
assert.match(guidanceProfile, /const \[approvalSaving, setApprovalSaving\] = useState\(false\);/);
assert.match(guidanceProfile, /if \(!res\.ok \|\| !data\?\.success\)[\s\S]*?throw new Error/);
assert.match(guidanceProfile, /setApprovalError\(error instanceof Error \? error\.message/);
assert.match(guidanceProfile, /approvalError \? <div className="error-note" role="alert">/);
assert.match(guidanceProfile, /latest_change_request/);
assert.match(guidanceProfile, /dismissedChangeRequestId/);
assert.match(guidanceProfile, /Profile change request:/);
assert.match(guidanceProfile, /Dismiss profile change request/);
assert.match(guidanceProfile, /setDismissedChangeRequestId\(latestChangeRequest\.id\)/);

// An Adviser with an existing pending request receives a clear, non-error
// state rather than a misleading failure after the request was already saved.
assert.match(adviserProfile, /if \(res\.status === 409\) \{[\s\S]*?setApprovalSent\(true\);[\s\S]*?return;/);
assert.match(adviserProfile, /if \(!res\.ok \|\| !json\?\.success\)/);
assert.match(adviserProfile, /Profile Approval/);
assert.match(adviserProfile, /Change Password/);
assert.match(adviserProfile, /disabled=\{!approvalUnlocked\}/);
assert.match(adviserProfile, /value=\{employeeId\}[\s\S]*?setEmployeeId/);
assert.match(adviserRoute, /employeeId,[\s\S]*?currentPassword/);
assert.match(adviserRoute, /await assertStaffEmployeeIdAvailable\(normalizedEmployeeId, \{[\s\S]*?role: "Adviser"/);
assert.match(adviserRoute, /field: "Employee ID"/);
assert.match(ictApprovalsRoute, /case "Employee ID": profileUpdate\["employee_id"\] = change\.to;/);
assert.match(ictApprovalsRoute, /assertStaffEmployeeIdAvailable\(profileUpdate\.employee_id, \{[\s\S]*?role: "Adviser"/);

// ICT follows the same explicit-cookie pattern so direct profile edits keep
// that staff dashboard authenticated as well.
const ictPatch = ictRoute.match(/export async function PATCH[\s\S]*?(?=\n}\n?$)/)?.[0] || ictRoute;
assert.match(ictRoute, /issueDashboardIdleSession/);
assert.match(ictPatch, /const response = NextResponse\.json\([\s\S]*?response\.cookies\.set\("ict_token", newToken, dashboardSessionCookieOptions\);/);
assert.match(ictProfile, /ICT profile changes do not require approval and are saved immediately\./);

// Principal changes remain direct saves (with password confirmation), not
// ICT approval requests; the modal now uses the same Settings language.
assert.match(principalProfile, /Principal profile changes do not require ICT approval\./);
assert.match(principalProfile, /Profile Settings/);
assert.match(principalProfile, /Change Password/);

// All Settings modals keep a typed or edited draft until the user explicitly
// chooses to discard it. Their themes follow the owning dashboard.
assert.match(unsavedChangesDialog, /Discard unsaved changes\?/);
assert.match(unsavedChangesDialog, /Keep editing/);
assert.match(unsavedChangesDialog, /Discard changes/);
for (const [role, source, theme] of [
  ["Parent", parentProfile, "parent"],
  ["Adviser", adviserProfile, "adviser"],
  ["Guidance", guidanceProfile, "guidance"],
  ["Principal", principalProfile, "principal"],
]) {
  assert.match(source, /UnsavedChangesDialog/, `${role} Settings should render the shared discard confirmation.`);
  assert.match(source, /requestClose|requestCloseSettings/, `${role} Settings should route close actions through a draft check.`);
  assert.match(source, new RegExp(`theme="${theme}"`), `${role} discard confirmation should use its dashboard theme.`);
}
assert.match(parentProfile, /key === "Escape"/);
assert.match(adviserProfile, /key === "Escape"/);
assert.match(guidanceProfile, /key === "Escape"/);
assert.match(principalProfile, /key === "Escape"/);

// Adviser section selections are retained per grade. Going to another grade
// and back must restore the originally selected sections rather than clear it.
assert.match(adviserProfile, /sectionsByGrade/);
assert.match(adviserProfile, /updateSelectedSections/);
assert.doesNotMatch(adviserProfile, /setGrade\(e\.target\.value\);\s*setSelectedSections\(\[\]\)/);
assert.match(adviserProfile, /border-emerald-300 bg-emerald-100 text-emerald-700/);
assert.match(adviserProfile, /dismissedAssignmentRequestId/);
assert.match(adviserProfile, /Dismiss assignment change request/);
assert.match(adviserProfile, /setDismissedAssignmentRequestId\(request\.id\)/);
assert.match(principalProfile, /border border-violet-100 bg-violet-50/);

// Account settings must remain focused on personal information and password
// management. Dashboard-level initials and avatars are intentionally outside
// this check.
for (const [role, source] of [
  ["Parent", parentProfile],
  ["Adviser", adviserProfile],
  ["Guidance", guidanceProfile],
  ["Principal", principalProfile],
  ["ICT", ictProfile],
]) {
  assert.doesNotMatch(
    source,
    /Default Avatar|Change Profile Picture|Choose Photo|Save Photo|Upload Photo|Change Photo|type="file"/,
    `${role} account settings must not offer an avatar or profile-photo control.`,
  );
}

console.log("profile save flow checks passed");
