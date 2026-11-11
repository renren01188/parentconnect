/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(role) {
  return fs.readFileSync(
    path.join(__dirname, "..", "src", "app", "dashboard", role, "reports", "page.tsx"),
    "utf8",
  );
}

const parent = read("parent");
const adviser = read("adviser");
const guidance = read("guidance");
const principal = read("principal");

// Category choices must follow the current tab/status scope rather than the
// full, stale report collection. Each page also recovers to All when a live
// update removes the selected category from that scope.
assert.match(parent, /const categoryScopeReports = useMemo\(\(\) => filterParentReportConversations/);
assert.match(parent, /All Categories \(\{categoryScopeReports\.length\}\)/);
assert.match(parent, /categoryScopeReports\.filter\(r => r\.categories\.includes\(cat\)\)\.length/);

assert.match(adviser, /const reportsForCategoryFilter = useMemo\(\(\) => reports\.filter/);
assert.match(adviser, /adviserReportStatusCategory\(report\)/);
assert.match(adviser, /All Categories \(\{reportsForCategoryFilter\.length\}\)/);

assert.match(guidance, /filterGuidanceReports\(reports, filterTab, "All"\)/);
assert.match(guidance, /All Categories \(\{reportsForCategoryFilter\.length\}\)/);

assert.match(principal, /const reportsForCategoryFilter = useMemo\(\(\) => currentReports\.filter/);
assert.match(principal, /All Categories \(\{reportsForCategoryFilter\.length\}\)/);
assert.match(principal, /reportsForCategoryFilter\.filter\(\(report\) => report\.categories\.includes\(category\)\)\.length/);

for (const page of [parent, adviser, guidance, principal]) {
  assert.match(page, /categoryFilter !== "All" && !(?:allUsedCategories|allReportCategories|allCategories)\.includes\(categoryFilter\)/);
  assert.match(page, /setCategoryFilter\("All"\)/);
}

console.log("report category filter freshness checks passed");
