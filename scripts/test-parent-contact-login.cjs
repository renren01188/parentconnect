const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadTypeScriptModule(file) {
  const filename = path.join(root, file);
  const compiled = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const loginRoute = read("src/app/api/auth/login/route.ts");
const loginPage = read("src/app/login/guardian/page.tsx");
const loginProtection = read("src/lib/loginProtection.ts");
const migration = read("supabase/migrations/20261020160000_add_parent_contact_number_login.sql");
const generator = read("scripts/generate-sf1-parent-sql.cjs");
const {
  normalizeParentLoginContactNumber,
  normalizeParentLoginEmail,
} = loadTypeScriptModule("src/lib/parentLoginIdentifier.ts");

// The client and database use the same canonical local PH mobile form.
assert.equal(normalizeParentLoginContactNumber("09171234567"), "09171234567");
assert.equal(normalizeParentLoginContactNumber("9171234567"), "09171234567");
assert.equal(normalizeParentLoginContactNumber("+63 917 123 4567"), "09171234567");
assert.equal(normalizeParentLoginContactNumber("639171234567"), "09171234567");
assert.equal(normalizeParentLoginContactNumber("0212345678"), null);
assert.equal(normalizeParentLoginEmail(" Parent@Example.COM "), "parent@example.com");
assert.equal(normalizeParentLoginEmail("not-an-email"), null);
assert.match(migration, /normalize_parent_login_contact_number/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS login_contact_number text/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS parents_login_contact_number_unique/);
assert.match(migration, /BEFORE INSERT OR UPDATE OF contact_number ON public\.parents/);

// The login route accepts a neutral identifier, looks up a canonical mobile
// number when provided, and fails safely if an old deployment contains an
// ambiguous number. Email login remains a supported fallback.
assert.match(loginRoute, /const \{ identifier, email, password, captchaToken \}/);
assert.match(loginRoute, /normalizeParentLoginContactNumber\(suppliedIdentifier\)/);
assert.match(loginRoute, /\.eq\("login_contact_number", mobileNumber\)/);
assert.match(loginRoute, /\.eq\("email", emailAddress!\)/);
assert.match(loginRoute, /hasAmbiguousMobileAccount/);
assert.match(loginRoute, /requiresOwnerSelection: passwordSet && !ownerRoleSelected/);
assert.match(loginProtection, /Invalid mobile number, email address, or password/);

// The login form clearly supports both identifiers and preserves the existing
// post-authentication owner-selection route.
assert.match(loginPage, /Mobile Number or Email Address/);
assert.match(loginPage, /09171234567 or name@email\.com/);
assert.match(loginPage, /JSON\.stringify\(\{ identifier: loginIdentifier, password, captchaToken \}\)/);
assert.match(loginPage, /\/login\/guardian\/account-owner/);
assert.match(generator, /20261020140000_default_parent_attendance_notifications_to_sms\.sql/);
assert.match(generator, /20261020160000_add_parent_contact_number_login\.sql/);
assert.match(generator, /Contact number \$\{row\.accountContactNumber\} is assigned to more than one ActiveEmail/);

console.log("Parent contact-number login checks passed.");
