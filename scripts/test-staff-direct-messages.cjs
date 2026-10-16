/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const staffRoute = read("src/app/api/reports/staff-messages/route.ts");
const typingHook = read("src/hooks/useStaffConversationTyping.ts");
const realtimeHook = read("src/hooks/useReportMessagesRealtime.ts");
const adviserContext = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const guidanceContext = read("src/app/dashboard/guidance/context/NotificationContext.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");
const sharedTypes = read("src/app/dashboard/adviser/data.ts");

// Every staff pair is created by the same authorized transport. Its recipient
// validation covers Principal, Guidance, and Adviser and it invalidates both
// verified participants as soon as the row is committed.
assert.match(staffRoute, /\["adviser", "guidance", "principal"\]\.includes\(recipientType\)/);
assert.match(staffRoute, /\{ role: current\.type, id: current\.id \},[\s\S]*?\{ role: recipientType, id: Number\(rawRecipientId\) \}/);
assert.match(staffRoute, /"staff-messages"\);/);
assert.match(staffRoute, /recipient_type: recipientType/);

// Direct threads retain inbox state rather than report workflow state.
assert.match(staffRoute, /const latestOutgoing = last\.sender_type === current\.type/);
assert.match(staffRoute, /status: unread \? "New" as const : latestOutgoing \? "Sent" as const : "Read" as const/);
assert.doesNotMatch(staffRoute, /thread\.length > 1 && !latestIncoming \? "Replied"/);
assert.match(sharedTypes, /AdminMsgStatus = "New" \| "Read" \| "Sent" \| "Replied"/);
assert.match(adviserReports, /const nextStatus: AdminMsgStatus = isDirectStaffConversation \? "Sent" : "Replied"/);
assert.match(guidanceReports, /status: "Sent", replies:/);

// Each Reports panel listens to the shared invalidation and feeds typing
// events to the scoped conversation hook without reloading the page.
for (const [source, role] of [
  [principalReports, "principal"],
  [guidanceReports, "guidance"],
  [adviserReports, "adviser"],
]) {
  assert.match(source, /useReportMessagesRealtime\(/);
  assert.match(source, /onStaffMessageUpdate: handleLiveStaffMessageUpdate/);
  assert.match(source, /const handleLiveStaffMessageUpdate = useCallback/);
  assert.match(source, /staffConversationTyping\.onRealtimeEvent\(event\)[\s\S]*?if \(event\.kind === "typing"\) return/);
  assert.match(source, new RegExp(`useStaffConversationTyping\\([\\s\\S]*?"${role}"`));
  assert.match(source, /staffConversationTyping\.onDraftChange\(Boolean\(/);
  assert.match(source, /staffConversationTyping\.isOtherParticipantTyping/);
}
assert.match(realtimeHook, /invalidation\.scope === "staff-messages"[\s\S]*?invalidation\.kind === "typing"/);
assert.match(typingHook, /status: "typing"/);
assert.match(staffRoute, /nextStatus === "typing"[\s\S]*?publishRealtimeInvalidation\(recipients, \{/);

// The initial New Message row now names its canonical thread in the durable
// invalidation. A recipient with that thread already open can reload it at
// once instead of waiting for a generic inbox refresh or another message.
assert.match(
  staffRoute,
  /recipient_type: "parent"[\s\S]*?scope: "staff-messages",[\s\S]*?kind: "message",[\s\S]*?conversationId: `staff-message:\$\{Number\(createdMessage\.id\)\}`,[\s\S]*?messageId: Number\(createdMessage\.id\)/,
);
assert.match(realtimeHook, /if \(staffMessageUpdateRef\.current\) \{[\s\S]*?staffMessageUpdateRef\.current\(invalidation\)[\s\S]*?catch\(scheduleRefresh\)/);

// Direct-message unread counts use their own message snapshots. A read or
// reply broadcasts the same scope, so the sidebar count is reconciled live.
assert.match(adviserContext, /fetch\("\/api\/reports\/staff-messages\?role=adviser[^"`]*/);
assert.match(adviserContext, /const unreadReportStaffMessages = directStaffMessages\.filter/);
assert.match(adviserContext, /void loadReportCount\(\);[\s\S]*?void loadIctCount\(\);/);
assert.match(guidanceContext, /fetch\("\/api\/reports\/staff-messages\?role=guidance[^"`]*/);
assert.match(guidanceContext, /\(message\) => message\.status === "New" && message\.sender !== "ICT"/);
assert.match(adviserReports, /const newAdmin = adminMsgs\.filter\(m => m\.status === "New"\)\.length/);
assert.match(guidanceReports, /const unreadDirectStaffMessages = adminMsgs\.filter\(\(message\) => message\.status === "New"\)\.length/);
assert.match(staffRoute, /status: "read"[\s\S]*?publishRealtimeInvalidation\(recipients, "staff-messages"\)/);

// Guidance focuses its just-sent direct thread immediately; the other panel
// receives the corresponding Realtime invalidation.
assert.match(guidanceReports, /const loadGuidanceStaffMessages = useCallback\(async \(preferredConversationId\?: string\)/);
assert.match(guidanceReports, /await loadGuidanceStaffMessages\(conversationId\);/);
assert.match(guidanceReports, /function getLatestAdminPreview\(message: AdminMessage\)/);
assert.match(guidanceReports, /\{preview\.senderName\} · \{preview\.senderRole\}:/);
assert.match(guidanceReports, /\{getAdminMsgStatusStyle\(m\.status\)\}/);

console.log("staff direct-message checks passed");
