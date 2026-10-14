/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const staffMessages = read("src/app/api/reports/staff-messages/route.ts");
const staffTyping = read("src/hooks/useStaffConversationTyping.ts");
const reportTyping = read("src/hooks/useReportTyping.ts");

// A committed Guidance direct message wakes the exact Parent account before
// the sender receives its response. Follow-up replies notify both verified
// conversation participants through the same data-free Realtime scope.
assert.match(staffMessages, /sender_type: current\.type,[\s\S]*?recipient_type: "parent"[\s\S]*?status: "unread"/);
assert.match(staffMessages, /\{ role: current\.type, id: current\.id \},[\s\S]*?\{ role: "parent", id: recipient\.parentId \}/);
assert.match(staffMessages, /publishRealtimeInvalidation\([\s\S]*?"staff-messages"\)/);
assert.match(staffMessages, /nextStatus === "typing"[\s\S]*?scope: "staff-messages"[\s\S]*?kind: "typing"/);

// Both Parent and Guidance discard an old summary response if a newer
// Realtime refresh has started. A detail fetch in progress gets exactly one
// follow-up read, preventing an old snapshot from hiding the new bubble.
assert.match(parentReports, /reportListRequestVersion = useRef\(0\)/);
assert.match(parentReports, /requestVersion !== reportListRequestVersion\.current/);
assert.match(parentReports, /detailRefreshQueuedRef\.current\.add\(id\)/);
assert.match(parentReports, /while \(detailRefreshQueuedRef\.current\.has\(id\)\)/);
assert.match(guidanceReports, /guidanceReportRequestVersionRef = useRef\(0\)/);
assert.match(guidanceReports, /staffMessageRequestVersionRef = useRef\(0\)/);
assert.match(guidanceReports, /requestVersion !== staffMessageRequestVersionRef\.current/);
assert.match(guidanceReports, /reportDetailRefreshQueuedRef\.current\.add\(id\)/);
assert.match(guidanceReports, /while \(reportDetailRefreshQueuedRef\.current\.has\(id\)\)/);

// A New Message stays selected if its own Realtime refresh races the local
// post-send refresh, so it opens in Guidance and arrives in Parent Reports.
assert.match(guidanceReports, /preferredStaffConversationRef/);
assert.match(guidanceReports, /preferredStaffConversationRef\.current = preferredConversationId/);
assert.match(guidanceReports, /const conversationId = data\?\.message\?\.id \? `staff-message:\$\{data\.message\.id\}` : undefined/);
assert.match(guidanceReports, /await loadGuidanceStaffMessages\(conversationId\)/);
assert.match(parentReports, /useReportMessagesRealtime\(loadReports/);
assert.match(guidanceReports, /useReportMessagesRealtime\(refreshGuidanceInbox/);

// Direct-message and report-thread typing share their existing protected
// publishers and render a received indicator on both Reports pages.
assert.match(parentReports, /useStaffConversationTyping\(selectedStandaloneConversationId, "parent"\)/);
assert.match(guidanceReports, /useStaffConversationTyping\([\s\S]*?"guidance"/);
assert.match(parentReports, /staffConversationTyping\.onDraftChange\(hasDraft\)/);
assert.match(guidanceReports, /staffConversationTyping\.onDraftChange\(Boolean\(e\.target\.value\.trim\(\)\)\)/);
assert.match(parentReports, /The other participant is typing/);
assert.match(guidanceReports, /The other participant is typing/);
assert.match(staffTyping, /event\.conversationId !== conversationId/);
assert.match(reportTyping, /event\.reportId !== reportId/);

console.log("guidance-parent live messaging checks passed");
