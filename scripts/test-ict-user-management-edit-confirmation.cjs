/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/dashboard/ict/user-management/page.tsx"), "utf8");
const file = path.join(root, "src/lib/ictUserManagementEditConfirmation.ts");
const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: file,
}).outputText;
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded._compile(compiled, file);

const { buildIctAccountEditConfirmation } = loaded.exports;
const change = (field) => ({ field, from: "before", to: "after" });

assert.match(page, /buildIctAccountEditConfirmation\(changes, passwordChangeAuthorized\)/);
assert.match(page, /setPasswordChangeAuthorized\(true\)/);
assert.match(page, /setPasswordChangeAuthorized\(false\)/);
assert.match(page, /\{confirmation\.summary\}/);
assert.match(page, /\{confirmation\.notice\}/);
assert.doesNotMatch(page, /Password changes were authorized with the current ICT password\./);

const emailOnly = buildIctAccountEditConfirmation([change("Email")], false);
assert.equal(emailOnly.summary, "Email change ready to save");
assert.match(emailOnly.prompt, /Email change/);
assert.doesNotMatch(emailOnly.notice, /authorized with the current ICT password/i);

const profileOnly = buildIctAccountEditConfirmation([change("Name"), change("Contact Number")], false);
assert.equal(profileOnly.summary, "Name and Contact Number changes ready to save");
assert.match(profileOnly.notice, /Name and Contact Number changes/);
assert.doesNotMatch(profileOnly.notice, /authorized with the current ICT password/i);

const passwordOnly = buildIctAccountEditConfirmation([change("Password")], true);
assert.equal(passwordOnly.summary, "Password change ready to save");
assert.match(passwordOnly.notice, /password change was authorized with the current ICT password/i);

const combined = buildIctAccountEditConfirmation([change("Email"), change("Password")], true);
assert.equal(combined.summary, "Email and Password changes ready to save");
assert.match(combined.notice, /password change was authorized with the current ICT password/i);
assert.match(combined.notice, /Email and Password changes/);

const unverifiedPassword = buildIctAccountEditConfirmation([change("Password")], false);
assert.doesNotMatch(unverifiedPassword.notice, /authorized with the current ICT password/i);

console.log("ICT user-management edit confirmation checks passed.");
