const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const parentNotifications = read("src/app/api/parents/notifications/route.ts");
const parentDashboard = read("src/app/dashboard/parent/page.tsx");
const adviserAnnouncements = read("src/app/api/adviser/announcements/route.ts");
const guidanceAnnouncements = read("src/app/api/guidance/announcements/route.ts");
const ictDelivery = read("src/lib/ictAnnouncementDelivery.ts");
const principalDelivery = read("src/lib/deliverPrincipalAnnouncement.ts");

// The authorized Parent feed fetches every source's stored announcement and
// returns the saved title/message instead of generating a role placeholder.
for (const table of [
  "adviser_announcements",
  "guidance_announcements",
  "principal_announcements",
  "ict_announcements",
]) {
  assert.match(parentNotifications, new RegExp(`from\\("${table}"\\)`));
}
assert.match(parentNotifications, /const announcementTitle = String\(announcement\.title \?\? ""\)\.trim\(\)/);
assert.match(parentNotifications, /const announcementMessage = String\(announcement\.message \?\? ""\)\.trim\(\)/);
assert.match(parentNotifications, /title: announcementTitle/);
assert.match(parentNotifications, /msg: announcementMessage/);
assert.match(parentNotifications, /senderName,/);
assert.match(parentNotifications, /senderRole,/);
assert.doesNotMatch(parentNotifications, /title: "Announcement From " \+ senderRole/);

// The dashboard card shows announcements only and preserves their saved title,
// message, sender name, role, and time rather than mixing in messages.
assert.match(parentDashboard, /const \[announcements, setAnnouncements\]/);
assert.match(parentDashboard, /\.filter\(\(notif\) => typeof notif\.announcementId === "number"\)/);
assert.match(parentDashboard, /title: String\(notif\.announcementTitle \?\? notif\.title/);
assert.match(parentDashboard, /message: String\(notif\.msg \?\? ""\)/);
assert.match(parentDashboard, /announcement\.senderName/);
assert.match(parentDashboard, /announcement\.senderRole/);
assert.match(parentDashboard, /announcement\.message/);

// Every writer keeps Parent delivery restricted to its intended audience and
// uses durable, source-specific recipient rows.
assert.match(adviserAnnouncements, /\.eq\("grade", adviser\.grade\)[\s\S]*?\.in\("section", adviserSections\)/);
assert.match(adviserAnnouncements, /source: "adviser"/);
assert.match(guidanceAnnouncements, /if \(audience === "Parents" \|\| audience === "Both"\)/);
assert.match(guidanceAnnouncements, /source: "guidance"/);
assert.match(ictDelivery, /if \(!announcement\.audience\.includes\("Parents"\)\) return;/);
assert.match(ictDelivery, /source: "ict"/);
assert.match(principalDelivery, /if \(principalAudienceIncludesParents\(audience\)\)/);
assert.match(principalDelivery, /source: "principal"/);

console.log("parent dashboard announcement display checks passed");
