/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const { principalReportStatusLabel } = require(path.join(root, "src", "app", "dashboard", "principal", "reports", "layoutState.cjs"));

// The visible status comes from the resolver captured by the write path, not
// from a generic Resolved label or from a prior escalation label.
assert.equal(principalReportStatusLabel({ status: "Resolved", resolvedByRole: "Adviser" }), "Resolved by Adviser");
assert.equal(principalReportStatusLabel({ status: "Resolved", resolvedByRole: "Guidance" }), "Resolved by Guidance");
assert.equal(principalReportStatusLabel({ status: "Resolved", resolvedByRole: "Principal" }), "Resolved by Principal");

// Historical reports without the new value remain accurately identifiable by
// their durable workflow owner.
assert.equal(principalReportStatusLabel({ status: "Resolved", escalatedToGuidance: true }), "Resolved by Guidance");
assert.equal(principalReportStatusLabel({ status: "Resolved", escalatedToPrincipal: true }), "Resolved by Principal");

// Non-resolved routing labels retain their established text and priority.
assert.equal(principalReportStatusLabel({ status: "Ongoing", escalatedToPrincipal: true }), "Escalated from Guidance");
assert.equal(principalReportStatusLabel({ status: "Ongoing", escalatedToGuidance: true }), "Escalated to Guidance");

const principalPage = read("src/app/dashboard/principal/reports/page.tsx");
const reportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const reportsRoute = read("src/app/api/reports/parent-adviser/route.ts");
const adviserStatusRoute = read("src/app/api/reports/parent-adviser/[id]/status/route.ts");
const guidanceStatusRoute = read("src/app/api/reports/guidance/[id]/status/route.ts");
const principalStatusRoute = read("src/app/api/reports/principal/[id]/status/route.ts");
const migration = read("supabase/legacy-migrations/20261105120000_add_parent_report_resolver_role.sql");

assert.doesNotMatch(principalPage, /ResolvedBadge/);
assert.match(principalPage, /!isResolvedReport && <PriorityBadge level=\{report\.concernLevel\} compact \/>/);
assert.match(reportsRoute, /"resolved_by_role"/);
assert.match(reportMapper, /export function reportResolverRole/);
assert.match(reportMapper, /resolvedByRole,/);
assert.match(adviserStatusRoute, /updatePayload\.resolved_by_role = "Adviser"/);
assert.match(guidanceStatusRoute, /updatePayload\.resolved_by_role = "Guidance"/);
assert.match(principalStatusRoute, /resolved_by_role: "Principal"/);
assert.match(migration, /audit\.action = 'Report Resolved'/);
assert.match(migration, /CHECK \(resolved_by_role IS NULL OR resolved_by_role IN \('Adviser', 'Guidance', 'Principal'\)\)/);

console.log("principal report resolver badge checks passed");
