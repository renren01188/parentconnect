const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const notificationsRoute = read("src/app/api/principal/notifications/route.ts");
const readRoute = read("src/app/api/principal/notifications/read/route.ts");
const context = read("src/app/dashboard/principal/context/NotificationContext.tsx");
const sidebar = read("src/app/dashboard/principal/components/Sidebar.tsx");
const notificationsPage = read("src/app/dashboard/principal/notifications/page.tsx");

assert.match(
  notificationsRoute,
  /const reportUnreadCount = reports\.filter\(/,
  "Reports must retain their independent unread calculation",
);
assert.match(
  notificationsRoute,
  /const unreadCount = notifications\.filter\(\(notification\) => !notification\.read\)\.length/,
  "Notifications must count unread notification cards, not unread reports",
);
assert.doesNotMatch(
  notificationsRoute,
  /const unreadCount = reportUnreadCount/,
  "Reading notification cards must not be coupled to the Reports badge",
);
assert.match(readRoute, /principal_notification_reads/);
assert.match(readRoute, /publishRealtimeInvalidation\(\[\{ role: "principal", id: principal\.id \}\], "notifications"\)/);
assert.match(context, /setReportCount\(Number\(data\?\.reportUnreadCount \?\? 0\)\)/);
assert.match(context, /setPrincipalNotifCount\(Number\(data\?\.unreadCount \?\? 0\)\)/);
assert.match(sidebar, /reports: reportCount \+ adviserMessageCount,[\s\S]*?notifications: principalNotifCount/);
assert.match(notificationsPage, /await refreshCounts\(\)/);

console.log("Principal report and notification read-state checks passed.");
