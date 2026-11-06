/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const route = read("src/app/api/ict/parent-student-links/route.ts");
const page = read("src/app/dashboard/ict/user-management/page.tsx");

// This staff-only endpoint must use an ICT session and expose a non-cached
// LRN lookup. Corrections may target a non-archived pre-sign-up record.
assert.match(route, /getActiveIct/);
assert.match(route, /private, no-store/);
assert.match(route, /Enter the student's 12-digit LRN/);
assert.match(route, /Choose a non-archived Parent or Guardian record/);
assert.doesNotMatch(route, /hasCompletedActiveParentSignup/);

// Confirmation and explicit replacement intent are repeated on the server.
// The saved account holder identity, rather than browser fields, is used for
// the role being corrected.
assert.match(route, /body\.confirmed !== true/);
assert.match(route, /body\.replaceExistingRoleLink !== true/);
assert.match(route, /familyDetailsWithAccountHolder\(body\.familyDetails \?\? \{\}, parent\)/);
assert.match(route, /validateFamilyDetails\(correctedFamily, relationship\)/);
assert.match(route, /normalizeParentPhone\(parent\.contact_number\)/);
assert.match(route, /removeSupersededSameRoleLinks/);
assert.doesNotMatch(route, /This student is already linked to the selected Parent account/);

// Corrections update existing verification rows, replace only a mistaken
// same-role account link, and reconcile solely the selected Parent.
assert.match(route, /from\("student_family_members"\)[\s\S]*?\.upsert\(/);
assert.match(route, /onConflict: "student_db_id,role"/);
assert.match(route, /await ensureParentStudentLink\(\{ parentId: parent\.id, studentId: student\.student_id, relationship \}\)/);
assert.match(route, /await reconcileParentStudentLinks\(\{ parentId: parent\.id, studentDbId: student\.id \}\)/);

// The operation is independently auditable and invalidates the corrected
// Parent and student views without a browser reload.
assert.match(route, /action: "Parent-Student Link Corrected"/);
assert.match(route, /publishStudentRealtimeInvalidation\(/);
assert.match(route, /publishAccountRealtimeInvalidation\(/);

assert.match(page, /Move Student to This Parent/);
assert.match(page, /Enter the student&apos;s LRN, find the student, then confirm the move/);
assert.match(page, /Existing verification record/);
assert.match(page, /The correct Parent or Guardian details are applied automatically/);
assert.match(page, /replace any incorrect link for the same family role/);
assert.match(page, /replaceExistingRoleLink: true/);
assert.doesNotMatch(page, /Save or discard the Parent account changes above before correcting a student link/);
assert.match(page, /onLinked=\{\(\) => loadData\(\{ background: true \}\)\}/);
assert.doesNotMatch(page, /window\.location\.reload\(/);

console.log("ICT parent-student verification-correction checks passed.");
