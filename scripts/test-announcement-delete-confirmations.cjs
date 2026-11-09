/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const confirmationModal = read("src/components/AnnouncementDeleteConfirmationModal.tsx");
const adviserPage = read("src/app/dashboard/adviser/notifications/page.tsx");
const guidancePage = read("src/app/dashboard/guidance/announcements/page.tsx");
const ictPage = read("src/app/dashboard/ict/Announcements/page.tsx");
const principalPage = read("src/app/dashboard/principal/announcements/page.tsx");

// The shared confirmation requires an explicit confirmation action, supports
// cancelling with Escape/backdrop, and distinguishes scheduled cancellation.
assert.match(confirmationModal, /Delete announcement\?/);
assert.match(confirmationModal, /Cancel delivery/);
assert.match(confirmationModal, /event\.key === "Escape"/);
assert.match(confirmationModal, /onClick=\{\(\) => \{/);
assert.match(confirmationModal, /if \(!deleting\) onCancel\(\)/);

const rolePages = [
  ["adviser", adviserPage],
  ["guidance", guidancePage],
  ["ict", ictPage],
  ["principal", principalPage],
];

for (const [role, page] of rolePages) {
  assert.match(page, /AnnouncementDeleteConfirmationModal/);
  assert.match(page, new RegExp(`theme="${role}"`));
  assert.match(page, /deleteTarget/);
  assert.match(page, /deleting/);
}

// Guidance, ICT, and Principal delete only in their confirmation handlers;
// their trash buttons now select a target instead of sending DELETE directly.
for (const [role, page, route] of [
  ["guidance", guidancePage, "/api/guidance/announcements/"],
  ["ict", ictPage, "/api/ict/announcements/"],
  ["principal", principalPage, "/api/principal/announcements/"],
]) {
  assert.match(page, /const requestDelete = \(announcement: Announcement\)/);
  assert.match(page, /const confirmDelete = async \(\) => \{/);
  const expectedDelete = "fetch(`" + route + "${deleteTarget.id}`, { method: \"DELETE\" })";
  assert.ok(page.includes(expectedDelete), `${role} must delete the selected confirmation target`);
  assert.doesNotMatch(page, /onClick=\{\(\) => handleDelete\(/, `${role} trash button must not delete directly`);
}

console.log("announcement delete confirmation checks passed");
