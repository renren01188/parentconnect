const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const assignment = read("src/lib/adviserAssignment.ts");
assert.match(assignment, /normalizeAssignmentValue/);
assert.match(assignment, /adviserIsAssignedToStudent/);
assert.match(assignment, /replace\(\/\\s\+\/g, " "\)/);

const recipientsRoute = read("src/app/api/reports/parent-adviser/advisers/route.ts");
assert.match(recipientsRoute, /studentFromRelation\(parentLink\.students\)/);
assert.match(recipientsRoute, /adviserIsAssignedToStudent\(row, student\)/);

const submissionRoute = read("src/app/api/reports/parent-adviser/route.ts");
assert.match(submissionRoute, /adviserIsAssignedToStudent\(adviser, student\)/);
assert.match(submissionRoute, /\.eq\("status", "active"\)/);

const page = read("src/app/dashboard/parent/reports/page.tsx");
assert.match(page, /const \[advisersLoading, setAdvisersLoading\] = useState\(true\)/);
assert.match(page, /const loadAdvisers = useCallback/);
assert.match(page, /Finding the class adviser linked to your child/);
assert.match(page, /Try Again/);
assert.match(page, /void loadAdvisers\(\);/);

console.log("Parent report adviser-link checks passed.");
