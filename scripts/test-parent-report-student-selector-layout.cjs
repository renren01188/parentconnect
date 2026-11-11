/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src/app/dashboard/parent/reports/page.tsx"), "utf8");

// The list must float over the modal content rather than adding its height to
// the report form. Its own max height keeps the options usable on short mobile
// viewports without causing the modal to resize or recenter.
assert.match(page, /<div ref=\{studentRef\} style=\{\{ position: "relative" \}\}>/);
assert.match(
  page,
  /<div role="listbox" aria-label="Linked students" style=\{\{ position: "absolute", top: "calc\(100% \+ 6px\)", left: 0, right: 0, zIndex: 20, maxHeight: "min\(18rem, calc\(100dvh - 13rem\)\)"/,
);
assert.doesNotMatch(page, /role="listbox" aria-label="Linked students" style=\{\{ marginTop:/);

console.log("parent report student-selector layout checks passed");
