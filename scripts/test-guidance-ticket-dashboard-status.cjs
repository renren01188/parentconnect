/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const acceptRoute = read("src/app/api/reports/guidance/tickets/[id]/route.ts");
assert.match(acceptRoute, /if \(nextStatus === "accepted"\)[\s\S]*?status: "ongoing"/);
assert.match(acceptRoute, /guidance_seen_at: now/);
assert.match(acceptRoute, /includeGuidance: true[\s\S]*?kind: "status"/);

const dashboard = read("src/app/api/guidance/dashboard/route.ts");
assert.match(dashboard, /from\("parent_report_guidance_tickets"\)[\s\S]*?\.eq\("status", "accepted"\)/);
assert.match(dashboard, /const acceptedTicketReportIds = new Set\(/);
assert.match(dashboard, /const activeReports = reports\.filter\(\(report\) => !isResolved\(report\)\)/);
assert.match(dashboard, /const escalated = activeReports\.length/);
assert.match(dashboard, /const inProgress = activeReports\.filter\(isInProgress\)\.length/);
assert.match(dashboard, /status: isInProgress\(report\) \? "In Progress"/);

const mapper = read("src/app/api/reports/parent-adviser/_lib.ts");
assert.match(mapper, /const isAcceptedGuidanceTicket = ticket\?\.status === "accepted"/);
assert.match(mapper, /isAcceptedGuidanceTicket \? "Ongoing" as const/);

const reportsPage = read("src/app/dashboard/guidance/reports/page.tsx");
assert.match(reportsPage, /function isGuidanceReportInProgress\(report: Report\)[\s\S]*?report\.status !== "Resolved"/);
assert.match(reportsPage, /function guidanceReportStatusLabel/);
assert.match(reportsPage, /return "In Progress"/);
assert.match(reportsPage, /if \(report\.status === "Resolved"\) return "Resolved"/);
assert.match(reportsPage, /\{ongoingCount\} in progress/);

const dashboardPage = read("src/app/dashboard/guidance/page.tsx");
assert.match(dashboardPage, /label: "Escalated to Guidance"/);

console.log("guidance accepted-ticket dashboard status checks passed");
