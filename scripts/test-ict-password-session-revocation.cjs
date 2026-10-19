const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const userManagement = read("src/app/api/ict/user-management/route.ts");
const realtime = read("src/lib/realtimeInvalidation.ts");
const subscriber = read("src/lib/subscribeRealtimeInvalidations.ts");
const middleware = read("src/middleware.ts");
const helper = read("src/lib/passwordSessionRevocation.ts");
const store = read("src/lib/passwordSessionRevocationStore.ts");
const sessionRoute = read("src/app/api/auth/session/route.ts");
const principalSuccession = read("src/app/api/principal/succession/route.ts");
const sessionGuard = read("src/components/SessionRevocationGuard.tsx");

for (const role of ["guidance", "adviser"]) {
  assert.match(
    userManagement,
    new RegExp(`recordPasswordSessionRevocation\\(\\[\\{ role: "${role}"`),
    `${role} password changes must create a durable session-revocation marker`,
  );
}
assert.match(
  userManagement,
  /recordPasswordSessionRevocation\(parentAccountIds\.map\(\(id\) => \(\{ role: "parent"/,
  "Parent password changes must create a durable marker for every linked Parent account",
);

assert.ok(
  userManagement.indexOf("The Guidance password update could not be verified.")
    < userManagement.indexOf('recordPasswordSessionRevocation([{ role: "guidance"'),
  "Guidance sessions may be revoked only after the new hash is verified",
);
assert.ok(
  userManagement.indexOf("The Parent password update could not be verified.")
    < userManagement.indexOf('recordPasswordSessionRevocation(parentAccountIds'),
  "Parent sessions may be revoked only after every changed parent hash is verified",
);
assert.ok(
  userManagement.indexOf("The adviser password update could not be verified.")
    < userManagement.indexOf('recordPasswordSessionRevocation([{ role: "adviser"'),
  "Adviser sessions may be revoked only after the new hash is verified",
);
assert.match(userManagement, /if \(passwordSessionTargets\.length > 0 && !passwordSessionInvalidationPublished\)/);
assert.match(userManagement, /if \(user\.role === "ICT"\)[\s\S]*?publishAccountRealtimeInvalidation\(\[\{ role: "ict"/);
assert.doesNotMatch(
  userManagement.match(/if \(user\.role === "ICT"\)[\s\S]*?if \(user\.role === "Guidance"\)/)?.[0] ?? "",
  /recordPasswordSessionRevocation/,
  "An ICT password update must not revoke the administrator session",
);

assert.match(helper, /sessionIssuedAt/);
assert.match(helper, /isTokenRevokedByPasswordChange/);
assert.match(store, /audit_log/);
assert.match(store, /PASSWORD_SESSION_REVOCATION_ACTIONS/);
assert.match(middleware, /passwordSessionCanAccess\("parent"/);
assert.match(middleware, /passwordSessionCanAccess\("adviser"/);
assert.match(middleware, /passwordSessionCanAccess\("guidance"/);

assert.match(realtime, /options: \{ sessionRevoked\?: boolean \}/);
assert.match(realtime, /publishRealtimeInvalidation\(ictRecipients, "accounts"\)/);
assert.match(realtime, /sessionRevoked: true/);
assert.match(subscriber, /sessionRevoked: payload\?\.sessionRevoked === true/);
assert.match(sessionRoute, /parent_token/);
assert.match(sessionRoute, /adviser_token/);
assert.match(sessionRoute, /guidance_token/);
assert.match(sessionRoute, /principal_token/);
assert.match(sessionRoute, /getPrincipalSession/);
assert.match(sessionGuard, /"principal"/);
assert.match(
  principalSuccession,
  /publishAccountRealtimeInvalidation\([\s\S]*?\[\{ role: "principal", id: principalId \}\],[\s\S]*?sessionRevoked: Boolean\(previousPrincipal\)/,
  "Principal succession must notify the former Principal session",
);

for (const [file, role] of [
  ["src/app/dashboard/parent/layout.tsx", "parent"],
  ["src/app/dashboard/adviser/layout.tsx", "adviser"],
  ["src/app/dashboard/guidance/layout.tsx", "guidance"],
  ["src/app/dashboard/principal/layout.tsx", "principal"],
]) {
  assert.match(read(file), new RegExp(`<SessionRevocationGuard role="${role}"`));
}

for (const file of [
  "src/app/api/auth/login/route.ts",
  "src/app/api/auth/adviser/login/route.ts",
  "src/app/api/auth/guidance/login/route.ts",
]) {
  assert.match(read(file), /sessionIssuedAt: Date\.now\(\)/, `${file} must issue a revocable session timestamp`);
}

console.log("ICT password session revocation checks passed.");
