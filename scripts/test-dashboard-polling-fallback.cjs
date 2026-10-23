/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

for (const relative of [
  "src/app/dashboard/adviser/context/NotificationContext.tsx",
  "src/app/dashboard/guidance/context/NotificationContext.tsx",
]) {
  const source = read(relative);

  // Realtime remains the first update path. The timer is only a recovery
  // check for a missed browser subscription event.
  assert.match(source, /useSessionInvalidation/);
  assert.match(source, /SIDEBAR_FALLBACK_REFRESH_MS = 600_000/);
  assert.match(source, /RETURN_TO_TAB_REFRESH_COOLDOWN_MS = 15_000/);
  assert.match(source, /now - lastFallbackRefreshAt < RETURN_TO_TAB_REFRESH_COOLDOWN_MS/);
  assert.match(source, /window\.setInterval\(refreshWhenVisible, SIDEBAR_FALLBACK_REFRESH_MS\)/);
  assert.doesNotMatch(source, /window\.setInterval\(refreshWhenVisible, 300_000\)/);
}

const adviser = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
assert.match(adviser, /window\.addEventListener\("focus", refreshWhenVisible\)/);
assert.match(adviser, /window\.dispatchEvent\(new Event\("adviser-notifications-changed"\)\)/);
assert.match(adviser, /\/api\/adviser\/dashboard-summary/);
assert.match(adviser, /Promise\.all\(\[loadDashboardSummary\(\), loadNotifCount\(\)\]\)/);

const guidance = read("src/app/dashboard/guidance/context/NotificationContext.tsx");
assert.match(guidance, /\/api\/guidance\/dashboard-summary/);
assert.match(guidance, /refreshDashboardSummary\(\);[\s\S]*?refreshNotificationCounts\(\);/);

const adviserSummary = read("src/app/api/adviser/dashboard-summary/route.ts");
assert.match(adviserSummary, /getAdviserFromToken/);
assert.match(adviserSummary, /reportsUnreadCount/);
assert.match(adviserSummary, /ictUnreadCount/);
assert.match(adviserSummary, /transferUnreadCount/);
assert.match(adviserSummary, /listMessageSummaries/);

const guidanceSummary = read("src/app/api/guidance/dashboard-summary/route.ts");
assert.match(guidanceSummary, /getGuidanceSession/);
assert.match(guidanceSummary, /reportsUnreadCount/);
assert.match(guidanceSummary, /escalatedCount/);
assert.match(guidanceSummary, /ictUnreadCount/);
assert.match(guidanceSummary, /listGuidanceTickets/);

console.log("Dashboard sidebar fallback polling safeguards passed.");
