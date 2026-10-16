/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const realtime = read("src/lib/subscribeRealtimeInvalidations.ts");
const server = read("src/app/api/reports/staff-messages/route.ts");
const typingHook = read("src/hooks/useStaffConversationTyping.ts");
const staffRealtimeHook = read("src/hooks/useStaffMessagesRealtime.ts");
const reportRealtimeHook = read("src/hooks/useReportMessagesRealtime.ts");
const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const ictInbox = read("src/app/dashboard/ict/inbox/page.tsx");

assert.match(realtime, /conversationId: string \| null/);
assert.match(realtime, /(?:staff-message\|adviser-ict\|guidance-ict\|principal-ict)/);
assert.match(server, /\["read", "replied", "typing"\]/);
assert.match(server, /nextStatus === "typing"/);
assert.match(server, /Invalid typing event/);
assert.match(server, /scope: "staff-messages"/);
assert.match(server, /kind: "typing"/);
assert.match(server, /conversationId: String\(conversationId\)/);
assert.match(typingHook, /status: "typing"/);
assert.match(typingHook, /event\.conversationId !== conversationId/);
assert.match(typingHook, /TYPING_HEARTBEAT_MS = 1_000/);
assert.match(typingHook, /lastActivePublishAtRef/);
assert.match(typingHook, /now - lastActivePublishAtRef\.current >= TYPING_HEARTBEAT_MS/);
assert.match(typingHook, /window\.setTimeout\(clearOtherTyping, OTHER_TYPING_EXPIRY_MS\)/);
assert.match(typingHook, /return \(\) => \{[\s\S]*stopTyping\(\);[\s\S]*clearOtherTyping\(\);/);
assert.match(staffRealtimeHook, /invalidation\.kind === "typing"/);
assert.match(staffRealtimeHook, /conversationUpdateRef\.current\?\.\(invalidation\)/);
assert.match(reportRealtimeHook, /onStaffMessageUpdate/);
assert.match(reportRealtimeHook, /invalidation\.scope === "staff-messages"[\s\S]*invalidation\.kind === "typing"/);

for (const [file, role] of [
  ["src/app/dashboard/adviser/contact-ict/page.tsx", "adviser"],
  ["src/app/dashboard/guidance/contact-ict/page.tsx", "guidance"],
  ["src/app/dashboard/principal/contact-ict/page.tsx", "principal"],
  ["src/app/dashboard/ict/inbox/page.tsx", "ict"],
]) {
  const source = read(file);
  assert.match(source, /useStaffConversationTyping/);
  assert.match(source, new RegExp(`useStaffConversationTyping\\(selected\\?\\.conversationId \\?\\? null, "${role}"\\)`));
  assert.match(source, /onConversationUpdate: conversationTyping\.onRealtimeEvent/);
  assert.match(source, /conversationTyping\.isOtherParticipantTyping/);
  assert.match(source, /conversationTyping\.onDraftChange\(Boolean\(event\.target\.value\.trim\(\)\)\)/);
  assert.match(source, /conversationTyping\.stopTyping\(\)/);
}

for (const file of [
  "src/app/dashboard/adviser/reports/page.tsx",
  "src/app/dashboard/guidance/reports/page.tsx",
  "src/app/dashboard/principal/reports/page.tsx",
]) {
  const source = read(file);
  assert.match(source, /useReportTyping/);
  assert.match(source, /isOtherParticipantTyping/);
  assert.match(source, /The other participant is typing/);
  assert.match(source, /const handleLiveStaffMessageUpdate = useCallback/);
  assert.match(source, /staffConversationTyping\.onRealtimeEvent\(event\)[\s\S]*?if \(event\.kind === "typing"\) return/);
  assert.match(source, /onStaffMessageUpdate: handleLiveStaffMessageUpdate/);
}

// Standalone conversations created through New Message use the same typing
// publisher as Contact ICT. This lets a Parent see Adviser, Guidance, or
// Principal activity before the next saved reply arrives.
for (const [source, role] of [
  [adviserReports, "adviser"],
  [guidanceReports, "guidance"],
  [principalReports, "principal"],
]) {
  assert.match(source, /useStaffConversationTyping/);
  assert.match(source, new RegExp(`"${role}"`));
  assert.match(source, /onStaffMessageUpdate: handleLiveStaffMessageUpdate/);
  assert.match(source, /staffConversationTyping\.onDraftChange\(Boolean\(/);
  assert.match(source, /staffConversationTyping\.stopTyping\(\)/);
}

assert.match(parentReports, /useReportTyping/);
assert.match(parentReports, /useStaffConversationTyping/);
assert.match(parentReports, /selectedStandaloneConversationId/);
assert.match(parentReports, /onStaffMessageUpdate: handleLiveStaffMessageUpdate/);
assert.match(parentReports, /const handleLiveStaffMessageUpdate = useCallback/);
assert.match(parentReports, /staffConversationTyping\.onDraftChange\(hasDraft\)/);
assert.match(parentReports, /staffConversationTyping\.clearOtherTyping\(\)/);

// All four message panels render the same live status before their attachment
// controls. New ICT threads are selected immediately so typing is scoped to
// the newly created conversation without a page refresh.
for (const source of [adviserReports, guidanceReports, principalReports, ictInbox]) {
  assert.match(source, /aria-label="The other participant is typing…"/);
  assert.match(source, /The other participant is typing…/);
}
assert.match(ictInbox, /setSelectedId\(conversation\.conversationId\)/);
assert.match(ictInbox, /setMobileThreadOpen\(true\)/);

console.log("staff typing realtime checks passed");
