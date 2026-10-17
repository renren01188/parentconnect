/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const ictAudience = read("src/lib/ictAnnouncementAudience.ts");
const principalAudience = read("src/lib/principalAnnouncementAudience.ts");
const ictPage = read("src/app/dashboard/ict/Announcements/page.tsx");
const principalPage = read("src/app/dashboard/principal/announcements/page.tsx");
const ictRoute = read("src/app/api/ict/announcements/route.ts");
const ictDelivery = read("src/lib/deliverIctAnnouncement.ts");
const guidanceRoute = read("src/app/api/guidance/announcements/route.ts");
const guidanceMutationRoute = read("src/app/api/guidance/announcements/[id]/route.ts");
const scheduledAnnouncements = read("src/lib/processScheduledAnnouncements.ts");
const guidanceIncoming = read("src/app/api/guidance/principal-announcements/route.ts");
const ictIncoming = read("src/app/api/ict/principal-announcements/route.ts");
const adviserNotifications = read("src/app/api/adviser/notifications/route.ts");
const migration = read("supabase/migrations/20261017130000_allow_ict_parent_announcement_notifications.sql");

// ICT exposes the requested choices, stores the existing canonical adviser
// value, and expands Everyone to all four recipient roles.
for (const label of ["Parents Only", "Advisers Only", "Guidance Only", "Principal Only", "Everyone"]) {
  assert.match(ictPage, new RegExp(label));
}
assert.match(ictAudience, /audience\.length === 1 && audience\[0\] === "Everyone"/);
assert.match(ictAudience, /return \[\.\.\.ICT_ANNOUNCEMENT_RECIPIENTS\]/);
assert.match(ictAudience, /entry === "Advisers" \? "Class Advisers"/);

// Principal exposes only the requested new audiences, and the common mapper
// directs each of them to exactly its authorized role.
for (const value of ["Everyone", "Parents", "Class Advisers", "Guidance", "ICT"]) {
  assert.match(principalPage, new RegExp(`<option value="${value}">`));
}
for (const audience of ["Class Advisers", "Guidance", "ICT"]) {
  assert.ok(principalAudience.includes(`| "${audience}"`));
}
assert.match(guidanceIncoming, /\.in\("audience", \["Everyone", "Guidance"\]\)/);
assert.match(ictIncoming, /\.in\("audience", \["Everyone", "ICT", "Advisers"\]\)/);
assert.match(adviserNotifications, /\.in\("audience", \["Everyone", "Class Advisers", "Advisers"\]\)/);

// Guidance has no Principal audience. Immediate, edit, delete, and scheduled
// paths therefore only invalidate the selected Parent and/or Adviser roles.
assert.doesNotMatch(guidanceRoute, /recipientRoles: RealtimeRecipientRole\[\] = \["principal"\]/);
assert.doesNotMatch(guidanceMutationRoute, /roles\.add\("principal"\)/);
assert.doesNotMatch(scheduledAnnouncements, /const roles: RealtimeRecipientRole\[\] = \["principal"\]/);

// ICT now uses the shared delivery helper. It does not write ICT IDs into the
// legacy adviser_notifications table, and failures after the source record is
// saved return an actionable, retry-safe response.
assert.match(ictRoute, /await deliverIctAnnouncement\(ann, senderName\)/);
assert.match(ictRoute, /announcementWasCreated/);
assert.match(ictRoute, /Refresh My Announcements before retrying/);
assert.doesNotMatch(ictDelivery, /\.from\("adviser_notifications"\)/);
assert.match(migration, /'ict'::text/);

console.log("announcement audience selection checks passed");
