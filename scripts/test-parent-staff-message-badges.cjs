/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const parentContext = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentLayout = read("src/app/dashboard/parent/layout.tsx");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const staffMessages = read("src/app/api/reports/staff-messages/route.ts");
const reportRead = read("src/app/api/reports/parent-adviser/[id]/read/route.ts");
const notificationFeed = read("src/lib/notificationFeed.ts");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");

// The layout-level provider is present on every Parent page. A Realtime event
// received during an initial count request must produce one follow-up snapshot
// instead of leaving the sidebar at the count from before the message existed.
assert.match(parentContext, /notificationCountRefreshQueued/);
assert.match(parentContext, /reportCountRefreshQueued/);
assert.match(parentContext, /do \{[\s\S]*?fetch\("\/api\/parents\/notifications"[\s\S]*?\} while \(notificationCountRefreshQueued\.current\)/);
assert.match(parentContext, /fetch\("\/api\/reports\/staff-messages\?role=parent"/);
assert.match(parentLayout, /<NotificationProvider>/);
assert.match(parentContext, /scope === "reports" \|\| scope === "staff-messages"/);
assert.match(parentContext, /if \(kind === "typing"\) return;/);

// Guidance (and other staff) commits an unread row, then signals that exact
// Parent account through the existing secure Supabase Broadcast channel.
assert.match(staffMessages, /recipient_type: "parent"/);
assert.match(staffMessages, /status: "unread"/);
assert.match(staffMessages, /\{ role: "parent", id: recipient\.parentId \}/);
assert.match(staffMessages, /scope: "staff-messages",\s*kind: "message",\s*conversationId: `staff-message:\$\{Number\(createdMessage\.id\)\}`,\s*messageId: Number\(createdMessage\.id\)/);

// A Parent dashboard preview retains the authoritative conversation key, so
// opening or marking it read updates the same staff_messages state as Reports.
assert.match(parentDashboard, /staffMessageConversationId\?: number/);
assert.match(parentDashboard, /staffMessageConversationId: notif\.staffMessageConversationId/);
assert.match(parentDashboard, /\{ staffMessageConversationId: notif\.staffMessageConversationId \}/);
assert.match(parentDashboard, /\/dashboard\/parent\/reports\?conversation=/);
assert.match(parentDashboard, /staffMessageConversationIds:/);

// The notification endpoint collapses all reply rows under their root
// conversation. The newest incoming row updates the one preview while the
// unread badge counts the conversation once, and a read acknowledgement still
// reaches every open Parent dashboard tab.
assert.match(parentNotifications, /\.from\("staff_messages"\)/);
assert.match(parentNotifications, /\.eq\("recipient_type", "parent"\)/);
assert.match(parentNotifications, /function collapseStaffMessageNotifications\(rows: StaffMessageNotification\[\]\)/);
assert.match(parentNotifications, /const conversationId = Number\(message\.source_message_id\) \|\| messageId/);
assert.match(parentNotifications, /latestMessage: isLater \? message : current\.latestMessage/);
assert.match(parentNotifications, /unread: current\.unread \|\| unread/);
assert.match(parentNotifications, /collapseStaffMessageNotifications\(staffMessageRows\)/);
assert.match(parentNotifications, /id: 1_500_000_000 \+ conversationId/);
assert.match(notificationFeed, /staffMessageConversationId\?: string \| number \| null/);
assert.match(notificationFeed, /return `staff-conversation:\$\{item\.staffMessageConversationId\}`/);
assert.match(parentNotifications, /staffMessageConversationIds/);
assert.match(parentNotifications, /publishRealtimeInvalidation\(\[\{ role: "parent", id: session\.id \}\], "staff-messages"\)/);

// Adviser, Guidance, and Principal New Message modals all persist their
// Parent messages through this one route, so the conversation grouping applies
// identically to each role instead of fixing only the Principal flow.
assert.match(adviserReports, /fetch\("\/api\/reports\/staff-messages"[\s\S]*?role: "adviser"/);
assert.match(guidanceReports, /fetch\("\/api\/reports\/staff-messages"[\s\S]*?role: "guidance"/);
assert.match(principalReports, /fetch\("\/api\/reports\/staff-messages"[\s\S]*?role: "principal"/);

// Opening a report keeps every active Parent sidebar consistent with the
// persisted read state rather than relying on the Reports page alone.
assert.match(reportRead, /publishRealtimeInvalidation\(\[\{ role: "parent", id: parent\.id \}\], "reports"\)/);

console.log("parent staff-message badge checks passed");
