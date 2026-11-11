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
const pdf = read("src/lib/auditPdf.ts");
const download = read("src/lib/downloadAuditPdf.ts");

for (const route of [ictRoute, principalRoute]) {
  // The existing role-protected API accepts only a valid date and PDF export,
  // then includes every audit event on that Manila calendar date.
  assert.match(route, /const exportPdf\s*=\s*exportFormat === "pdf"/);
  assert.match(route, /if \(exportFormat && !exportPdf\)[\s\S]*?Audit Trail exports are available as PDF only\./);
  assert.match(route, /if \(exportPdf\)[\s\S]*?if \(!dateRange\)[\s\S]*?status: 400/);
  assert.match(route, /isFutureAuditManilaDate\(date\)/);
  assert.match(route, /Choose today or an earlier date\./);
  assert.match(route, /for \(let from = 0; ; from \+= exportPageSize\)[\s\S]*?\.gte\("created_at", dateRange\.start\)[\s\S]*?\.lt\("created_at", dateRange\.end\)/);
  assert.match(route, /auditLogRowsToPdf\(exportedRows, date\)/);
  assert.match(route, /"Content-Type": "application\/pdf"/);
  assert.match(route, /filename="[^"]*-audit-trail-\$\{date\}\.pdf"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.doesNotMatch(route, /auditLogRowsToCsv|text\/csv|exportCsv/);
}

assert.match(pdf, /export function auditLogRowsToPdf/);
assert.match(pdf, /formatAuditTimestamp\(row\.created_at\)/);
assert.match(pdf, /IP address:/);
assert.match(pdf, /Device \/ browser:/);
assert.match(download, /export: "pdf"/);
assert.match(download, /\.pdf/);

// Both pages use the shared date picker and export only a PDF from their own
// protected route. The modal explicitly explains the downloaded format.
assert.match(modal, /type="date"/);
assert.match(modal, /Choose a date to export\./);
assert.match(modal, /auditManilaToday/);
assert.match(modal, /isFutureAuditManilaDate\(date\)/);
assert.match(modal, /max=\{today\}/);
assert.match(modal, /Choose today or an earlier date\./);
assert.match(modal, /disabled=\{exporting \|\| !date \|\| Boolean\(futureDateError\)\}/);
assert.match(modal, /The selected Audit Trail will be exported as a PDF \(\.pdf\)\./);
assert.match(modal, /Export PDF/);
assert.match(modal, />Close<\/button>/);
assert.match(modal, /Exporting/);
assert.match(ictPage, />\s*Export PDF\s*<\/button>/);
assert.match(principalPage, />\s*Export PDF\s*<\/button>/);
assert.match(ictPage, /downloadAuditPdf\("\/api\/ict\/audit-log", date, "ict-audit-trail"\)/);
assert.match(principalPage, /downloadAuditPdf\("\/api\/principal\/audit-log", date, "principal-audit-trail"\)/);
assert.equal((ictPage.match(/setExportOpen\(true\)/g) ?? []).length, 1);
assert.equal((principalPage.match(/setExportOpen\(true\)/g) ?? []).length, 1);
assert.match(ictPage, /<AuditExportModal accentColor="#274e13"/);
assert.match(principalPage, /<AuditExportModal accentColor=\{PRIMARY\}/);

console.log("audit trail PDF export checks passed");
