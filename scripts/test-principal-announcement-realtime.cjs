/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const audience = read("src/lib/principalAnnouncementAudience.ts");
const creationRoute = read("src/app/api/principal/announcements/route.ts");
const mutationRoute = read("src/app/api/principal/announcements/[id]/route.ts");
const parentContext = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentNotifications = read("src/app/dashboard/parent/notifications/page.tsx");
const parentNotificationsRoute = read("src/app/api/parents/notifications/route.ts");
const adviserContext = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const adviserNotifications = read("src/app/dashboard/adviser/notifications/page.tsx");
const adviserNotificationsRoute = read("src/app/api/adviser/notifications/route.ts");

// The audience mapping is shared by publication, edits, and deletion, so a
// Parent-only announcement never invalidates Adviser clients and vice versa.
assert.match(audience, /function principalAnnouncementRecipientRoles/);
assert.match(audience, /return \["parent", "adviser", "guidance", "ict"\] as const/);
assert.match(audience, /return \["adviser", "ict"\] as const/);
assert.match(audience, /return \["parent"\] as const/);
assert.match(creationRoute, /principalAnnouncementRecipientRoles\(audience\)/);
assert.match(creationRoute, /await publishRealtimeInvalidation\(recipients, "announcements"\)/);

// A delete removes durable Parent rows and broadcasts to the announcement's
// original published audience. An edit invalidates both its old and new
// audience, which also prevents stale cards after an audience change.
assert.match(mutationRoute, /select\("id, audience, status"\)/);
assert.match(mutationRoute, /parent_announcement_notifications[\s\S]*?\.eq\("source", "principal"\)[\s\S]*?\.eq\("announcement_id", Number\(id\)\)/);
assert.match(mutationRoute, /const affectedRoles: RealtimeRecipientRole\[\]/);
assert.match(mutationRoute, /const deletedAudience = normalizePrincipalAnnouncementAudience\(announcement\.audience\)/);
assert.match(mutationRoute, /await publishRealtimeInvalidation\(recipients, "announcements"\)/);

// Both notification pages already consume the one-account Realtime channel.
// Parent uses a complete server snapshot, so a deleted item is pruned instead
// of being retained by an optimistic merge.
assert.match(parentContext, /scope === "reports" \|\| scope === "staff-messages"/);
assert.match(parentContext, /scope === "notifications" \|\| scope === "announcements" \|\| scope === "attendance"/);
assert.match(parentNotifications, /mergeNotificationFeed\(current, snapshot, \{ removeMissing: true \}\)/);
assert.match(parentNotificationsRoute, /PRINCIPAL_PARENT_AUDIENCE_VALUES/);
assert.match(adviserContext, /scope === "notifications" \|\| scope === "announcements"/);
assert.match(adviserContext, /adviser-notifications-changed/);
assert.match(adviserNotifications, /adviser-notifications-changed/);
assert.match(adviserNotificationsRoute, /\.in\("audience", \["Everyone", "Advisers"\]\)/);

console.log("principal announcement realtime checks passed");
