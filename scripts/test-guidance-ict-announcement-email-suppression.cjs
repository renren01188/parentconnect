/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const ictPost = read("src/app/api/ict/announcements/route.ts");
const ictPatch = read("src/app/api/ict/announcements/[id]/route.ts");
const ictDelivery = read("src/lib/deliverIctAnnouncement.ts");
const guidancePost = read("src/app/api/guidance/announcements/route.ts");
const guidancePatch = read("src/app/api/guidance/announcements/[id]/route.ts");
const guidanceDelivery = read("src/lib/deliverGuidanceAnnouncement.ts");
const scheduledAnnouncements = read("src/lib/processScheduledAnnouncements.ts");

// Immediate, edited, and scheduled publications all use the two shared
// in-app delivery helpers. Neither source may import or invoke its mailer.
for (const source of [ictPost, ictPatch, ictDelivery, guidancePost, guidancePatch, guidanceDelivery]) {
  assert.doesNotMatch(source, /send(?:Ict|Guidance)AnnouncementEmail/);
  assert.doesNotMatch(source, /from\("@\/lib\/mailer"\)/);
}

assert.match(ictPost, /await deliverIctAnnouncement\(ann, senderName\)/);
assert.match(ictPatch, /await deliverIctAnnouncement\(ann, ictName\(ict\)\)/);
assert.match(ictDelivery, /await syncIctParentAnnouncementRecipients\(announcement, senderName\)/);
assert.match(guidancePost, /await deliverGuidanceAnnouncement\(ann, audience\)/);
assert.match(guidancePatch, /await deliverGuidanceAnnouncement\(data, nextAudience\)/);
assert.match(guidanceDelivery, /parent_announcement_notifications/);
assert.match(guidanceDelivery, /\.upsert\(rows, \{ onConflict: "source,announcement_id,parent_id" \}\)/);

// Scheduled publications share the same helpers, so they cannot introduce a
// separate email path. Realtime invalidation remains after delivery.
assert.match(scheduledAnnouncements, /await deliverIctAnnouncement/);
assert.match(scheduledAnnouncements, /await deliverGuidanceAnnouncement/);
assert.match(scheduledAnnouncements, /await publishRealtimeInvalidation\(recipients, "announcements"\)/);

console.log("guidance and ICT announcement email suppression checks passed");
