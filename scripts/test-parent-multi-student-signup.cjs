/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const signupRoute = read("src/app/api/parents/signup/route.ts");
const verifyRoute = read("src/app/api/parents/verify-temp-password/route.ts");
const guardianPage = read("src/app/login/guardian/page.tsx");
const links = read("src/lib/reconcileParentStudentLinks.ts");
const importRoute = read("src/app/api/students/import/route.ts");
const manualStudentRoute = read("src/app/api/students/route.ts");
const manualRegistration = read("src/components/student-parent-registration/StudentParentRegistration.tsx");
const candidateRoute = read("src/app/api/parents/active-link-candidates/route.ts");
const middleware = read("src/middleware.ts");
const ictUsersRoute = read("src/app/api/ict/user-management/route.ts");
const parentMeRoute = read("src/app/api/parents/me/route.ts");

// Existing, authenticated Parent accounts are located by their email, then a
// submitted LRN is linked directly. A duplicate attempt remains idempotent.
assert.match(signupRoute, /\.eq\("email", email\)/);
assert.match(signupRoute, /\.eq\("login_contact_number", contactNumber\)/);
assert.match(signupRoute, /\.eq\("archive_status", "active"\)/);
assert.match(signupRoute, /await ensureParentStudentLink\(\{[\s\S]*?parentId: matchedParent\.id,[\s\S]*?studentId: student\.student_id,[\s\S]*?relationship,/);
assert.match(signupRoute, /accountExists: true/);
assert.match(signupRoute, /Please log in, or use Forgot password/);
assert.match(guardianPage, /if \(data\.accountExists === true\)[\s\S]*?switchMode\("login"\)[\s\S]*?setLoginIdentifier\(signup\.email \|\| signup\.contactNumber\)/);

// Do not select an account from every matching Father/Mother/Guardian name.
// A same-name parent with another email must be allowed to sign up normally.
assert.doesNotMatch(signupRoute, /roleRows|parentsByIdentity|identityParent/);
assert.doesNotMatch(verifyRoute, /roleRows|conflictingIdentity/);
assert.match(verifyRoute, /\.eq\("email", signup\.email\)/);
assert.match(verifyRoute, /\.eq\("login_contact_number", signup\.contactNumber\)/);
assert.match(verifyRoute, /\.eq\("archive_status", "active"\)/);
assert.match(verifyRoute, /await ensureParentStudentLink\(\{/);
assert.match(verifyRoute, /await reconcileParentStudentLinks\(\{ parentId: parent\.id \}\)/);

// Background reconciliation uses a role/name match plus a valid recorded
// phone whenever one exists. When SF1 has no number, the same-name result
// must be unique; multiple matches stay unlinked for staff review.
assert.match(links, /function hasSameVerifiedPhone/);
assert.match(links, /contact_number/);
assert.match(links, /const matchingParents = normalizePhone\(member\.contact_number\)/);
assert.match(links, /identityCandidates\.length === 1/);
assert.match(links, /String\(parent\.status \?\? ""\)\.trim\(\)\.toLowerCase\(\) === "active"/);
assert.match(links, /\.from\("students"\)[\s\S]*?\.eq\("archive_status", "active"\)/);

// Adviser can intentionally select an existing active account in the manual
// form. The server repeats the match validation before it writes any link.
assert.match(manualRegistration, /active-link-candidates/);
assert.match(manualRegistration, /ParentNameSuggestions/);
assert.match(manualRegistration, /Suggested active Parent names/);
assert.match(manualRegistration, /Father:[\s\S]*?border-blue-100 bg-blue-50\/60/);
assert.match(manualRegistration, /Mother:[\s\S]*?border-pink-100 bg-pink-50\/60/);
assert.match(manualRegistration, /Guardian:[\s\S]*?border-emerald-100 bg-emerald-50\/60/);
assert.match(manualStudentRoute, /assertSelectedActiveParentLink/);
assert.match(manualStudentRoute, /reconcileParentStudentLinks\(\{ studentDbId: createdStudent\.id \}\)/);
assert.match(candidateRoute, /getActiveIct/);
assert.match(candidateRoute, /findActiveParentNameSuggestions/);
assert.match(candidateRoute, /findLinkedFamilyNameSuggestions/);
assert.match(manualRegistration, /selectedParentId/);
assert.match(manualRegistration, /selectSuggestedParent/);
// Add Another Student is deliberately a single household registration: a
// selected Parent and every verification field are shared by all child
// drafts, while LRN/grade/RFID stay child-specific.
assert.match(manualRegistration, /const sharedVerificationFields = \[/);
assert.match(manualRegistration, /function sharedVerificationFrom/);
assert.match(manualRegistration, /setStudents\(prev => \[\.\.\.prev, \{ \.\.\.emptyForm, \.\.\.sharedVerification \}\]\)/);
assert.match(manualRegistration, /if \(isSharedVerificationField\(field\)\) \{[\s\S]*?setSharedVerification\(applyField\)/);
assert.match(manualRegistration, /setSharedVerification\(\(student\) => fillVerificationName/);
assert.match(manualRegistration, /This is one shared verification record for every student added here/);
assert.match(manualRegistration, /every matching child from this registration is linked to the Parent dashboard/);
// This staff-only route lives below `/api/parents`, but must bypass the
// Parent session middleware so its own Adviser/ICT authorization can run.
assert.match(middleware, /isStaffParentLinkCandidateApi = pathname === "\/api\/parents\/active-link-candidates"/);
assert.match(middleware, /!isPublicParentApi && !isStaffParentLinkCandidateApi/);

// SF1 preview shows automated/ambiguous decisions and the save endpoint
// recomputes those candidates before linking, never trusting a browser ID.
assert.match(importRoute, /provisionParentForStudent/);
assert.match(importRoute, /getParentLinkSuggestions/);
assert.match(importRoute, /assertSelectedActiveParentLink/);
assert.match(importRoute, /Choose the correct \$\{identity\.role\} account or choose no existing Parent account/);
assert.match(importRoute, /ensureParentStudentLink/);
assert.match(importRoute, /reconcileParentStudentLinks\(\{ studentDbId: student\.id \}\)/);
assert.match(ictUsersRoute, /reconcileParentStudentLinks\(\{ studentDbId: id \}\)/);

// Parent sessions consume the relation table and return every linked student;
// the legacy parents.student_id column is only a compatibility fallback.
assert.match(parentMeRoute, /from\("parent_student_links"\)[\s\S]*?\.eq\("parent_id", primaryParent\.id\)/);
assert.match(parentMeRoute, /student: students\[0\],[\s\S]*?students,/);

console.log("parent multi-student signup checks passed");
