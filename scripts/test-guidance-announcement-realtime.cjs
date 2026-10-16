/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const creationRoute = read("src/app/api/guidance/announcements/route.ts");
const deletionRoute = read("src/app/api/guidance/announcements/[id]/route.ts");
const guidancePage = read("src/app/dashboard/guidance/announcements/page.tsx");
const parentContext = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentNotifications = read("src/app/dashboard/parent/notifications/page.tsx");
const notificationFeed = read("src/lib/notificationFeed.ts");
const adviserContext = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const adviserNotifications = read("src/app/dashboard/adviser/notifications/page.tsx");
const parentNotificationsRoute = read("src/app/api/parents/notifications/route.ts");
const adviserNotificationsRoute = read("src/app/api/adviser/notifications/route.ts");

// A Guidance publication stores durable Parent notification rows only for a
// Parent audience, then sends an opaque Supabase Realtime invalidation to the
// corresponding account roles before the response is returned.
assert.match(creationRoute, /if \(audience === "Parents" \|\| audience === "Both"\)[\s\S]*?parent_announcement_notifications/);
assert.match(creationRoute, /if \(audience === "Parents" \|\| audience === "Both"\) recipientRoles\.push\("parent"\)/);
assert.match(creationRoute, /if \(audience === "Class Advisers" \|\| audience === "Both"\) recipientRoles\.push\("adviser"\)/);
assert.match(creationRoute, /await publishRealtimeInvalidation\(recipients, "announcements"\)/);

// Deleting a published Guidance announcement removes its durable Parent
// notification rows and invalidates only the recipient roles selected by its
// original audience. Scheduled announcements have not been delivered, so they
// notify Guidance only.
assert.match(deletionRoute, /select\("id, title, audience, status"\)/);
assert.match(deletionRoute, /parent_announcement_notifications[\s\S]*?\.eq\("source", "guidance"\)[\s\S]*?\.eq\("announcement_id", id\)/);
assert.match(deletionRoute, /announcement\.status === "Published" && \(audience === "Parents" \|\| audience === "Both"\)/);
assert.match(deletionRoute, /announcement\.status === "Published" && \(audience === "Class Advisers" \|\| audience === "Both"\)/);
assert.match(deletionRoute, /await publishRealtimeInvalidation\(recipients, "announcements"\)/);

// The same one-account channel is consumed by the Guidance source list and
// the Parent/Adviser notification UIs, with no router or full-page refresh.
assert.match(guidancePage, /Promise\.all\(\[loadMyAnnouncements\(\), loadIncomingAnnouncements\(\)\]\)/);
assert.match(guidancePage, /fontFamily: '\"DM Sans\", \"Segoe UI\", system-ui, sans-serif'/);
assert.match(parentContext, /scope === "reports" \|\| scope === "staff-messages"/);
assert.match(parentContext, /scope === "notifications" \|\| scope === "announcements" \|\| scope === "attendance"/);
assert.match(parentNotifications, /notificationRefreshVersion/);
assert.match(parentNotifications, /mergeNotificationFeed\(current, snapshot, \{ removeMissing: true \}\)/);
assert.match(notificationFeed, /removeMissing = false/);
assert.match(adviserContext, /scope === "notifications" \|\| scope === "announcements"/);
assert.match(adviserNotifications, /adviser-notifications-changed/);

// Recipient APIs are also audience-filtered, which prevents a refresh from
// exposing an announcement to an excluded audience.
assert.match(parentNotificationsRoute, /\.in\("audience", \["Parents", "Both"\]\)/);
assert.match(adviserNotificationsRoute, /\.in\("audience", \["Class Advisers", "Both"\]\)/);

console.log("guidance announcement realtime checks passed");
