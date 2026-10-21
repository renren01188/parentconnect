const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const setupRoute = read("src/app/api/parents/complete-account-setup/route.ts");
const setupModal = read("src/app/dashboard/parent/profile/FirstLoginSetupModal.tsx");
const profilePage = read("src/app/dashboard/parent/profile/page.tsx");
const profileApi = read("src/app/api/parents/me/route.ts");
const ownerPage = read("src/app/login/guardian/account-owner/page.tsx");
const loginRoute = read("src/app/api/auth/login/route.ts");
const middleware = read("src/middleware.ts");
const generator = read("scripts/generate-sf1-parent-sql.cjs");

assert.match(setupRoute, /isParentAccountOwnerRole\(parent\.account_owner_role\)/);
assert.match(setupRoute, /requires_account_setup !== true/);
assert.match(setupRoute, /passwordError\(newPassword\)/);
assert.match(setupRoute, /savedEmail \?\? suppliedEmail/);
assert.match(setupRoute, /if \(rawEmail && !suppliedEmail\)/);
assert.match(setupRoute, /savedEmail \|\| !suppliedEmail \? \{\} : \{ email: suppliedEmail \}/);
assert.match(setupRoute, /normalizeParentLoginContactNumber/);
assert.match(setupRoute, /const contactNumberRequired = savedEmail !== null && savedContactNumber === null/);
assert.match(setupRoute, /Enter a valid Philippine mobile number/);
assert.match(setupRoute, /\.eq\("login_contact_number", suppliedContactNumber\)/);
assert.match(setupRoute, /contact_number: suppliedContactNumber/);
assert.match(setupRoute, /password_set: 1/);
assert.match(setupRoute, /requires_account_setup: false/);
assert.match(setupRoute, /account_setup_completed_at/);
assert.match(setupRoute, /\.eq\("requires_account_setup", true\)/);

assert.match(setupModal, /Please complete your account setup by changing your password before continuing to your dashboard\./);
assert.match(setupModal, /Optional: If you do not have an email address, you may leave this field blank\./);
assert.match(setupModal, /emailAlreadySaved/);
assert.match(setupModal, /currentContactNumber/);
assert.match(setupModal, /const contactNumberAlreadySaved = hasMobileNumber\(currentContactNumber\)/);
assert.match(setupModal, /const contactNumberRequired = emailAlreadySaved && !contactNumberAlreadySaved/);
assert.match(setupModal, /Mobile Number \*/);
assert.match(setupModal, /Required for SMS attendance notifications and verification codes\./);
assert.match(setupModal, /Your existing mobile number is already saved for SMS notifications and verification codes\./);
assert.match(setupModal, /value=\{email\}/);
assert.match(setupModal, /readOnly=\{emailAlreadySaved\}/);
assert.match(setupModal, /Your existing email is already saved\. You only need to change your password\./);
assert.match(setupModal, /Save and Continue/);
assert.doesNotMatch(setupModal, /onClose/);
assert.match(profileApi, /requires_account_setup/);
assert.match(profilePage, /<FirstLoginSetupModal/);
assert.match(profilePage, /currentContactNumber=\{profile\.phone\}/);
assert.match(profilePage, /window\.location\.assign\("\/dashboard\/parent"\)/);
assert.doesNotMatch(profilePage, /ParentDashboardGuide/);
assert.match(ownerPage, /"\/dashboard\/parent\/profile\?setup=1"/);
assert.match(middleware, /pathname !== "\/dashboard\/parent\/profile"/);
assert.match(middleware, /return "\/dashboard\/parent\/profile\?setup=1"/);
assert.match(loginRoute, /requiresOwnerSelection: passwordSet && requiresAccountSetup && !ownerRoleSelected/);

assert.match(generator, /20261020170000_require_bulk_parent_account_setup\.sql/);
assert.match(generator, /20261020180000_allow_mobile_only_parent_accounts\.sql/);
assert.match(generator, /v_parent_email := nullif\(lower\(btrim\(v_row->>'accountEmail'\)\), ''\)/);
assert.match(generator, /WHERE login_contact_number = public\.normalize_parent_login_contact_number/);
assert.match(generator, /requires_account_setup = true/);

console.log("Parent first-login account setup checks passed.");
