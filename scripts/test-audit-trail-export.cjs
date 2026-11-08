/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const ictRoute = read("src/app/api/ict/audit-log/route.ts");
const principalRoute = read("src/app/api/principal/audit-log/route.ts");
const ictPage = read("src/app/dashboard/ict/audit-trail/page.tsx");
const principalPage = read("src/app/dashboard/principal/audit-trail/page.tsx");
const modal = read("src/components/AuditExportModal.tsx");
const csv = read("src/lib/auditCsv.ts");

for (const route of [ictRoute, principalRoute]) {
  // The already-authenticated Audit API validates the selected Manila day,
  // exports every page of that date, and leaves normal paginated reads intact.
  assert.match(route, /const exportCsv\s*=\s*searchParams\.get\("export"\) === "csv"/);
  assert.match(route, /if \(exportCsv\)[\s\S]*?if \(!dateRange\)[\s\S]*?status: 400/);
  assert.match(route, /for \(let from = 0; ; from \+= exportPageSize\)[\s\S]*?\.gte\("created_at", dateRange\.start\)[\s\S]*?\.lt\("created_at", dateRange\.end\)/);
  assert.match(route, /auditLogRowsToCsv\(exportedRows\)/);
  assert.match(route, /"Content-Type": "text\/csv; charset=utf-8"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
}

assert.match(csv, /Timestamp \(Manila\)/);
assert.match(csv, /text\.replace\(\/"\/g, '\"\"'\)/);
assert.match(csv, /formatAuditTimestamp\(row\.created_at\)/);

// Both pages use the same accessible, responsive modal and their own
// protected export endpoint. The modal requires a date and offers Export and Close.
assert.match(modal, /type="date"/);
assert.match(modal, /Choose a date to export\./);
assert.match(modal, />Close<\/button>/);
assert.match(modal, /Exporting…/);
assert.match(ictPage, /downloadAuditCsv\("\/api\/ict\/audit-log", date, "ict-audit-trail"\)/);
assert.match(principalPage, /downloadAuditCsv\("\/api\/principal\/audit-log", date, "principal-audit-trail"\)/);
assert.equal((ictPage.match(/setExportOpen\(true\)/g) ?? []).length, 1);
assert.equal((principalPage.match(/setExportOpen\(true\)/g) ?? []).length, 1);
assert.match(ictPage, /<AuditExportModal accentColor="#274e13"/);
assert.match(principalPage, /<AuditExportModal accentColor=\{PRIMARY\}/);

console.log("audit trail date export checks passed");
