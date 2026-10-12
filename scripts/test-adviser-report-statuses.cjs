const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const statusHelpers = require(path.join(projectRoot, "src", "lib", "adviserReportStatusSummary.js"));
const page = fs.readFileSync(path.join(projectRoot, "src", "app", "dashboard", "adviser", "reports", "page.tsx"), "utf8");
const mapper = fs.readFileSync(path.join(projectRoot, "src", "app", "api", "reports", "parent-adviser", "_lib.ts"), "utf8");

const { effectiveAdviserReportStatus, adviserReportStatusCategory, adviserReportStatusLabel, summarizeAdviserReportStatuses } = statusHelpers;

const newReport = { status: "New" };
const ongoingReport = { status: "Ongoing" };
// Guidance deliberately stores this as ongoing after it begins review. The
// Adviser must still see the report as an escalation/handoff.
const escalatedReport = { status: "Ongoing", escalatedToGuidance: true };
const resolvedReport = { status: "Resolved", escalatedToGuidance: true, resolvedByGuidance: true };

assert.equal(effectiveAdviserReportStatus(newReport), "New");
assert.equal(adviserReportStatusCategory(newReport), "pending");
assert.equal(adviserReportStatusLabel(newReport), "Pending Review");
assert.equal(effectiveAdviserReportStatus(ongoingReport), "Ongoing");
assert.equal(adviserReportStatusCategory(ongoingReport), "ongoing");
assert.equal(effectiveAdviserReportStatus(escalatedReport), "Escalated");
assert.equal(adviserReportStatusCategory(escalatedReport), "escalated");
assert.equal(adviserReportStatusLabel(escalatedReport), "Escalated to Guidance");
assert.equal(effectiveAdviserReportStatus(resolvedReport), "Resolved");
assert.equal(adviserReportStatusCategory(resolvedReport), "resolved");

// One parent can have reports at several different workflow stages. Each
// report must contribute to exactly one parent-card status count.
assert.deepEqual(
  summarizeAdviserReportStatuses([newReport, ongoingReport, escalatedReport, resolvedReport]),
  { pending: 1, ongoing: 1, escalated: 1, resolved: 1, total: 4 },
);

assert.match(mapper, /function adviserDisplayReportStatus\(row: ReportRow\)/);
assert.match(mapper, /status: adviserDisplayReportStatus\(row\)/);
assert.match(page, /summarizeAdviserReportStatuses\(g\.reports\)/);
assert.match(page, /adviserReportStatusLabel\(r\)/);
assert.doesNotMatch(page, /const ongoingCount = g\.reports\.filter/);
assert.doesNotMatch(page, /guidanceEscalated/);

console.log("Adviser report statuses and mixed parent summaries are classified correctly.");
