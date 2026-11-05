/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "dashboard", "principal", "reports", "page.tsx"),
  "utf8",
);

// A resolved handoff retains its history and status, but its current detail
// state is closed: the escalation banner and red border must disappear.
assert.match(page, /const showEscalationBanner = escalatedFromGuidance && !isResolved;/);
assert.match(page, /\$\{showEscalationBanner \? "border-l-4 border-l-red-500" : ""\}/);
assert.match(page, /\{showEscalationBanner && \(/);
assert.match(page, /This report has been resolved\. Messaging is unavailable\./);
assert.match(page, /principalReportStatusLabel\(report\)/);

console.log("principal resolved-banner checks passed");
