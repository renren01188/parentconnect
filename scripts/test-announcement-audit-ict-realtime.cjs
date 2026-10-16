/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const auditWriter = read("src/lib/audit.ts");
const auditHelper = read("src/lib/announcementAudit.ts");
const auditFilters = read("src/lib/audit-filter-options.ts");
const adviserRoute = read("src/app/api/adviser/announcements/route.ts");
const guidanceRoute = read("src/app/api/guidance/announcements/route.ts");
const guidanceMutationRoute = read("src/app/api/guidance/announcements/[id]/route.ts");
const principalRoute = read("src/app/api/principal/announcements/route.ts");
const principalMutationRoute = read("src/app/api/principal/announcements/[id]/route.ts");
const ictRoute = read("src/app/api/ict/announcements/route.ts");
const ictMutationRoute = read("src/app/api/ict/announcements/[id]/route.ts");
const ictAudience = read("src/lib/ictAnnouncementAudience.ts");
const ictDelivery = read("src/lib/ictAnnouncementDelivery.ts");
const parentContext = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentNotifications = read("src/app/dashboard/parent/notifications/page.tsx");
const parentNotificationsRoute = read("src/app/api/parents/notifications/route.ts");
const adviserContext = read("src/app/dashboard/adviser/context/NotificationContext.tsx");

// All writers call the one helper, which gives the two audit trails uniform
// action, actor role, target, and database-assigned created_at timestamp.
for (const route of [
  adviserRoute,
  guidanceRoute,
  guidanceMutationRoute,
  principalRoute,
  principalMutationRoute,
  ictRoute,
  ictMutationRoute,
]) {
  assert.match(route, /logAnnouncementAudit/);
}
assert.match(auditHelper, /action: `Announcement \$\{action\}`/);
assert.match(auditHelper, /performedByRole: actor\.role/);
assert.match(auditHelper, /module: "Announcements"/);
assert.match(auditWriter, /recipientsForRoles\(\["ict", "principal"\]\)/);
assert.match(auditWriter, /publishRealtimeInvalidation\(recipients, "audit"\)/);
for (const action of ["Published", "Scheduled", "Updated", "Deleted"]) {
  assert.match(auditFilters, new RegExp(`Announcement ${action}`));
}
for (const role of ["ict", "principal"]) {
  const auditPage = read(`src/app/dashboard/${role}/audit-trail/page.tsx`);
  assert.match(auditPage, /event\.scope === "audit"/);
}

// ICT permits only the four established audience values. The same mapping is
// shared by publication, edits, and deletion, preventing an excluded role
// from receiving a Realtime invalidation.
assert.match(ictAudience, /"Parents",[\s\S]*"Class Advisers",[\s\S]*"Guidance",[\s\S]*"Principal"/);
assert.match(ictAudience, /function normalizeIctAnnouncementAudience/);
assert.match(ictAudience, /function ictAnnouncementRecipientRoles/);
assert.match(ictRoute, /normalizeIctAnnouncementAudience\(rawAudience\)/);
assert.match(ictRoute, /ictAnnouncementRecipientRoles\(audience\)/);
assert.match(ictRoute, /await publishRealtimeInvalidation\(recipients, "announcements"\)/);

// Parent delivery remains per-recipient and durable. Editing an ICT
// announcement refreshes both the prior and new audiences; deletion removes
// its durable rows before invalidating only its original published audience.
assert.match(ictDelivery, /parent_announcement_notifications/);
assert.match(ictDelivery, /onConflict: "source,announcement_id,parent_id"/);
assert.match(ictMutationRoute, /previousAudience = normalizeIctAnnouncementAudience\(existing\.audience\)/);
assert.match(ictMutationRoute, /syncIctParentAnnouncementRecipients\(ann, ictName\(ict\)\)/);
assert.match(ictMutationRoute, /\.eq\("source", "ict"\)[\s\S]*?\.eq\("announcement_id", ann\.id\)/);
assert.match(ictMutationRoute, /\.eq\("source", "ict"\)[\s\S]*?\.eq\("announcement_id", announcementId\)/);
assert.match(ictMutationRoute, /await publishRealtimeInvalidation\(recipients, "announcements"\)/);

// Recipient pages already subscribe to the opaque per-account announcement
// invalidation, and Parent prunes deleted records from its complete API feed.
assert.match(parentContext, /scope === "reports" \|\| scope === "staff-messages"/);
assert.match(parentContext, /scope === "notifications" \|\| scope === "announcements" \|\| scope === "attendance"/);
assert.match(parentNotifications, /mergeNotificationFeed\(current, snapshot, \{ removeMissing: true \}\)/);
assert.match(parentNotificationsRoute, /ict_announcements[\s\S]*?\.contains\("audience", \["Parents"\]\)/);
assert.match(adviserContext, /scope === "notifications" \|\| scope === "announcements"/);

console.log("announcement audit and ICT Realtime checks passed");
