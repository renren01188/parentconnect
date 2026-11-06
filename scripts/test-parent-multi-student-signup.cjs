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

// Background reconciliation is stricter than a name match: it requires a
// role, normalized name, and identical stored phone number before linking
// another sibling automatically.
assert.match(links, /function hasSameVerifiedPhone/);
assert.match(links, /contact_number/);
assert.match(links, /\.filter\(\(parent\) => hasSameVerifiedPhone\(parent\.contact_number, member\.contact_number\)\)/);
assert.match(links, /\.from\("students"\)[\s\S]*?\.eq\("archive_status", "active"\)/);

// Adviser SF1 imports and ICT User Management continue to use the shared,
// stricter reconciliation path rather than creating duplicate Parent rows.
assert.match(importRoute, /provisionParentForStudent/);
assert.match(importRoute, /reconcileParentStudentLinks\(\{ studentDbId: student\.id \}\)/);
assert.match(ictUsersRoute, /reconcileParentStudentLinks\(\{ studentDbId: id \}\)/);

// Parent sessions consume the relation table and return every linked student;
// the legacy parents.student_id column is only a compatibility fallback.
assert.match(parentMeRoute, /from\("parent_student_links"\)[\s\S]*?\.eq\("parent_id", primaryParent\.id\)/);
assert.match(parentMeRoute, /student: students\[0\],[\s\S]*?students,/);

console.log("parent multi-student signup checks passed");
