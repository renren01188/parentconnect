const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20261020150000_add_parent_account_owner_selection.sql");
const ownerRoute = read("src/app/api/parents/account-owner/route.ts");
const ownerPage = read("src/app/login/guardian/account-owner/page.tsx");
const ownerTypes = read("src/lib/parentAccountOwner.ts");
const loginRoute = read("src/app/api/auth/login/route.ts");
const loginPage = read("src/app/login/guardian/page.tsx");
const middleware = read("src/middleware.ts");
const generator = read("scripts/generate-sf1-parent-sql.cjs");

assert.match(migration, /ADD COLUMN IF NOT EXISTS account_owner_role text/);
assert.match(migration, /account_owner_role IN \('Father', 'Mother', 'Guardian'\)/);
assert.match(migration, /SET account_owner_role = CASE lower\(btrim\(relationship\)\)/);
assert.match(ownerTypes, /PARENT_ACCOUNT_OWNER_ROLES = \["Father", "Mother", "Guardian"\]/);

// The page is available only after a successful session is created. The API
// validates the role against family records server-side before it changes a
// Parent's identity or its child links.
assert.match(loginRoute, /account_owner_role/);
assert.match(loginRoute, /requiresOwnerSelection: passwordSet && requiresAccountSetup && !ownerRoleSelected/);
assert.match(loginPage, /data\.requiresOwnerSelection === true[\s\S]*?\/login\/guardian\/account-owner/);
assert.match(ownerPage, /fetch\("\/api\/parents\/account-owner"/);
assert.match(ownerPage, /data\.setupRequired === true \? "\/dashboard\/parent\/profile\?setup=1" : "\/dashboard\/parent"/);
assert.match(ownerRoute, /PARENT_ACCOUNT_OWNER_ROLES\.filter/);
assert.match(ownerRoute, /selected \${role} is not the same verified adult for every linked student/);
assert.match(ownerRoute, /\.update\(\{ relationship: role \}\)/);
assert.match(ownerRoute, /account_owner_role: role/);
assert.match(middleware, /parentOwnerRoleSelected/);
assert.match(middleware, /\/login\/guardian\/account-owner/);
assert.match(middleware, /parentAccountSetupRequired/);
assert.match(ownerRoute, /auth\.parent\.requires_account_setup !== true/);

// The SQL generator keeps the account generic until the first verified role
// selection, imports all available family roles, and never saves raw password
// text in the database column.
assert.match(generator, /family: \[/);
assert.match(generator, /\{ role: "Father"/);
assert.match(generator, /\{ role: "Mother"/);
assert.match(generator, /\{ role: "Guardian"/);
assert.match(generator, /'Parent', NULL, 'Account Owner', NULL/);
assert.match(generator, /VALUES \(v_parent_id, v_lrn, NULL\)/);
assert.match(generator, /jsonb_array_elements\(v_row->'family'\)/);
assert.match(generator, /extensions\.crypt\(v_initial_password, extensions\.gen_salt\('bf', 12\)\)/);

console.log("Parent account owner selection checks passed.");
