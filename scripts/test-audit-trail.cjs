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
assert.match(filters, /AUDIT_SECURITY_ALERT_ACTION_VALUES/);
assert.match(filters, /Subject Teacher OTP CAPTCHA Failed/);
assert.match(filters, /Subject Teacher OTP Rate Limited/);
assert.match(filters, /AUDIT_STATUS_OPTIONS/);
assert.match(filters, /function auditStatusDatabaseValues/);
assert.match(filters, /Student Report Submitted/);
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
  assert.match(route, /AUDIT_SECURITY_ALERT_ACTION_VALUES/);
  assert.match(route, /\.in\("action", \[\.\.\.AUDIT_SECURITY_ALERT_ACTION_VALUES\]\)/);
  assert.match(route, /auditStatusDatabaseValues/);
  assert.match(route, /statusValues\.flatMap/);
  assert.match(route, /securityTotal: securityTotal \?\? 0/);

  assert.match(page, /AUDIT_STATUS_OPTIONS/);
  assert.match(page, /getActionMeta/);
  assert.match(page, /const m = getActionMeta\(option\.label\)/);
  assert.match(page, /<Activity className="h-3\.5 w-3\.5 shrink-0" \/>\s*All Actions/);
  assert.match(page, /isSecurityAuditAction\(event\.action\)/);
  assert.match(page, /setSecurityTotal\(json\.securityTotal \?\? 0\)/);
  assert.match(page, /security: securityTotal/);
  assert.match(page, /Audit Security Details/);
  assert.match(page, /Recorded IP Address/);
  assert.match(page, /Recorded Device \/ Browser/);
  assert.match(page, /event\.ipAddress/);
  assert.match(page, /event\.browser/);
}

console.log("audit trail checks passed");
