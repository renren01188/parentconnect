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
for (const method of ["POST", "DELETE"]) {
  assert.match(sectionApi, new RegExp(`export async function ${method}[\\s\\S]*?authorizationPassword[\\s\\S]*?authorizeIctSectionChange`));
}

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
assert.match(createUserPage, /onCancel\(\)/);
assert.match(createUserPage, /requestAddSection/);
assert.match(createUserPage, /requestDeleteSection/);
assert.match(createUserPage, /authorizationPassword,/);

console.log("ICT section authorization checks passed.");
