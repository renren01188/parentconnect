/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const messageRoute = read("src/app/api/reports/parent-adviser/[id]/messages/route.ts");
const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");
const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const directMessages = read("src/app/api/reports/staff-messages/route.ts");

assert.doesNotMatch(messageRoute, /from "@\/lib\/mailer"/, "Report conversations must not import a mail sender.");
assert.doesNotMatch(messageRoute, /send[A-Za-z]*Email\(/, "No Parent report reply may dispatch an email.");

for (const role of ["adviser", "guidance", "principal"]) {
  assert.match(
    messageRoute,
    new RegExp(`insertMessage\\(reportId, "${role}"`),
    `${role} replies must be stored in the shared report-message table.`
  );
}

assert.match(messageRoute, /IDEMPOTENCY_KEY/, "Report replies must require an idempotency key.");
assert.match(messageRoute, /if \(!result\.duplicate\) await deliverReportInvalidation/, "A successful unique reply must publish the in-app update once.");
assert.match(messageRoute, /append_parent_adviser_report_message/, "The atomic database path must deduplicate concurrent retries.");
assert.match(messageRoute, /idempotency_key/, "The legacy database fallback must also deduplicate retries.");

for (const [role, page] of [["Adviser", adviserReports], ["Guidance", guidanceReports], ["Principal", principalReports]]) {
  assert.match(
    page,
    /\/api\/reports\/parent-adviser\/\$\{(?:selectedReport\.id|reportId)\}\/messages/,
    `${role} Reports replies must use the report-conversation endpoint.`
  );
}
assert.match(parentReports, /\/api\/reports\/parent-adviser\/\$\{reportId\}\/messages/, "Parent replies must remain in the same report conversation.");
assert.match(parentReports, /handleLiveReportUpdate/, "The Parent Reports panel must handle live report-message updates.");
assert.match(parentReports, /loadReportDetail\(event\.reportId\)/, "An open Parent conversation must reload its new reply without a page refresh.");
assert.match(parentNotifications, /parent_adviser_report_messages/, "In-app Parent notifications must still derive from report replies.");

assert.match(directMessages, /\.from\("staff_messages"\)/, "Direct New Message conversations remain separate from report threads.");
assert.match(directMessages, /sendStaffMessageEmail/, "The change must not remove email behavior from direct staff messages.");

console.log("Parent report reply email-suppression checks passed.");
