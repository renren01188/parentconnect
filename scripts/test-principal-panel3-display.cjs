const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const page = fs.readFileSync(
  path.join(__dirname, "..", "src", "app", "dashboard", "principal", "reports", "page.tsx"),
  "utf8",
);

const panelThreeStart = page.indexOf('className={panelClass(viewStep === "detail"');
assert.notEqual(panelThreeStart, -1, "Principal report detail panel must exist.");
const panelThree = page.slice(panelThreeStart);

assert.doesNotMatch(panelThree, /<PriorityBadge level=\{selectedReport\.concernLevel\} large \/>/,
  "Panel 3 must not show a priority badge.");
assert.doesNotMatch(panelThree, /<ConcernBar level=\{selectedReport\.concernLevel\} \/>/,
  "Panel 3 must not show the concern-level meter.");
assert.match(panelThree, /principalReportStatusLabel\(selectedReport\)/,
  "The report status must remain available in the Principal report workflow.");

console.log("Principal Panel 3 display checks passed.");
