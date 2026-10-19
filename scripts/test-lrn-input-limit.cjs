const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const registration = fs.readFileSync(
  path.join(root, "src/components/student-parent-registration/StudentParentRegistration.tsx"),
  "utf8"
);

// The browser limit covers typing; truncation after digit-only normalization
// also protects paste and programmatic change events.
assert.match(registration, /inputMode="numeric" maxLength=\{12\} value=\{form\.studentId\}/);
assert.match(registration, /replace\(\/\\D\/g, ""\)\.slice\(0, 12\)/);
assert.match(registration, /\^\\d\{12\}\$/);

console.log("LRN input limit checks passed.");
