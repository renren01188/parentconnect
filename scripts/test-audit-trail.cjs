const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const presentation = read("src/lib/auditPresentation.ts");
const filters = read("src/lib/audit-filter-options.ts");
const auditWriter = read("src/lib/audit.ts");

assert.match(presentation, /AUDIT_TIME_ZONE = "Asia\/Manila"/);
assert.match(presentation, /function formatAuditTimestamp/);
assert.match(presentation, /function auditManilaDateRange/);
assert.match(presentation, /T00:00:00\+08:00/);
assert.match(presentation, /function auditManilaDate/);
assert.match(filters, /function isSecurityAuditAction/);
assert.match(filters, /normalized === "security alert" \|\| normalized === "failed login"/);
assert.match(auditWriter, /action: "Failed Login"/);

const timestamp = new Date("2026-10-13T14:22:25.188Z");
const date = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(timestamp);
const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true }).format(timestamp);
assert.equal(`${date} · ${time}`, "Oct 13 · 10:22 PM");
assert.equal(new Date("2026-10-13T00:00:00+08:00").toISOString(), "2026-10-12T16:00:00.000Z");

for (const role of ["principal", "ict"]) {
  const route = read(`src/app/api/${role}/audit-log/route.ts`);
  const page = read(`src/app/dashboard/${role}/audit-trail/page.tsx`);

  assert.match(route, /auditManilaDateRange/);
  assert.match(route, /formatAuditTimestamp\(row\.created_at\)/);
  assert.match(route, /\.lt\("created_at", dateRange\.end\)/);
  assert.match(route, /\.in\("action", \["Failed Login", "Security Alert"\]\)/);
  assert.match(route, /securityTotal: securityTotal \?\? 0/);

  assert.match(page, /AUDIT_TIME_ZONE/);
  assert.match(page, /timeZone: AUDIT_TIME_ZONE/);
  assert.match(page, /isSecurityAuditAction\(event\.action\)/);
  assert.match(page, /setSecurityTotal\(json\.securityTotal \?\? 0\)/);
  assert.match(page, /security: securityTotal/);
}

console.log("audit trail checks passed");
