/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const layout = read("src/app/dashboard/principal/layout.tsx");
const sidebar = read("src/app/dashboard/principal/components/Sidebar.tsx");
const context = read("src/app/dashboard/principal/context/NotificationContext.tsx");
const bell = read("src/app/dashboard/principal/components/PrincipalNotificationBell.tsx");
const dashboard = read("src/app/dashboard/principal/page.tsx");
const notificationPage = read("src/app/dashboard/principal/notifications/page.tsx");
const readRoute = read("src/app/api/principal/notifications/read/route.ts");

// The Principal home dashboard is the only entry point for the bell. Other
// Principal routes don't render a duplicate desktop or mobile notification UI.
assert.doesNotMatch(layout, /PrincipalNotificationBell/);
assert.doesNotMatch(sidebar, /label: "Notifications"/);

// On the dashboard, the bell belongs immediately before the date control,
// including when the header wraps on a small screen.
assert.match(dashboard, /import PrincipalNotificationBell/);
assert.match(dashboard, /className="pd-header-actions"/);
assert.match(dashboard, /<PrincipalNotificationBell \/>[\s\S]*className="pd-date-chip"/);

// The context consumes the existing API and its data-free Realtime
// invalidations once, then exposes the same deduplicated feed to both views.
assert.match(context, /fetchJsonWithRetry<PrincipalNotificationsResponse>\("\/api\/principal\/notifications"/);
assert.match(context, /mergeNotificationFeed\(current, snapshot\)/);
assert.match(context, /scope === "reports" \|\| scope === "notifications" \|\| scope === "announcements"/);
assert.match(context, /markNotificationsRead/);
assert.match(readRoute, /principal_notification_reads/);

// The bell uses a dot-only unread indicator, opens newest-first rows from the
// shared feed, retains Mark All Read, and deep-links to an existing report.
assert.match(bell, /const latestNotifications = notifications\.slice\(0, PANEL_ITEM_LIMIT\)/);
assert.match(bell, /hasUnreadNotifications && <span aria-hidden="true" className="absolute/);
assert.match(bell, /bg-red-500/);
assert.doesNotMatch(bell, /99\+|unreadCount.*badge/);
assert.match(bell, /markAllNotificationsRead\(\)/);
assert.match(bell, /markNotificationsRead\(\[notification\]\)/);
assert.match(bell, /router\.push\(`\/dashboard\/principal\/reports\?reportId=\$\{notification\.reportId\}`\)/);
assert.match(bell, /w-\[min\(24rem,calc\(100vw-2rem\)\)\]/);
assert.match(bell, /max-h-\[min\(65dvh,28rem\)\]/);

// The direct route remains available but is a presentation of the shared
// provider feed; it must not start a competing notification subscription.
assert.match(notificationPage, /notifications: items/);
assert.match(notificationPage, /markAllNotificationsRead/);
assert.doesNotMatch(notificationPage, /useSessionInvalidation|useVisibleRefresh|mergeNotificationFeed/);

console.log("Principal notification bell checks passed.");
