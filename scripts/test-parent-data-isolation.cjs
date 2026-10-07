const assert = require("node:assert/strict");

// Regression fixture for the bug where report ownership was checked with a
// copied parent_email value instead of the parent account's immutable ID.
const parentA = {
  id: 100,
  email: "shared@example.test",
  linkedStudentIds: ["student-a-1", "student-a-2"],
};

const parentB = {
  id: 200,
  email: "other.parent@example.test",
  linkedStudentIds: ["student-b-1"],
};

const reports = [
  // A legacy/orphaned report with Parent A's e-mail snapshot. It must never
  // become visible to Parent A merely because the e-mail happens to match.
  { id: 1, parentId: 999, parentEmail: parentA.email, studentId: "student-b-1" },
  { id: 2, parentId: parentA.id, parentEmail: parentA.email, studentId: "student-a-1" },
  { id: 3, parentId: parentB.id, parentEmail: parentB.email, studentId: "student-b-1" },
  // Even a row carrying Parent A's ID is not visible unless its student is
  // currently linked to Parent A.
  { id: 4, parentId: parentA.id, parentEmail: parentA.email, studentId: "student-b-1" },
];

const attendance = [
  { id: 1, studentId: "student-a-1" },
  { id: 2, studentId: "student-a-2" },
  { id: 3, studentId: "student-b-1" },
];

function reportsFor(parent) {
  return reports.filter(
    (report) => report.parentId === parent.id && parent.linkedStudentIds.includes(report.studentId),
  );
}

function attendanceFor(parent) {
  return attendance.filter((entry) => parent.linkedStudentIds.includes(entry.studentId));
}

assert.deepEqual(
  reports.filter((report) => report.parentEmail === parentA.email).map((report) => report.id),
  [1, 2, 4],
  "The old e-mail-only filter demonstrates the cross-account leak"
);
assert.deepEqual(reportsFor(parentA).map((report) => report.id), [2]);
assert.deepEqual(reportsFor(parentB).map((report) => report.id), [3]);
assert.equal(reportsFor(parentA).some((report) => report.id === 1), false);
assert.equal(reportsFor(parentA).some((report) => report.id === 4), false);
assert.deepEqual(attendanceFor(parentA).map((entry) => entry.id), [1, 2]);
assert.deepEqual(attendanceFor(parentB).map((entry) => entry.id), [3]);

console.log("Parent dashboard account and linked-student isolation checks passed.");
