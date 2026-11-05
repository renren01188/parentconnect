/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const adviser = read("src/app/dashboard/adviser/reports/page.tsx");
const guidance = read("src/app/dashboard/guidance/reports/page.tsx");
const principal = read("src/app/dashboard/principal/reports/page.tsx");

// Status remains available in every role's list card, but not beside the
// open report details. Escalation banners are intentionally independent from
// these cards and must remain visible in the detail pane.
assert.match(adviser, /adviserReportStatusLabel\(r\)/);
assert.doesNotMatch(adviser, /adviserReportStatusLabel\(selectedReport\)/);
assert.match(adviser, /This report has been escalated to Guidance\./);
assert.match(adviser, /This report has been escalated to the Principal\./);

assert.match(guidance, /isResolvedByPrincipal \? "Resolved by Principal"[\s\S]*?r\.status/);
assert.doesNotMatch(guidance, /isPrincipalEscalated && selectedReport\.status === "Resolved" \? "Resolved by Principal"/);
assert.match(guidance, /This report has been escalated to the Principal\./);

assert.match(principal, /principalReportStatusLabel\(report\)/);
assert.doesNotMatch(principal, /principalReportStatusLabel\(selectedReport\)/);
assert.doesNotMatch(principal, /<ResolvedBadge large \/>/);
assert.match(principal, /Escalated from Guidance to the Principal\./);

console.log("report detail status-badge checks passed");
