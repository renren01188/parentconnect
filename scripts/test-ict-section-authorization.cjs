const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const sectionApi = read("src/app/api/sections/route.ts");
const createUserPage = read("src/app/dashboard/ict/user-management/create-user/page.tsx");

// Both mutating routes verify the authenticated ICT user's bcrypt password,
// rather than trusting a client-only confirmation step.
assert.match(sectionApi, /import bcrypt from "bcryptjs"/);
assert.match(sectionApi, /async function authorizeIctSectionChange/);
assert.match(sectionApi, /getActiveIct\(\)/);
assert.match(sectionApi, /supabase[\s\S]*?from\("ict_admins"\)[\s\S]*?select\("password_hash"\)/);
assert.match(sectionApi, /bcrypt\.compare\(authorizationPassword, data\.password_hash\)/);
for (const method of ["POST", "DELETE", "PUT"]) {
  assert.match(sectionApi, new RegExp(`export async function ${method}[\\s\\S]*?authorizationPassword[\\s\\S]*?authorizeIctSectionChange`));
}

// Done submits all staged changes as one password-authorized batch. Every
// deletion guard runs before the batch writes anything, so a section in use
// remains protected even though the Delete button only stages the change.
assert.match(sectionApi, /function normalizeSectionChanges/);
assert.match(sectionApi, /const deletions = changes\.filter\(\(change\) => change\.type === "delete"\)/);
assert.match(sectionApi, /for \(const change of deletions\)[\s\S]*?ensureSectionCanBeDeleted\(change\.name, change\.grade\)/);
assert.match(sectionApi, /additions\.map\(\(change\) => \(\{/);

// A section in use is rejected before deletion; staff assignments are not
// silently stripped to make deletion succeed.
assert.match(sectionApi, /from\("students"\)/);
assert.match(sectionApi, /from\("advisers"\)/);
assert.match(sectionApi, /code: "SECTION_IN_USE"/);
assert.match(sectionApi, /Reassign them first/);
assert.match(sectionApi, /\{ status: 409 \}/);
assert.doesNotMatch(sectionApi, /update\(\{ section: null \}\)/);

// The client collects a password only in the transient authorization modal.
assert.match(createUserPage, /function SectionAuthorizationModal/);
assert.match(createUserPage, /autoComplete="current-password"/);
assert.match(createUserPage, /setPassword\(""\)/);
assert.match(createUserPage, /onClick=\{onCancel\}/);
assert.match(createUserPage, /requestAddSection/);
assert.match(createUserPage, /requestDeleteSection/);
assert.match(createUserPage, /authorizationPassword,/);
assert.match(createUserPage, /const \[pendingSectionActions, setPendingSectionActions\] = useState<PendingSectionAction\[\]>/);
assert.match(createUserPage, /const requestDone = \(\) => \{[\s\S]*?setShowSectionAuthorization\(true\)/);
assert.match(createUserPage, /method: "PUT"/);
assert.match(createUserPage, /actions: pendingSectionActions\.map/);
assert.match(createUserPage, /setPendingSectionActions\(\[\]\)[\s\S]*?onClose\(\)/);

const addFlow = createUserPage.slice(
  createUserPage.indexOf("const requestAddSection"),
  createUserPage.indexOf("const requestDeleteSection")
);
const deleteFlow = createUserPage.slice(
  createUserPage.indexOf("const requestDeleteSection"),
  createUserPage.indexOf("const authorizeSectionChanges")
);
assert.doesNotMatch(addFlow, /fetch\(/, "Adding a section must not request password authorization immediately.");
assert.doesNotMatch(deleteFlow, /fetch\(/, "Deleting a section must remain staged until Done.");
assert.match(addFlow, /return \[\.\.\.prev, \{ type: "add"/);
assert.match(deleteFlow, /return \[\.\.\.prev, \{ type: "delete"/);

console.log("ICT section authorization checks passed.");
