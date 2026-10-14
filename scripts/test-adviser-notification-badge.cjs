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

// Visiting Notifications must never acknowledge every item. Opening a single
// row is the only path that can decrement the shared sidebar badge.
assert.doesNotMatch(page, /markNotificationsSeen|mark_seen|clearNotifUnreadCount/);
assert.match(page, /void fetchNotifications\(\);/);
assert.match(page, /const marked = await markOne\(n\.id\);[\s\S]*?setViewNotif\(\{ \.\.\.n, read: marked \? true : n\.read \}\)/);
assert.match(page, /\$\{n\.read \? "bg-white hover:bg-slate-50" : "bg-emerald-50\/60 hover:bg-emerald-50"\}/);
assert.match(page, /const notification = notifications\.find\(n => n\.id === id\);[\s\S]*?markNotifRead\(\);/);

// adviser_notification_reads is the sole source of truth. The endpoint writes
// only the requested adviser/key pair, then refreshes that adviser's sessions.
assert.doesNotMatch(readRoute, /mark_seen|notifications_last_seen_at/);
assert.match(readRoute, /if \(typeof body\.notif_key === "string"[\s\S]*?from\("adviser_notification_reads"/);
assert.match(readRoute, /publishRealtimeInvalidation\(\[\{ role: "adviser", id: adviser\.id \}\], "notifications"\)/);
assert.match(notificationRoute, /read: readKeys\.has\(key\)/);
assert.match(notificationRoute, /const sidebarUnreadCount = unreadCount;/);

// Prevent an in-flight count response from restoring the pre-read badge after
// one announcement has been opened.
assert.match(context, /notificationBadgeVersionRef/);
assert.match(context, /const markNotifRead = useCallback/);
assert.match(context, /setNotifUnreadCountState\(\(count\) => Math\.max\(0, count - 1\)\)/);
assert.match(context, /badgeVersion === notificationBadgeVersionRef\.current/);
assert.match(context, /markNotifRead,/);

console.log("adviser notification badge checks passed");
