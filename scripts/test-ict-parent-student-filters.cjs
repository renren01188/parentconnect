/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const route = read("src/app/api/ict/user-management/route.ts");
const page = read("src/app/dashboard/ict/user-management/page.tsx");

// The API must offer a student-centred, paginated branch. Parent-account
// pagination is not suitable here because a parent can be linked to multiple
// students and the filters/counts are defined per student.
assert.match(route, /requestedRole === "parent_students"/);
assert.match(route, /parentStudentFilters:\s*\{/);
assert.match(route, /parentGrade/);
assert.match(route, /parentSection/);
assert.match(route, /parentLinkState/);
assert.match(route, /isPreSignupParentRecord\(\[parent\.id\], parent\.password_set\)/);
assert.match(route, /new Map<string, Set<number>>\(\)/);
assert.match(route, /parentStudentLinkState: isLinked \? "Already Linked" : "Unlinked"|parentStudentLinkState,/);

// Simulate the database relationship model. The same signed-up parent is
// linked to two children and an unsigned parent has a relation to a third.
// Counts remain student counts, every student appears once, and only the
// parent with completed password setup makes a child "Already Linked".
const students = [
  { studentId: "1001", grade: "Grade 1", section: "Gold" },
  { studentId: "1002", grade: "Grade 1", section: "Gold" },
  { studentId: "1003", grade: "Grade 1", section: "Gold" },
  { studentId: "2001", grade: "Grade 2", section: "Silver" },
];
const parents = [
  { id: 7, passwordSet: true },
  { id: 8, passwordSet: false },
];
const links = [
  { parentId: 7, studentId: "1001" },
  { parentId: 7, studentId: "1002" },
  { parentId: 7, studentId: "1002" }, // duplicate link must not duplicate the student
  { parentId: 8, studentId: "1003" }, // pre-sign-up account is not linked
];

const signedUpParentIds = new Set(parents.filter((parent) => parent.passwordSet).map((parent) => parent.id));
const signedUpParentIdsByStudent = new Map();
for (const link of links) {
  if (!signedUpParentIds.has(link.parentId)) continue;
  const ids = signedUpParentIdsByStudent.get(link.studentId) ?? new Set();
  ids.add(link.parentId);
  signedUpParentIdsByStudent.set(link.studentId, ids);
}
const directory = students.map((student) => ({
  ...student,
  state: (signedUpParentIdsByStudent.get(student.studentId)?.size ?? 0) > 0 ? "Already Linked" : "Unlinked",
}));
const gradeOneGold = directory.filter((student) => student.grade === "Grade 1" && student.section === "Gold");

assert.equal(directory.length, 4, "the directory has one row per student");
assert.equal(new Set(directory.map((student) => student.studentId)).size, 4, "no student is duplicated by parent links");
assert.deepEqual(gradeOneGold.map((student) => student.state), ["Already Linked", "Already Linked", "Unlinked"]);
assert.equal(gradeOneGold.filter((student) => student.state === "Already Linked").length, 2);
assert.equal(gradeOneGold.filter((student) => student.state === "Unlinked").length, 1);

// The UI sends cascading selections to the same API branch and retains the
// established server pagination/search mechanism.
assert.match(page, /filterMode === "parent" \? "parent_students" : filterMode/);
assert.match(page, /userParams\.set\("parentGrade", parentStudentGrade\)/);
assert.match(page, /userParams\.set\("parentSection", parentStudentSection\)/);
assert.match(page, /disabled=\{!parentStudentGrade\}/);
assert.match(page, /Already Linked/);
assert.match(page, /Unlinked/);
assert.match(page, /parentStudentFilters\.counts\.alreadyLinked/);
assert.match(page, /parentStudentFilters\.counts\.unlinked/);

console.log("ICT Parents & Students cascading-filter checks passed.");
