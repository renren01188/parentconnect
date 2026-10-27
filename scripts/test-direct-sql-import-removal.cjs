/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));

const loginRoute = read("src/app/api/auth/login/route.ts");
const loginPage = read("src/app/login/guardian/page.tsx");
const middleware = read("src/middleware.ts");
const parentState = read("src/lib/parentRegistrationState.ts");
const migration = read("supabase/migrations/20261027120000_remove_direct_parent_account_owner_feature.sql");
const packageJson = read("package.json");

// Normal Guardian authentication still supports temporary-password setup and
// completed accounts land directly on the Parent dashboard.
assert.match(loginRoute, /temporaryPasswordExpiryEpochSeconds/);
assert.match(loginRoute, /passwordSet/);
assert.match(loginPage, /\/login\/guardian\/verify-temp-password/);
assert.match(loginPage, /window\.location\.assign\("\/dashboard\/parent"\)/);
assert.match(middleware, /\/login\/guardian\/set-password/);
assert.match(parentState, /return !isPreSignupParentRecord\(accountIds, passwordSet\);/);

// Retired direct-import routing and setup enforcement must not be reachable.
for (const source of [loginRoute, loginPage, middleware, parentState, packageJson]) {
  assert.doesNotMatch(source, /account.?owner|requires_account_setup|account_setup_completed_at|complete-account-setup/i);
}
for (const relative of [
  "src/app/login/guardian/account-owner/page.tsx",
  "src/app/api/parents/account-owner/route.ts",
  "src/app/api/parents/complete-account-setup/route.ts",
  "src/app/dashboard/parent/profile/FirstLoginSetupModal.tsx",
  "src/lib/parentAccountOwner.ts",
  "scripts/generate-sf1-parent-sql.cjs",
  ".local-imports/pilot-student-parent-direct-injection.sql",
  ".local-imports/sf1-grade-1-silver-parent-owner-selection.sql",
  ".local-imports/sf1-grade-4-carnation-afternoon-parent-owner-selection.sql",
  ".local-imports/sf1-grade-4-tulip-morning-parent-owner-selection.sql",
  ".local-imports/sf1-grade-5-exodus-morning-parent-owner-selection.sql",
  ".local-imports/sf1-grade-6-garcia-afternoon-parent-owner-selection.sql",
  ".local-imports/sf1-grade-6-osmena-afternoon-parent-owner-selection.sql",
  ".local-imports/sf1-grade-6-quirino-morning-parent-owner-selection.sql",
  ".local-imports/uncommitted-supabase-migrations-20261020/20261020150000_add_parent_account_owner_selection.sql",
  ".local-imports/uncommitted-supabase-migrations-20261020/20261020170000_require_bulk_parent_account_setup.sql",
]) {
  assert.equal(exists(relative), false, `${relative} must be removed`);
}

// The rollback is forward-only DDL and has no data-modification statement.
assert.match(migration, /DROP CONSTRAINT IF EXISTS parents_account_owner_role_check/);
assert.match(migration, /DROP COLUMN IF EXISTS account_owner_role/);
assert.match(migration, /DROP COLUMN IF EXISTS requires_account_setup/);
assert.match(migration, /DROP COLUMN IF EXISTS account_setup_completed_at/);
assert.doesNotMatch(migration, /\b(INSERT|UPDATE|DELETE)\b/);

console.log("Direct SQL-import Account Owner removal checks passed.");
