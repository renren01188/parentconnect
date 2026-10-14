/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = read("src/app/dashboard/adviser/notifications/page.tsx");
const context = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const readRoute = read("src/app/api/adviser/notifications/read/route.ts");
const notificationRoute = read("src/app/api/adviser/notifications/route.ts");

// The page acknowledgement is intentionally distinct from an individual read.
assert.match(page, /clearNotifUnreadCount\(\)/);
assert.match(page, /body: JSON\.stringify\(\{ mark_seen: true \}\)/);
assert.match(
  page,
  /await markNotificationsSeen\(\)\.catch\(\(\) => null\);[\s\S]*?await fetchNotifications\(\);/,
  "The page-view marker must finish before the list re-reads the authoritative badge count.",
);
assert.match(page, /const marked = await markOne\(n\.id\);[\s\S]*?setViewNotif\(\{ \.\.\.n, read: marked \? true : n\.read \}\)/);
assert.match(page, /\$\{n\.read \? "bg-white hover:bg-slate-50" : "bg-emerald-50\/60 hover:bg-emerald-50"\}/);

// The endpoint updates only the page-view cursor in the mark_seen branch;
// adviser_notification_reads remains the per-notification read source.
const markSeenBlock = readRoute.slice(
  readRoute.indexOf("if (body.mark_seen === true)"),
  readRoute.indexOf("if (body.mark_all"),
);
assert.match(markSeenBlock, /from\("advisers"\)[\s\S]*?notifications_last_seen_at/);
assert.doesNotMatch(markSeenBlock, /adviser_notification_reads/);
assert.match(readRoute, /if \(typeof body\.notif_key === "string"[\s\S]*?from\("adviser_notification_reads"/);
assert.match(notificationRoute, /read: readKeys\.has\(key\)/);
assert.match(notificationRoute, /sidebarUnreadCount = retainedNotifications\.filter/);

// Prevent an in-flight pre-open count response from restoring the cleared
// sidebar badge after the adviser has opened Notifications.
assert.match(context, /notificationBadgeVersionRef/);
assert.match(context, /const clearNotifUnreadCount = useCallback/);
assert.match(context, /badgeVersion === notificationBadgeVersionRef\.current/);
assert.match(context, /clearNotifUnreadCount,/);

console.log("adviser notification badge checks passed");
