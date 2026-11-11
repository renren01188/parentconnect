/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const sharedRoute = read("src/app/api/reports/staff-messages/route.ts");
const ictInbox = read("src/app/dashboard/ict/inbox/page.tsx");
const realtimeHook = read("src/hooks/useStaffMessagesRealtime.ts");
const sessionInvalidation = read("src/hooks/useSessionInvalidation.ts");
const realtimeSubscriber = read("src/lib/subscribeRealtimeInvalidations.ts");
const realtimeChannelRoute = read("src/app/api/realtime/channel/route.ts");
const browserSupabase = read("src/lib/supabaseBrowser.ts");
const ictNotifications = read("src/app/dashboard/ict/context/NotificationContext.tsx");
const guidanceIctRoute = read("src/app/api/guidance-ict/messages/route.ts");
const principalIctRoute = read("src/app/api/principal-ict/messages/route.ts");
const ictMessageRecipients = read("src/lib/ictMessageRecipients.ts");

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
  assert.match(route, /await publishRealtimeInvalidation\(\[[\s\S]*?role: session\.type[\s\S]*?role: recipientType[\s\S]*?\],\s*(?:"staff-messages"|\{\s*scope: "staff-messages",\s*kind: "message")/);
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
  assert.match(page, /function mergeConversations\(current: Conversation\[\], incoming: Conversation\[\]\)/);
  assert.match(page, /setConversations\(\(current\) => mergeConversations\(current, nextConversations\)\)/);
  assert.doesNotMatch(page, /setIctUnreadCount\(Number\(data\.unreadCount/);
  assert.match(context, new RegExp(`${pair.clear}: \\(\\) => void`));
  assert.match(context, /ictBadgeVersionRef\.current \+= 1/);
  assert.match(context, /contact-ict-seen-at/);
  assert.match(context, /seenAfter/);

  // New Message carries the selected opaque ICT account ID through the
  // dropdown. Each server route must re-check that exact eligible account
  // immediately before it persists a root or a reply.
  assert.match(page, /value=\{recipient\.id\}/);
  assert.match(route, /listEligibleIctMessageRecipients/);
  assert.match(route, /findEligibleIctMessageRecipient\(recipientId\)/);
  assert.match(route, /id: recipient\.recipientId/);
}

// The shared lookup accepts only a single ict:<positive-id> value and filters
// both list and point validation by active, non-archived accounts. This keeps
// display labels from acting as routing identifiers and closes stale account
// delivery at the server boundary.
assert.match(ictMessageRecipients, /value\.match\(\/\^ict:\(\[1-9\]\[0-9\]\*\)\$\//);
assert.match(ictMessageRecipients, /\.eq\("status", "active"\)[\s\S]*?\.eq\("archive_status", "active"\)/);
assert.match(ictMessageRecipients, /\.eq\("id", id\)[\s\S]*?\.eq\("status", "active"\)[\s\S]*?\.eq\("archive_status", "active"\)/);

// ICT's role-pair endpoints are also safe to call directly in either
// direction. Their recipient lookup must resolve the matching role table,
// never an unrelated Adviser record.
assert.match(guidanceIctRoute, /\.from\("guidance_counselors"\)[\s\S]*?id: `guidance:\$\{row\.id\}`/);
assert.match(principalIctRoute, /\.from\("principals"\)[\s\S]*?\.eq\("is_active", true\)[\s\S]*?id: `principal:\$\{row\.id\}`/);

// These providers live in their respective dashboard layouts, not on Contact
// ICT. An ICT reply must therefore refresh the badge while the recipient is
// browsing any other page, and the matching sidebar must consume that state.
for (const [contextPath, sidebarPath, countName, refreshName] of [
  ["src/app/dashboard/adviser/context/NotificationContext.tsx", "src/app/dashboard/adviser/components/Sidebar.tsx", "ictUnreadCount", "loadIctCount"],
  ["src/app/dashboard/guidance/context/NotificationContext.tsx", "src/app/dashboard/guidance/components/Sidebar.tsx", "ictUnreadCount", "loadIctCount"],
  ["src/app/dashboard/principal/context/NotificationContext.tsx", "src/app/dashboard/principal/components/Sidebar.tsx", "ictMessageCount", "refreshIctMessages"],
]) {
  const context = read(contextPath);
  const sidebar = read(sidebarPath);
  assert.match(context, /useSessionInvalidation/);
  assert.match(context, new RegExp(`scope === "staff-messages"[\\s\\S]*?${refreshName}`));
  assert.match(sidebar, new RegExp(countName));
}

// Principal and Guidance email notifications are deferred until after the
// data-free Realtime invalidation, so email latency cannot hold ICT Inbox.
for (const routePath of [
  "src/app/api/guidance-ict/messages/route.ts",
  "src/app/api/principal-ict/messages/route.ts",
]) {
  const route = read(routePath);
  assert.match(route, /import \{ after, NextRequest, NextResponse \} from "next\/server"/);
  assert.ok(route.indexOf("await publishRealtimeInvalidation(") < route.indexOf("if (!rootId) after(async () =>"));
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
assert.match(
  sharedRoute,
  /const excludeIctContact = req\.nextUrl\.searchParams\.get\("excludeIct"\) === "1"/,
  "The shared staff-message API must support a Reports-only ICT exclusion",
);
assert.match(
  sharedRoute,
  /allRows\.filter\(\(row\) => !isIctContactRow\(row, current\.type\)\)/,
  "Reports-scoped staff results must remove only the current role's ICT threads",
);
// The ICT layout owns its badge subscription, so a Principal message updates
// it before ICT opens the Inbox. The count endpoint remains the authority.
assert.match(ictNotifications, /new URLSearchParams\(\{ role: "ict", summary: "1" \}\)/);
assert.match(ictNotifications, /useSessionInvalidation\(\(\{ scope \}\) => \{[\s\S]*?scope === "staff-messages"[\s\S]*?refreshInboxCount\(\)/);
assert.match(ictNotifications, /inboxBadgeVersionRef/);
assert.match(ictNotifications, /badgeVersion === inboxBadgeVersionRef\.current/);
assert.match(ictNotifications, /inboxCountRequestVersionRef/);
assert.match(ictNotifications, /requestVersion === inboxCountRequestVersionRef\.current/);
assert.match(sharedRoute, /searchParams\.get\("summary"\) === "1"[\s\S]*?recipient_type", current\.type[\s\S]*?unreadConversationIds/);
assert.match(
  sharedRoute,
  /\.or\(`and\(sender_type\.eq\.\$\{current\.type\},sender_id\.eq\.\$\{current\.id\}\),and\(recipient_type\.eq\.\$\{current\.type\},recipient_id\.eq\.\$\{current\.id\}\)`\)/,
  "The server must scope every ICT Inbox snapshot to the signed-in account ID.",
);
assert.match(
  sharedRoute,
  /const isParticipant =[\s\S]*?root\.sender_type === current\.type[\s\S]*?root\.recipient_type === current\.type/,
  "Opening or replying to a direct conversation must re-check the saved participants.",
);
assert.match(read("src/app/api/principal-ict/messages/route.ts"), /kind: "message",[\s\S]*?conversationId: conversationId\(rootId \?\? Number\(createdMessage\.id\)\)/);
// A first subscription has the same short race window as a reconnect. Its
// completion must therefore reconcile the page's protected snapshot too.
assert.match(sessionInvalidation, /if \(status === "SUBSCRIBED"\) \{[\s\S]*?dispatch\(reconnectRefresh\)/);
assert.match(sessionInvalidation, /export type RealtimeConnectionStatus = "CONNECTING" \| ChannelStatus/);
assert.match(sessionInvalidation, /dispatchConnectionStatus\(status\)/);
assert.match(sessionInvalidation, /if \(!client\) \{[\s\S]*?dispatchConnectionStatus\("CHANNEL_ERROR"\)/);
assert.match(browserSupabase, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY[\s\S]*?NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.match(realtimeHook, /useSessionInvalidation\([\s\S]*?\(status\) => \{/);
assert.match(realtimeHook, /connectionStatus === "SUBSCRIBED" \? 300_000 : 30_000/);
assert.match(realtimeHook, /Checking for new messages automatically/);
// Multiple role cookies can legitimately coexist in a testing or admin
// browser. The mounted dashboard must request its own opaque capability
// channel rather than accepting the endpoint's historical first-cookie role.
assert.match(realtimeSubscriber, /dashboardRoleFromPathname/);
assert.match(realtimeSubscriber, /\/api\/realtime\/channel\?role=\$\{encodeURIComponent\(role\)\}/);
assert.match(realtimeChannelRoute, /async function recipientForRole\(role: DashboardRealtimeRole\)/);
assert.match(realtimeChannelRoute, /requestedRole[\s\S]*?\? await recipientForRole\(requestedRole as DashboardRealtimeRole\)/);
// Adviser sends, ICT replies, and ICT-created threads all identify the saved
// conversation in the same data-free Realtime event.
assert.match(read("src/app/api/adviser-ict/messages/route.ts"), /kind: "message",[\s\S]*?conversationId: conversationId\(rootId \?\? Number\(createdMessage\.id\)\)/);
assert.match(sharedRoute, /kind: "message",[\s\S]*?conversationId: `staff-message:\$\{sourceMessageId \|\| Number\(createdMessage\.id\)\}`/);
assert.match(sharedRoute, /kind: "message",[\s\S]*?conversationId: `staff-message:\$\{rootId\}`/);

// The sender must not wait for a separate Realtime event (or for the other
// participant to write) before seeing their successful Adviser message. The
// saved message returned by the API is rendered optimistically and then the
// protected background refresh reconciles it with the server snapshot.
const adviserContact = read("src/app/dashboard/adviser/contact-ict/page.tsx");
assert.match(adviserContact, /type CreatedStaffMessage/);
assert.match(adviserContact, /function responseErrorMessage/);
assert.match(adviserContact, /The write route returns the saved row\. Render it now/);
assert.match(adviserContact, /const conversationId = `staff-message:\$\{created\.id\}`/);
assert.match(adviserContact, /setConversations\(\(current\) => sortByLatestActivity\(\[\s*conversation,/);
assert.match(adviserContact, /thread: \[\.\.\.conversation\.thread, sentMessage\]/);
assert.match(adviserContact, /messagesRequestVersionRef\.current \+= 1/);
// Principal uses the same durable-response rendering as Adviser and Guidance.
// The sender must see both a new root and a reply without waiting for another
// user action or a second request to complete.
const principalContact = read("src/app/dashboard/principal/contact-ict/page.tsx");
assert.match(principalContact, /type CreatedStaffMessage/);
assert.match(principalContact, /The API has already committed the row/);
assert.match(principalContact, /const conversationId = `staff-message:\$\{created\.id\}`/);
assert.match(principalContact, /setConversations\(\(current\) => sortByLatestActivity\(\[\s*conversation,/);
assert.match(principalContact, /thread: \[\.\.\.conversation\.thread, sentMessage\]/);
assert.match(principalContact, /messagesRequestVersionRef\.current \+= 1/);
// Both panes publish local typing state and consume the other participant's
// data-free Realtime typing event for the active canonical conversation.
assert.match(adviserContact, /conversationTyping\.onRealtimeEvent/);
assert.match(adviserContact, /conversationTyping\.onDraftChange/);
assert.match(adviserContact, /conversationTyping\.isOtherParticipantTyping/);
assert.match(ictInbox, /conversationTyping\.onRealtimeEvent/);
assert.match(ictInbox, /conversationTyping\.onDraftChange/);
assert.match(ictInbox, /conversationTyping\.isOtherParticipantTyping/);

// Guidance-to-ICT uses the same durable-write contract: a new Guidance row
// is selected and returned to its sender, while ICT gets an opaque message
// invalidation that wakes both the open Inbox and the layout-level badge.
const guidanceRoute = read("src/app/api/guidance-ict/messages/route.ts");
const guidanceContact = read("src/app/dashboard/guidance/contact-ict/page.tsx");
const guidanceNotifications = read(
  "src/app/dashboard/guidance/context/NotificationContext.tsx",
);
const guidanceSidebar = read("src/app/dashboard/guidance/components/Sidebar.tsx");
assert.match(guidanceRoute, /const \{ data: createdMessage, error \} = await supabase\.from\("staff_messages"\)\.insert\(/);
assert.match(guidanceRoute, /idempotency_key: idempotencyKey,[\s\S]*?\}\)\.select\("\*"\)\.single\(\)/);
assert.match(guidanceRoute, /scope: "staff-messages",[\s\S]*?kind: "message",[\s\S]*?conversationId: conversationId\(rootId \?\? Number\(createdMessage\.id\)\),[\s\S]*?messageId: Number\(createdMessage\.id\)/);
assert.match(guidanceRoute, /return NextResponse\.json\(\{ success: true, message: createdMessage \}, \{ status: 201 \}\)/);
assert.match(guidanceContact, /senderRole: "Guidance"/);
assert.match(guidanceContact, /Render the durable result before the asynchronous Realtime refresh/);
assert.match(guidanceContact, /function mergeConversations\(current: Conversation\[\], incoming: Conversation\[\]\)/);
assert.match(guidanceContact, /setConversations\(\(current\) => mergeConversations\(current, nextConversations\)\)/);
assert.match(guidanceContact, /const conversationId = `staff-message:\$\{created\.id\}`/);
assert.match(guidanceContact, /setConversations\(\(current\) => sortByLatestActivity\(\[\s*conversation,/);
assert.match(guidanceContact, /thread: \[\.\.\.conversation\.thread, sentMessage\]/);
assert.match(
  guidanceNotifications,
  /message\.status === "New" && message\.sender !== "ICT"/,
  "Guidance Reports count must exclude unread ICT conversations",
);
assert.match(
  guidanceNotifications,
  /setReportsUnreadCount\(reportCount \+ reportStaffCount \+ pendingTicketCount\)/,
  "Guidance Reports count must retain only report, non-ICT staff, and ticket counts",
);
assert.match(
  guidanceNotifications,
  /scope === "staff-messages"[\s\S]*?Promise\.all\(\[refreshGuidanceCounts\(\), loadIctCount\(\)\]\)/,
  "Guidance must refresh the dedicated ICT count on staff-message updates",
);
assert.match(
  guidanceSidebar,
  /ict: ictUnreadCount/,
  "Guidance Contact ICT sidebar badge must use the dedicated ICT unread count",
);

// Adviser Reports has a separate direct-staff source. ICT threads must be
// omitted from that count so the layout-level Contact ICT summary owns them.
const adviserNotifications = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const adviserSidebar = read("src/app/dashboard/adviser/components/Sidebar.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
assert.match(
  adviserNotifications,
  /message\.status === "New" && message\.sender !== "ICT"/,
  "Adviser Reports count must exclude unread ICT conversations",
);
assert.match(
  adviserNotifications,
  /setUnreadCount\(actionableParentReports \+ actionableStudentReports \+ actionablePrincipalMessages \+ unreadReportStaffMessages\)/,
  "Adviser Reports count must retain only report-scoped and non-ICT staff work",
);
assert.match(
  adviserNotifications,
  /scope === "staff-messages"[\s\S]*?loadReportCount\(\)[\s\S]*?loadIctCount\(\)/,
  "Adviser must refresh the dedicated Contact ICT count after a live staff message",
);
assert.match(
  adviserSidebar,
  /reports: unreadCount,[\s\S]*?ict: ictUnreadCount/,
  "Adviser sidebar must map report and Contact ICT badges to separate counts",
);
assert.match(
  adviserNotifications,
  /staff-messages\?role=adviser&excludeIct=1/,
  "Adviser Reports badge must request the ICT-free staff feed",
);
assert.match(
  adviserReports,
  /staff-messages\?role=adviser&excludeIct=1/,
  "Adviser Reports must request the ICT-free staff feed",
);
assert.match(
  adviserReports,
  /message\.sender !== "ICT" && message\.message_sender !== "ICT"/,
  "Adviser Reports must retain its defensive ICT conversation filter",
);
assert.match(
  adviserContact,
  /function mergeConversations/,
  "Adviser Contact ICT remains responsible for live ICT conversations",
);

assert.match(
  guidanceNotifications,
  /staff-messages\?role=guidance&excludeIct=1/,
  "Guidance Reports badge must request the ICT-free staff feed",
);
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
assert.match(
  guidanceReports,
  /staff-messages\?role=guidance&excludeIct=1/,
  "Guidance Reports must request the ICT-free staff feed",
);
assert.match(
  guidanceReports,
  /message\.sender !== "ICT" && message\.message_sender !== "ICT"/,
  "Guidance Reports must retain its defensive ICT conversation filter",
);
assert.match(
  guidanceContact,
  /function mergeConversations/,
  "Guidance Contact ICT remains responsible for live ICT conversations",
);

// Principal Reports must never use Contact ICT conversations as a report
// message. The Reports API excludes the pair at its source, and the page
// keeps a defensive client filter for stale responses during a deployment.
const principalReportsRoute = read("src/app/api/reports/principal-messages/route.ts");
const principalReportsPage = read("src/app/dashboard/principal/reports/page.tsx");
const principalNotifications = read("src/app/dashboard/principal/context/NotificationContext.tsx");
const principalSidebar = read("src/app/dashboard/principal/components/Sidebar.tsx");
assert.match(
  principalReportsRoute,
  /function isPrincipalIctPair\(row: StaffMessageRow\)/,
  "Principal Reports must identify Principal–ICT conversations",
);
assert.match(
  principalReportsRoute,
  /const reportStaffRows = unifiedStaffRows\.filter\(\(row\) => !isPrincipalIctPair\(row\)\)/,
  "Principal Reports must exclude Contact ICT rows before building its inbox",
);
assert.match(
  principalReportsRoute,
  /buildUnifiedStaffConversations\(principal, reportStaffRows\)/,
  "Principal Reports must only render report-scoped staff conversations",
);
assert.match(
  principalReportsPage,
  /conversation\.sender\.role !== "ICT"/,
  "Principal Reports must defensively exclude ICT conversations from its panel",
);
assert.match(
  principalNotifications,
  /scope === "staff-messages"[\s\S]*?refreshAdviserMessages\(\)[\s\S]*?refreshIctMessages\(\)/,
  "Principal must refresh the separate Contact ICT count after a live staff message",
);
assert.match(
  principalSidebar,
  /reports: reportCount \+ adviserMessageCount,[\s\S]*?ict: ictMessageCount/,
  "Principal sidebar must map report and Contact ICT badges to separate counts",
);

// The initial foreground fetch and the post-subscription Realtime refresh can
// overlap. A newer background snapshot may populate Panel 1 first, but it
// must not leave the original page-load indicator visible once it settles.
for (const [name, source] of [
  ["ICT Inbox", ictInbox],
  ["Adviser Contact ICT", adviserContact],
  ["Guidance Contact ICT", guidanceContact],
  ["Principal Contact ICT", principalContact],
]) {
  assert.match(
    source,
    /finally \{[\s\S]*?if \(!background\) setLoading\(false\);[\s\S]*?\}/,
    `${name} must always clear a completed foreground loader`,
  );
  assert.doesNotMatch(
    source,
    /if \(!background && requestVersion === messagesRequestVersionRef\.current\) setLoading\(false\);/,
    `${name} must not let a newer background refresh strand its loader`,
  );
  assert.match(source, /!loading && error/, `${name} must expose request errors`);
  assert.match(
    source,
    /!loading && !error && filteredConversations\.length === 0/,
    `${name} must expose an empty state after loading`,
  );
}

console.log("Contact ICT Realtime and unread-state checks passed");
