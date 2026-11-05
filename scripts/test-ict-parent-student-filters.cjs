/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const route = read("src/app/api/ict/user-management/route.ts");
const page = read("src/app/dashboard/ict/user-management/page.tsx");
const studentProfilesRoute = read("src/app/api/ict/students/route.ts");
const studentProfilesPage = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const completion = read("src/lib/parentAccountCompletion.ts");

// The API must offer a student-centred, paginated branch. Parent-account
// pagination is not suitable here because a parent can be linked to multiple
// students and the filters/counts are defined per student.
assert.match(route, /requestedRole === "parent_students"/);
assert.match(route, /parentStudentFilters:\s*\{/);
assert.match(route, /parentGrade/);
assert.match(route, /parentSection/);
assert.match(route, /parentLinkState/);
assert.match(route, /hasCompletedActiveParentSignup\(parent\)/);
assert.doesNotMatch(route, /requires_account_setup/);
assert.match(route, /new Map<string, Set<number>>\(\)/);
assert.match(route, /associatedParentIdsByStudentId/);
assert.match(route, /"Awaiting Signup"/);
assert.match(route, /"Not Registered"/);
assert.match(completion, /hasCompletedActiveParentSignup/);
assert.match(completion, /isImportedParentPlaceholder/);
assert.match(completion, /parentAccountCanAccess/);

// Student Profiles uses the same completed-account definition and must never
// turn a placeholder association into an owner name in the profile table.
assert.match(studentProfilesRoute, /hasCompletedActiveParentSignup\(parent\)/);
assert.match(studentProfilesRoute, /associatedParentIdsByStudentId/);
assert.match(studentProfilesRoute, /"Awaiting Signup"/);
assert.match(studentProfilesRoute, /"Not Registered"/);
assert.match(studentProfilesPage, /ParentLinkBadge/);
assert.match(studentProfilesPage, /Awaiting Signup/);
assert.match(studentProfilesPage, /Not Registered/);

// Simulate the database relationship model. The same signed-up parent is
// linked to two children and an unsigned parent has a relation to a third.
// Counts remain student counts, every student appears once, and only the
// parent with a completed normal signup makes a child "Already Linked".
const students = [
  { studentId: "1001", grade: "Grade 1", section: "Gold" },
  { studentId: "1002", grade: "Grade 1", section: "Gold" },
  { studentId: "1003", grade: "Grade 1", section: "Gold" },
  { studentId: "2001", grade: "Grade 2", section: "Silver" },
];
const parents = [
  { id: 7, passwordSet: true, active: true, placeholder: false },
  { id: 8, passwordSet: false, active: true, placeholder: false },
  // Imported rows may have a legacy password value, but remain awaiting
  // signup until a real guardian has claimed the account.
  { id: 9, passwordSet: true, active: true, placeholder: true },
];
const links = [
  { parentId: 7, studentId: "1001" },
  { parentId: 7, studentId: "1002" },
  { parentId: 7, studentId: "1002" }, // duplicate link must not duplicate the student
  { parentId: 8, studentId: "1003" }, // pre-sign-up account is not linked
  { parentId: 9, studentId: "1003" },
];

const signedUpParentIds = new Set(
  parents
    .filter((parent) => parent.passwordSet && parent.active && !parent.placeholder)
    .map((parent) => parent.id),
);
const associatedParentIdsByStudent = new Map();
const signedUpParentIdsByStudent = new Map();
for (const link of links) {
  const relatedIds = associatedParentIdsByStudent.get(link.studentId) ?? new Set();
  relatedIds.add(link.parentId);
  associatedParentIdsByStudent.set(link.studentId, relatedIds);
  if (!signedUpParentIds.has(link.parentId)) continue;
  const ids = signedUpParentIdsByStudent.get(link.studentId) ?? new Set();
  ids.add(link.parentId);
  signedUpParentIdsByStudent.set(link.studentId, ids);
}
const directory = students.map((student) => ({
  ...student,
  state: (signedUpParentIdsByStudent.get(student.studentId)?.size ?? 0) > 0
    ? "Already Linked"
    : (associatedParentIdsByStudent.get(student.studentId)?.size ?? 0) > 0 ? "Awaiting Signup" : "Not Registered",
}));
const gradeOneGold = directory.filter((student) => student.grade === "Grade 1" && student.section === "Gold");

assert.equal(directory.length, 4, "the directory has one row per student");
assert.equal(new Set(directory.map((student) => student.studentId)).size, 4, "no student is duplicated by parent links");
assert.deepEqual(gradeOneGold.map((student) => student.state), ["Already Linked", "Already Linked", "Awaiting Signup"]);
assert.equal(gradeOneGold.filter((student) => student.state === "Already Linked").length, 2);
assert.equal(gradeOneGold.filter((student) => student.state === "Awaiting Signup").length, 1);
assert.equal(directory.find((student) => student.studentId === "2001").state, "Not Registered");

// The UI sends cascading selections to the same API branch and retains the
// established server pagination/search mechanism.
assert.match(page, /filterMode === "parent" \? "parent_students" : filterMode/);
assert.match(page, /userParams\.set\("parentGrade", parentStudentGrade\)/);
assert.match(page, /userParams\.set\("parentSection", parentStudentSection\)/);
assert.match(page, /disabled=\{!parentStudentGrade\}/);
assert.match(page, /Already Linked/);
assert.match(page, /Awaiting Signup/);
assert.match(page, /Not Registered/);
assert.match(page, /parentStudentFilters\.counts\.alreadyLinked/);
assert.match(page, /parentStudentFilters\.counts\.awaitingSignup/);
assert.match(page, /parentStudentFilters\.counts\.notRegistered/);

console.log("ICT Parents & Students cascading-filter checks passed.");
