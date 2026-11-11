/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/legacy-migrations/20261105130000_add_adviser_principal_report_favorites.sql");
const adviserRoute = read("src/app/api/reports/adviser/favorites/route.ts");
const principalRoute = read("src/app/api/reports/principal/favorites/route.ts");
const adviserPage = read("src/app/dashboard/adviser/reports/page.tsx");
const principalPage = read("src/app/dashboard/principal/reports/page.tsx");

for (const [table, ownerColumn, ownerTable] of [
  ["adviser_report_favorites", "adviser_id", "advisers"],
  ["principal_report_favorites", "principal_id", "principals"],
]) {
  const definition = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}[\\s\\S]*?\\n\\);`))?.[0] ?? "";
  assert.match(definition, new RegExp(`${ownerColumn} (?:integer|bigint) NOT NULL[\\s\\S]*?REFERENCES public\\.${ownerTable}\\(id\\) ON DELETE CASCADE`));
  assert.match(definition, /report_id bigint NOT NULL[\s\S]*?REFERENCES public\.parent_adviser_reports\(id\) ON DELETE CASCADE/);
  assert.match(definition, new RegExp(`PRIMARY KEY \\(${ownerColumn}, report_id\\)`));
  assert.doesNotMatch(definition, /\b(status|read|escalated|resolved_by_role)\b/);
  assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
}

// Mutations are scoped to the authenticated role. Principal favorites reuse
// the established visibility boundary, including the parent-agreement rule.
assert.match(adviserRoute, /getAdviserSession/);
assert.match(adviserRoute, /\.eq\("adviser_id", adviser\.id\)/);
assert.match(adviserRoute, /\.eq\("adviser_id", adviserId\)/);
assert.match(adviserRoute, /onConflict: "adviser_id,report_id"/);
assert.doesNotMatch(adviserRoute, /parent_adviser_reports"\)[\s\S]{0,250}\.update\(/);
assert.match(principalRoute, /getPrincipalSession/);
assert.match(principalRoute, /isPrincipalVisibleReport\(report\)/);
assert.match(principalRoute, /\.eq\("principal_id", principal\.id\)/);
assert.match(principalRoute, /onConflict: "principal_id,report_id"/);
assert.doesNotMatch(principalRoute, /parent_adviser_reports"\)[\s\S]{0,250}\.update\(/);

for (const [page, endpoint] of [
  [adviserPage, "/api/reports/adviser/favorites"],
  [principalPage, "/api/reports/principal/favorites"],
]) {
  assert.match(page, /Star,/);
  assert.match(page, /aria-label=\{isFavorite \? "Remove report from favorites" : "Add report to favorites"\}/);
  assert.match(page, /favoriteFirstReport\(favoriteReportIds\)/);
  assert.match(page, /groupHasFavorite\(b, favoriteReportIds\)/);
  assert.match(page, new RegExp(`fetch\\("${endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(page, /method: "PATCH"[\s\S]*?reportId, favorite: !wasFavorite/);
  assert.match(page, /favoriteSaveInFlightRef\.current\.has\(reportId\)/);
}

// Newer incoming reports stay below favorites, and unfavoriting restores the
// established newest-first ordering.
const newestFirst = (a, b) => b.activity - a.activity || b.id - a.id;
const favoriteFirst = (favorites) => (a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || newestFirst(a, b);
const reports = [{ id: 1, activity: 100 }, { id: 2, activity: 200 }, { id: 3, activity: 300 }];
const favorites = new Set([1]);
assert.deepEqual([...reports].sort(favoriteFirst(favorites)).map((report) => report.id), [1, 3, 2]);
assert.deepEqual([...reports, { id: 4, activity: 400 }].sort(favoriteFirst(favorites)).map((report) => report.id), [1, 4, 3, 2]);
favorites.delete(1);
assert.deepEqual([...reports, { id: 4, activity: 400 }].sort(favoriteFirst(favorites)).map((report) => report.id), [4, 3, 2, 1]);

console.log("Adviser and Principal report favorite checks passed.");
