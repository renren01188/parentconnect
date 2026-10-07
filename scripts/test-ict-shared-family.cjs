const assert = require("node:assert/strict");

const linkedStudentDbIds = [101, 202];
const sharedFamily = [
  { role: "Father", first_name: "Alex", middle_name: "Santos", last_name: "Reyes" },
  { role: "Mother", first_name: "Bea", middle_name: "Cruz", last_name: "Reyes" },
  { role: "Guardian", first_name: "", middle_name: "", last_name: "" },
];

function synchronizeVerificationRecords(existingRows, studentIds, members) {
  const rows = new Map(existingRows.map((row) => [`${row.student_db_id}:${row.role}`, row]));
  for (const studentDbId of studentIds) {
    for (const member of members) {
      const key = `${studentDbId}:${member.role}`;
      const hasName = member.first_name || member.middle_name || member.last_name;
      if (hasName) rows.set(key, { student_db_id: studentDbId, ...member });
      else rows.delete(key);
    }
  }
  return [...rows.values()];
}

const existingRows = [
  { student_db_id: 101, role: "Father", first_name: "Old", middle_name: "", last_name: "Value" },
  { student_db_id: 202, role: "Father", first_name: "Old", middle_name: "", last_name: "Value" },
  { student_db_id: 202, role: "Guardian", first_name: "Remove", middle_name: "", last_name: "Me" },
];

const once = synchronizeVerificationRecords(existingRows, linkedStudentDbIds, sharedFamily);
const twice = synchronizeVerificationRecords(once, linkedStudentDbIds, sharedFamily);

assert.equal(once.length, 4, "each linked student retains only one row per named family role");
assert.deepEqual(twice, once, "saving the same details cannot create duplicate verification rows");
assert.equal(new Set(once.map((row) => `${row.student_db_id}:${row.role}`)).size, once.length);
assert.deepEqual(
  once.filter((row) => row.role === "Father").map((row) => row.first_name),
  ["Alex", "Alex"],
  "a shared edit updates the existing verification rows for linked children",
);

console.log("ICT shared-family synchronization checks passed.");
