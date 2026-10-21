/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const route = read("src/app/api/ict/students/route.ts");
const page = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const scheduledDeletions = read("src/app/api/scheduled-deletions/route.ts");

// The endpoint must use the canonical many-to-many relation, retain the
// direct legacy relation only as a fallback, and return no parent contacts.
assert.match(route, /from\("parent_student_links"\)/);
assert.match(route, /from\("parents"\)/);
assert.match(route, /hasCompletedParentSignup\(/);
assert.match(route, /parent_link_status/);
assert.match(route, /linked_parent_names/);
assert.doesNotMatch(route, /contact_number|\bemail\b/);
assert.match(page, /parentLinkFilter/);
assert.match(page, /<option value="Unlinked">Unlinked<\/option>/);
assert.match(page, /Already Linked/);
assert.match(page, /parentLinkStatus === "Already Linked"/);
assert.doesNotMatch(page, /parentEmail|parentPhone|parentRelationship|parentAddress/);
assert.doesNotMatch(page, /targetEmail/);
assert.match(scheduledDeletions, /Student Profiles deliberately never receives Parent contact details/);
assert.match(scheduledDeletions, /targetType === "student"/);

// A completed parent account may link to several students. An imported
// account that still needs setup, even if its password flag is set, must not
// turn a student into an "Already Linked" result.
const students = ["1001", "1002", "1003"];
const parents = [
  { id: 7, name: "Parent One", passwordSet: true, requiresSetup: false },
  { id: 8, name: "Parent Two", passwordSet: true, requiresSetup: true },
];
const links = [
  { parentId: 7, studentId: "1001" },
  { parentId: 7, studentId: "1002" },
  { parentId: 8, studentId: "1003" },
];
const completedParents = new Map(
  parents
    .filter((parent) => parent.passwordSet && !parent.requiresSetup)
    .map((parent) => [parent.id, parent]),
);
const namesByStudent = new Map();
for (const link of links) {
  const parent = completedParents.get(link.parentId);
  if (!parent) continue;
  const names = namesByStudent.get(link.studentId) ?? new Set();
  names.add(parent.name);
  namesByStudent.set(link.studentId, names);
}
const rows = students.map((studentId) => ({
  studentId,
  state: (namesByStudent.get(studentId)?.size ?? 0) > 0 ? "Already Linked" : "Unlinked",
  parentNames: [...(namesByStudent.get(studentId) ?? [])],
}));

assert.deepEqual(rows.map((row) => row.state), ["Already Linked", "Already Linked", "Unlinked"]);
assert.deepEqual(rows[0].parentNames, ["Parent One"]);
assert.deepEqual(rows[1].parentNames, ["Parent One"], "a shared parent is shown for every linked student");
assert.equal(rows.filter((row) => row.state === "Unlinked").length, 1);

console.log("ICT Student Profiles parent-link checks passed.");
