/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const sharedRoute = read("src/app/api/reports/staff-messages/route.ts");
const ictInbox = read("src/app/dashboard/ict/inbox/page.tsx");
const realtimeHook = read("src/hooks/useStaffMessagesRealtime.ts");

const contactPairs = [
  {
    route: "src/app/api/adviser-ict/messages/route.ts",
    page: "src/app/dashboard/adviser/contact-ict/page.tsx",
    context: "src/app/dashboard/adviser/context/NotificationContext.tsx",
    clear: "clearIctUnreadCount",
    legacyConversationPrefix: "adviser-ict",
  },
  {
    route: "src/app/api/guidance-ict/messages/route.ts",
    page: "src/app/dashboard/guidance/contact-ict/page.tsx",
    context: "src/app/dashboard/guidance/context/NotificationContext.tsx",
    clear: "clearIctUnreadCount",
    legacyConversationPrefix: "guidance-ict",
  },
  {
    route: "src/app/api/principal-ict/messages/route.ts",
    page: "src/app/dashboard/principal/contact-ict/page.tsx",
    context: "src/app/dashboard/principal/context/NotificationContext.tsx",
    clear: "clearIctMessageCount",
    legacyConversationPrefix: "principal-ict",
  },
];

for (const pair of contactPairs) {
  const route = read(pair.route);
  const page = read(pair.page);
  const context = read(pair.context);

  // All three role-specific endpoints wake the saved participants for a
  // new/replied thread and again when a read acknowledgement changes a count.
  assert.match(route, /await publishRealtimeInvalidation\(\[[\s\S]*?role: session\.type[\s\S]*?role: recipientType[\s\S]*?\], "staff-messages"\)/);
  assert.match(route, /repliesReadError[\s\S]*?await publishRealtimeInvalidation\(\[[\s\S]*?typedRoot\.sender_type[\s\S]*?typedRoot\.recipient_type[\s\S]*?\], "staff-messages"\)/);
  assert.match(route, /if \(rootId\) \{[\s\S]*?source_message_id", rootId[\s\S]*?status", "unread"[\s\S]*?\}/);
  assert.match(route, /select\("id, source_message_id"\)/);
  assert.match(route, /new Set\(\(data \?\? \[\]\)\.map/);
  assert.match(route, /searchParams\.get\("seenAfter"\)/);
  assert.match(route, /unreadQuery\.gt\("created_at"/);

  // Contact ICT and ICT Inbox now share one canonical key for a saved root.
  // That makes each participant accept the other's Realtime typing event.
  assert.match(route, /return `staff-message:\$\{id\}`/);
  assert.match(route, new RegExp(`staff-message\\|${pair.legacyConversationPrefix}`));

  // Opening Contact ICT dismisses only its sidebar attention count. Incoming
  // rows still retain `isUnread` until the user explicitly opens or replies.
  assert.match(page, new RegExp(`const \\{[\\s\\S]*?${pair.clear}[\\s\\S]*?\\} = useNotifContext\\(\\)`));
  assert.match(page, new RegExp(`useEffect\\(\\(\\) => \\{[\\s\\S]*?${pair.clear}\\(\\)`));
  assert.match(page, /conversation\.isUnread/);
  // A Realtime fetch may finish before the page-load fetch. Each Contact ICT
  // page must discard that old response rather than hiding the live thread.
  assert.match(page, /messagesRequestVersionRef/);
  assert.match(page, /requestVersion !== messagesRequestVersionRef\.current/);
  assert.doesNotMatch(page, /setIctUnreadCount\(Number\(data\.unreadCount/);
  assert.match(context, new RegExp(`${pair.clear}: \\(\\) => void`));
  assert.match(context, /ictBadgeVersionRef\.current \+= 1/);
  assert.match(context, /contact-ict-seen-at/);
  assert.match(context, /seenAfter/);
}

// Principal and Guidance email notifications are deferred until after the
// data-free Realtime invalidation, so email latency cannot hold ICT Inbox.
for (const routePath of [
  "src/app/api/guidance-ict/messages/route.ts",
  "src/app/api/principal-ict/messages/route.ts",
]) {
  const route = read(routePath);
  assert.match(route, /import \{ after, NextRequest, NextResponse \} from "next\/server"/);
  assert.ok(route.indexOf('], "staff-messages");') < route.indexOf("if (!rootId) after(async () =>"));
}

// ICT Inbox is a real subscriber over the shared staff-message source, with
// an independent page-seen badge and a persistent unread list/filter.
assert.match(ictInbox, /\/api\/reports\/staff-messages\?role=ict/);
assert.match(ictInbox, /useStaffMessagesRealtime\(loadMessages/);
assert.match(ictInbox, /markInboxSeen\(\)/);
assert.match(ictInbox, /conversation\.isUnread/);
assert.match(ictInbox, /messagesRequestVersionRef/);
assert.match(ictInbox, /requestVersion !== messagesRequestVersionRef\.current/);
assert.match(sharedRoute, /\["read", "replied", "typing"\]/);
assert.match(sharedRoute, /A reply acknowledges every inbound message/);
assert.match(sharedRoute, /source_message_id", rootId/);
assert.match(realtimeHook, /invalidation\.scope === "staff-messages"/);

console.log("Contact ICT Realtime and unread-state checks passed");
