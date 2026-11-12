/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const dataSource = read("src/app/dashboard/adviser/data.ts");
const dataJs = ts.transpileModule(dataSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText;
const dataModule = { exports: {} };
new Function("module", "exports", "require", dataJs)(dataModule, dataModule.exports, require);
const { reportTicketLabel } = dataModule.exports;

// A stored report number wins when present; existing historical reports use
// their immutable original record ID. Linked Guidance-ticket IDs never enter
// this label, so escalation cannot renumber a report.
assert.equal(reportTicketLabel({ id: 10, ticketNumber: 1 }), "#1");
assert.equal(reportTicketLabel({ id: 10, ticketNumber: null }), "#10");
assert.equal(reportTicketLabel({ id: 10 }), "#10");
assert.equal(reportTicketLabel({ id: 10, ticketNumber: 0 }), "#10");

const mapper = read("src/app/api/reports/parent-adviser/_lib.ts");
for (const mapperName of ["toAdviserReport", "toGuidanceReport", "toPrincipalReport"]) {
  const start = mapper.indexOf(`export function ${mapperName}`);
  const end = mapper.indexOf("\nexport function ", start + 1);
  const block = mapper.slice(start, end === -1 ? undefined : end);
  assert.match(block, /ticketNumber: row\.id/, `${mapperName} must expose the original report number.`);
}
assert.match(mapper, /Guidance tickets[\s\S]*?must not renumber this conversation/);
assert.match(mapper, /Do not substitute ticket\?\.id/);

const route = read("src/app/api/reports/parent-adviser/route.ts");
assert.match(route, /toAdviserReportSummary/);
assert.match(route, /toGuidanceReportSummary/);
assert.match(route, /toPrincipalReportSummary/);
assert.match(route, /toAdviserReport\(/);
assert.match(route, /toGuidanceReport\(/);
assert.match(route, /toPrincipalReport\(/);

const pages = [
  ["src/app/dashboard/adviser/reports/page.tsx", "emerald"],
  ["src/app/dashboard/guidance/reports/page.tsx", "sky"],
  ["src/app/dashboard/principal/reports/page.tsx", "violet"],
];
for (const [file, theme] of pages) {
  const page = read(file);
  assert.match(page, /reportTicketLabel\(report\)|reportTicketLabel\(r\)/, `${file} must label report-list subjects.`);
  const headers = page.match(/reportTicketLabel\(selectedReport\)/g) ?? [];
  assert.ok(headers.length >= 2, `${file} must label both locked and opened conversation headers.`);
  assert.match(page, new RegExp(`text-${theme}-700`), `${file} must use its dashboard theme for the ticket label.`);
}

console.log("Shared report ticket-number mapping and three-dashboard display checks passed.");
