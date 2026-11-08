/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const parentReportsRoute = read("src/app/api/reports/parent-adviser/route.ts");
const reportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const cancelRoute = read("src/app/api/reports/parent-adviser/[id]/cancel/route.ts");
const messagesRoute = read("src/app/api/reports/parent-adviser/[id]/messages/route.ts");
const realtime = read("src/lib/realtimeInvalidation.ts");
const parentPage = read("src/app/dashboard/parent/reports/page.tsx");
const adviserPage = read("src/app/dashboard/adviser/reports/page.tsx");
const adviserLabels = read("src/lib/adviserReportStatusSummary.js");
const guidancePage = read("src/app/dashboard/guidance/reports/page.tsx");
const principalPage = read("src/app/dashboard/principal/reports/page.tsx");
const principalLabels = read("src/app/dashboard/principal/reports/layoutState.cjs");

// Cancelled reports remain visible to their linked Parent. The query stays
// scoped by the authenticated Parent and their linked students.
assert.match(parentReportsRoute, /\.eq\("parent_id", parent\.id\)[\s\S]*?\.in\("student_id", linkedStudentIds\)/);
assert.doesNotMatch(parentReportsRoute, /\.is\("cancelled_at", null\)/);

// Keep the durable cancelled state distinct from a completed/resolved report
// in every role's DTO, while preserving the existing record and messages.
assert.match(reportMapper, /if \(status === "cancelled"\) return "Cancelled"/);
assert.match(reportMapper, /const isCancelled = row\.status === "cancelled"/);
assert.match(reportMapper, /cancelledByParent: isCancelled/);
assert.equal((reportMapper.match(/cancelledByParent: row\.status === "cancelled"/g) ?? []).length, 3);

// The public UI makes the cancellation meaningful and does not remove the
// conversation from the currently open Parent report.
assert.match(parentPage, /status: "Cancelled", reportStatus: "Cancelled"/);
assert.match(parentPage, /This report has been cancelled\. Messaging is unavailable\./);
assert.match(parentPage, /No one will be able to send further messages\./);

// Staff use the requested wording and receive a disabled composer.
assert.match(adviserLabels, /cancelledByParent\) return "Cancelled by Parents"/);
assert.match(adviserPage, /Cancelled by Parents/);
assert.match(guidancePage, /cancelledByParent\) return "Cancelled by Parents"/);
assert.match(guidancePage, /The Parent cancelled this report\. No further messages can be sent\./);
assert.match(principalLabels, /cancelledByParent\) return "Cancelled by Parents"/);
assert.match(principalPage, /Cancelled by Parents\. Messaging is unavailable\./);

// API enforcement protects all roles if an old tab or crafted request bypasses
// the disabled UI. The report and its message history are never deleted.
assert.match(messagesRoute, /\["resolved", "cancelled"\]\.includes/);
assert.equal((messagesRoute.match(/isClosedReportStatus\(report\.status\)/g) ?? []).length, 4);
assert.doesNotMatch(cancelRoute, /\.delete\(/);

// Cancellation is broadcast as a durable report status change to the Parent,
// Adviser, applicable Guidance audience, and Principal monitoring audience.
assert.match(cancelRoute, /parentId: parent\.id,[\s\S]*?adviserId: report\.adviser_id,[\s\S]*?includeGuidance: Boolean\(report\.escalated_to_guidance\),[\s\S]*?reportId,[\s\S]*?kind: "status"/);
assert.match(realtime, /includePrincipals = true/);
assert.match(realtime, /includeGuidance[\s\S]*?supabase\.from\("guidance_counselors"\)/);

console.log("parent report cancellation visibility, labels, locks, and realtime checks passed");
