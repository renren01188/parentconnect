/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261021150000_add_guidance_report_favorites.sql");
const route = read("src/app/api/reports/guidance/favorites/route.ts");
const page = read("src/app/dashboard/guidance/reports/page.tsx");

// Preferences are per Guidance account and can never mutate the shared report
// state/read/escalation records. Cascades prevent an obsolete favorite when
// either referenced record is removed.
assert.match(migration, /guidance_id bigint NOT NULL[\s\S]*?REFERENCES public\.guidance_counselors\(id\) ON DELETE CASCADE/);
assert.match(migration, /report_id bigint NOT NULL[\s\S]*?REFERENCES public\.parent_adviser_reports\(id\) ON DELETE CASCADE/);
assert.match(migration, /PRIMARY KEY \(guidance_id, report_id\)/);
const favoriteTableDefinition = migration.match(/CREATE TABLE[\s\S]*?\n\);/)?.[0] ?? "";
assert.doesNotMatch(favoriteTableDefinition, /\b(status|guidance_seen_at|escalated_to_guidance)\b/);

// Server operations are tied to the authenticated counselor and reuse the
// accepted-ticket assignment boundary already used by the Guidance feed.
assert.match(route, /getGuidanceSession/);
assert.match(route, /\.eq\("guidance_id", guidance\.id\)/);
assert.match(route, /listGuidanceTickets\(\[reportId\], false\)/);
assert.match(route, /assignedGuidanceId !== guidanceId/);
assert.match(route, /onConflict: "guidance_id,report_id"/);
assert.match(route, /\.delete\(\)[\s\S]*?\.eq\("guidance_id", guidance\.id\)[\s\S]*?\.eq\("report_id", reportId\)/);
assert.doesNotMatch(route, /parent_adviser_reports"\)[\s\S]{0,250}\.update\(/);

// The report-card action has an accessible star control, and only the derived
// ordering changes. The existing report data remains the source of unread and
// escalation counts.
assert.match(page, /Star,/);
assert.match(page, /aria-label=\{isFavorite \? "Remove report from favorites" : "Add report to favorites"\}/);
assert.match(page, /favoriteFirstReport\(favoriteReportIds\)/);
assert.match(page, /groupHasFavorite\(b, favoriteReportIds\)/);
assert.match(page, /method: "PATCH"[\s\S]*?reportId, favorite: !wasFavorite/);
assert.match(page, /favoriteSaveInFlightRef\.current\.has\(reportId\)/);
assert.match(page, /const unreadReportCount = reports\.filter/);

const newestFirst = (a, b) => b.activity - a.activity || b.id - a.id;
const favoriteFirst = (favorites) => (a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || newestFirst(a, b);
const reports = [
  { id: 1, activity: 100 },
  { id: 2, activity: 200 },
  { id: 3, activity: 300 },
];
const favorites = new Set([1]);
assert.deepEqual([...reports].sort(favoriteFirst(favorites)).map((report) => report.id), [1, 3, 2], "favorite remains above newer normal reports");
assert.deepEqual([...reports, { id: 4, activity: 400 }].sort(favoriteFirst(favorites)).map((report) => report.id), [1, 4, 3, 2], "new arrivals do not displace a favorite");
favorites.delete(1);
assert.deepEqual([...reports, { id: 4, activity: 400 }].sort(favoriteFirst(favorites)).map((report) => report.id), [4, 3, 2, 1], "unfavoriting restores the normal newest-first order");

console.log("Guidance report favorite checks passed.");
