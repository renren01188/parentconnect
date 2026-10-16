/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const parentLayout = read("src/app/dashboard/parent/layout.tsx");
const parentNotifications = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentNotificationsPage = read("src/app/dashboard/parent/notifications/page.tsx");
const parentNotificationsRoute = read("src/app/api/parents/notifications/route.ts");
const adviserAnnouncements = read("src/app/api/adviser/announcements/route.ts");

assert.match(parentLayout, /<NotificationProvider>/, "The Parent layout must mount its shared notification provider on every dashboard route.");
assert.match(parentNotifications, /useSessionInvalidation/, "The Parent sidebar counts must use the shared Realtime subscription.");
assert.match(parentNotifications, /scope === "reports" \|\| scope === "staff-messages"/);
assert.match(parentNotifications, /scope === "notifications" \|\| scope === "announcements" \|\| scope === "attendance"/);
assert.match(parentNotifications, /refreshUnreadReportsCount\(\)\.catch/);
assert.match(parentNotifications, /refreshNotificationFeed\(\)\.catch/);
assert.match(parentNotificationsPage, /notificationRefreshVersion/, "The visible notification feed must reload after the layout receives a live invalidation.");
assert.match(parentNotificationsPage, /loadNotifications\(\)/);
assert.match(parentNotificationsRoute, /publishRealtimeInvalidation\(\[\{ role: "parent", id: session\.id \}\], "notifications"\)/, "Read state must synchronize across Parent tabs.");
assert.match(adviserAnnouncements, /parent_announcement_notifications/, "Adviser announcements must create durable Parent notification rows.");
assert.match(adviserAnnouncements, /publishRealtimeInvalidation\(realtimeRecipients, "announcements"\)/, "Adviser announcements must wake target Parent dashboards.");

console.log("Parent notification Realtime coverage checks passed.");
