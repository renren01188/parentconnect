/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const parentContext = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const staffMessages = read("src/app/api/reports/staff-messages/route.ts");

// The layout-level provider is present on every Parent page. A Realtime event
// received during an initial count request must produce one follow-up snapshot
// instead of leaving the sidebar at the count from before the message existed.
assert.match(parentContext, /notificationCountRefreshQueued/);
assert.match(parentContext, /reportCountRefreshQueued/);
assert.match(parentContext, /do \{[\s\S]*?fetch\("\/api\/parents\/notifications"[\s\S]*?\} while \(notificationCountRefreshQueued\.current\)/);
assert.match(parentContext, /fetch\("\/api\/reports\/staff-messages\?role=parent"/);
assert.match(parentContext, /scope === "notifications" \|\| scope === "announcements" \|\| scope === "staff-messages"/);

// Guidance (and other staff) commits an unread row, then signals that exact
// Parent account through the existing secure Supabase Broadcast channel.
assert.match(staffMessages, /recipient_type: "parent"/);
assert.match(staffMessages, /status: "unread"/);
assert.match(staffMessages, /\{ role: "parent", id: recipient\.parentId \}/);
assert.match(staffMessages, /\], "staff-messages"\);/);

// A Parent dashboard preview retains the authoritative conversation key, so
// opening or marking it read updates the same staff_messages state as Reports.
assert.match(parentDashboard, /staffMessageConversationId\?: number/);
assert.match(parentDashboard, /staffMessageConversationId: notif\.staffMessageConversationId/);
assert.match(parentDashboard, /\{ staffMessageConversationId: notif\.staffMessageConversationId \}/);
assert.match(parentDashboard, /\/dashboard\/parent\/reports\?conversation=/);
assert.match(parentDashboard, /staffMessageConversationIds:/);

// The notification endpoint counts these unread rows and broadcasts a read
// acknowledgement back to the Parent's open dashboard tabs.
assert.match(parentNotifications, /\.from\("staff_messages"\)/);
assert.match(parentNotifications, /\.eq\("recipient_type", "parent"\)/);
assert.match(parentNotifications, /staffMessageConversationIds/);
assert.match(parentNotifications, /publishRealtimeInvalidation\(\[\{ role: "parent", id: session\.id \}\], "staff-messages"\)/);

console.log("parent staff-message badge checks passed");
