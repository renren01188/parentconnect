/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const messages = read("src/app/api/reports/parent-adviser/[id]/messages/route.ts");
const typing = read("src/app/api/reports/parent-adviser/[id]/realtime/route.ts");
const reports = read("src/app/api/reports/parent-adviser/route.ts");
const guidanceStatus = read("src/app/api/reports/guidance/[id]/status/route.ts");
const parentPage = read("src/app/dashboard/parent/reports/page.tsx");
const adviserPage = read("src/app/dashboard/adviser/reports/page.tsx");
const guidancePage = read("src/app/dashboard/guidance/reports/page.tsx");
const principalPage = read("src/app/dashboard/principal/reports/page.tsx");

// Durable message and ephemeral typing events use the same current-owner
// handoff: Adviser first, then Guidance, then Principal. The Parent remains a
// participant at every stage.
for (const source of [messages, typing]) {
  assert.match(source, /const principalConversation = Boolean\(report\.escalated_to_principal\)/);
  assert.match(source, /const guidanceConversation = !principalConversation && Boolean\(report\.escalated_to_guidance\)/);
  assert.match(source, /includeAdviser: !principalConversation && !guidanceConversation/);
  assert.match(source, /includeGuidance: guidanceConversation/);
  assert.match(source, /includePrincipals: principalConversation/);
  assert.match(source, /parentId: report\.parent_id/);
}
assert.match(messages, /adviserId: principalConversation \|\| guidanceConversation \? null : report\.adviser_id/);
assert.match(messages, /kind: "message"/);
assert.match(typing, /kind: "typing"/);

// A ticket accepted by a different counselor is neither visible nor writable
// by this counselor. Ticketless legacy escalations remain supported.
assert.match(messages, /assignedGuidanceId !== null && assignedGuidanceId !== guidance\.id/);
assert.match(typing, /assignedGuidanceId !== null && assignedGuidanceId !== currentGuidanceId/);
assert.match(guidanceStatus, /assignedGuidanceId !== null && assignedGuidanceId !== guidance\.id/);
assert.match(reports, /ticket\?\.status !== "accepted"[\s\S]*?assignedGuidanceId === guidance\.id/);

// Each report page receives protected report invalidations, reloads only its
// open detail for a saved message, and supplies/consumes the typing state.
for (const [source, role] of [
  [parentPage, "parent"],
  [adviserPage, "adviser"],
  [guidancePage, "guidance"],
  [principalPage, "principal"],
]) {
  assert.match(source, /useReportMessagesRealtime\(/);
  assert.match(source, new RegExp(`useReportTyping\\(selectedReportId, "${role}"\\)`));
  assert.match(source, /reportTyping\.onRealtimeEvent\(event\)/);
  assert.match(source, /reportTyping\.onDraftChange\(/);
  assert.match(source, /reportTyping\.isOtherParticipantTyping/);
}

console.log("student-concern stage realtime checks passed");
