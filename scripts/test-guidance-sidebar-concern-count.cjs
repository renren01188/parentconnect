const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const context = read("src/app/dashboard/guidance/context/NotificationContext.tsx");
const sidebar = read("src/app/dashboard/guidance/components/Sidebar.tsx");
const reportRoute = read("src/app/api/reports/parent-adviser/route.ts");

assert.match(context, /escalatedToGuidance\?: boolean/,
  "Guidance count data must include the escalation ownership flag.");
assert.match(context, /report\.escalatedToGuidance === true/,
  "The sidebar workload must include reports escalated to Guidance.");
assert.match(context, /report\.escalatedToPrincipal !== true/,
  "Reports handed off to the Principal must leave Guidance's workload.");
assert.match(context, /report\.status !== "Resolved"/,
  "Resolved reports must not remain in the Guidance workload.");
assert.match(context, /setEscalatedCount\(activeGuidanceConcernCount \+ pendingTicketCount\)/,
  "The sidebar total must include active Guidance concerns and pending tickets.");
assert.match(context, /if \(scope === "reports"\)[\s\S]*?refreshGuidanceCounts\(\)/,
  "Report Realtime invalidations must refresh the Guidance count.");
assert.match(sidebar, /\{escalatedCount\} concern/,
  "The Guidance sidebar must render the active concern count.");
assert.match(reportRoute, /\.eq\("escalated_to_guidance", true\)/,
  "The Guidance report feed must be scoped to Guidance escalations.");

console.log("Guidance sidebar concern-count checks passed.");
