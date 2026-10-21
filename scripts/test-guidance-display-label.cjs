/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const legacyLabel = ["Guidance", "Counselor"].join(" ");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const auditOptions = read("src/lib/audit-filter-options.ts");
const ictAuditRoute = read("src/app/api/ict/audit-log/route.ts");
const principalAuditRoute = read("src/app/api/principal/audit-log/route.ts");
assert.match(auditOptions, /value: "Guidance", label: "Guidance"/);
assert.match(auditOptions, /function normalizeAuditRole/);
assert.match(auditOptions, /function displayGuidanceLabel/);
assert.match(ictAuditRoute, /targetRole:\s+normalizeAuditRole\(row\.target_role\)/);
assert.match(principalAuditRoute, /targetRole:\s+normalizeAuditRole\(row\.target_role\)/);
assert.match(ictAuditRoute, /description:\s+displayGuidanceLabel\(row\.details\)/);
assert.match(principalAuditRoute, /description:\s+displayGuidanceLabel\(row\.details\)/);

// Keep the previous API/audit values intact. The display layer maps those
// established values to the shorter label rather than altering app behavior.
for (const file of [
  "src/app/api/auth/guidance/login/route.ts",
  "src/app/api/guidance/me/route.ts",
  "src/app/api/guidance/me/password/route.ts",
  "src/app/api/guidance/dashboard/route.ts",
  "src/app/api/ict/approvals/route.ts",
  "src/app/api/ict/user-management/recently-created/route.ts",
  "src/app/api/reports/guidance/[id]/status/route.ts",
  "src/app/api/reports/guidance/tickets/[id]/route.ts",
  "src/app/api/reports/parent-adviser/[id]/messages/route.ts",
]) {
  assert.match(read(file), new RegExp(legacyLabel));
}

// Visible copy must use the shorter label. The three mapping components above
// are intentionally excluded because they contain the legacy-value check but
// render "Guidance".
for (const file of [
  "src/app/login/guidance/page.tsx",
  "src/app/set-password/guidance/page.tsx",
  "src/app/dashboard/adviser/reports/page.tsx",
  "src/app/dashboard/guidance/components/Sidebar.tsx",
  "src/app/dashboard/parent/reports/page.tsx",
  "src/app/api/guidance/register/route.ts",
  "src/lib/mailer.ts",
]) {
  assert.doesNotMatch(read(file), new RegExp(legacyLabel, "i"), file);
}
assert.match(read("src/app/api/reports/guidance/[id]/status/route.ts"), /assigned to another Guidance user/);
assert.match(read("src/app/api/reports/parent-adviser/[id]/messages/route.ts"), /escalated to Guidance\./);

console.log("Guidance display-label checks passed.");
