/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const schedule = read("src/lib/announcementSchedule.ts");
const processor = read("src/lib/processScheduledAnnouncements.ts");
const cronRoute = read("src/app/api/scheduled-deletions/process/route.ts");
const vercelConfig = read("vercel.json");
const ictPost = read("src/app/api/ict/announcements/route.ts");
const ictPatch = read("src/app/api/ict/announcements/[id]/route.ts");
const guidancePost = read("src/app/api/guidance/announcements/route.ts");
const guidancePatch = read("src/app/api/guidance/announcements/[id]/route.ts");
const principalPost = read("src/app/api/principal/announcements/route.ts");
const principalPatch = read("src/app/api/principal/announcements/[id]/route.ts");
const ictPage = read("src/app/dashboard/ict/Announcements/page.tsx");
const guidancePage = read("src/app/dashboard/guidance/announcements/page.tsx");
const principalPage = read("src/app/dashboard/principal/announcements/page.tsx");

// Scheduling is optional, blank input is immediate, and chosen dates are
// normalized to Manila midnight before they are stored.
assert.match(schedule, /value === null \|\| value === undefined/);
assert.match(schedule, /scheduledAt: null/);
assert.match(schedule, /\$\{day\}T00:00:00\+08:00/);
assert.match(schedule, /isDueAnnouncementSchedule/);
assert.match(schedule, /normalizeOptionalAnnouncementScheduleDateTime/);

for (const route of [ictPost, ictPatch, guidancePost, guidancePatch, principalPost, principalPatch]) {
  assert.match(route, /normalizeOptionalAnnouncementSchedule/);
}

// The worker handles every source, claims rows only from Scheduled to
// Published, then invokes the existing delivery and Realtime mechanisms.
assert.match(processor, /processIctAnnouncements/);
assert.match(processor, /processGuidanceAnnouncements/);
assert.match(processor, /processPrincipalAnnouncements/);
assert.match(processor, /\.eq\("status", "Scheduled"\)/);
assert.match(processor, /\.update\(\{ status: "Published" \}\)/);
assert.match(processor, /deliverIctAnnouncement/);
assert.match(processor, /deliverGuidanceAnnouncement/);
assert.match(processor, /deliverPrincipalAnnouncement/);
assert.match(processor, /publishRealtimeInvalidation\(recipients, "announcements"\)/);
assert.match(cronRoute, /processDueScheduledAnnouncements\(\)/);
assert.match(vercelConfig, /"schedule": "\*\/5 \* \* \* \*"/);

// Each compose form communicates the same urgent-now versus scheduled-later
// option, including the ICT page that previously made the path unclear.
for (const page of [ictPage, guidancePage, principalPage]) {
  assert.match(page, /leave this blank to publish an urgent announcement now/);
}

console.log("announcement schedule checks passed");
