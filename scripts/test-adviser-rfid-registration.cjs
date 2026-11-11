/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const route = read("src/app/api/students/register-rfid/route.ts");
const attendancePage = read("src/app/dashboard/adviser/attendance/page.tsx");

// The selected learner's current card is checked before card-owner lookup.
// An exact repeat is successful and visibly identified as an idempotent no-op,
// whereas a card owned by another learner remains a conflict.
assert.match(route, /currentRfid === normalizedRfid[\s\S]*?already_assigned: true/);
assert.match(route, /if \(owner\.id === targetStudent\.id\)[\s\S]*?already_assigned: true/);
assert.match(route, /This RFID card is already assigned to \$\{owner\.first_name\}/);
assert.match(route, /already_assigned: false/);

// A successful assignment changes the local roster immediately. The learner
// moves out of the derived No RFID group and is no longer selected, so the
// replacement warning cannot overwrite the successful first registration.
assert.match(attendancePage, /label: "No RFID"[\s\S]*?!resolveRfidScanValue\(student\.rfid_card, ""\)/);
assert.match(attendancePage, /student\.id === selectedRfidStudent\.id[\s\S]*?rfid_card: savedRfid/);
assert.match(attendancePage, /setRfidStudentDbId\(null\)/);
assert.match(attendancePage, /alreadyAssigned[\s\S]*?No duplicate assignment was created/);

// A delayed roster response begun before a confirmed replacement must not
// overwrite the new UID shown by the immediate local update.
assert.match(attendancePage, /const studentsLoadRequestRef = useRef\(0\)/);
assert.match(attendancePage, /const requestId = \+\+studentsLoadRequestRef\.current/);
assert.match(attendancePage, /if \(data\.success && requestId === studentsLoadRequestRef\.current\)[\s\S]*?setStudents\(data\.data \|\| \[\]\)/);
assert.match(attendancePage, /if \(requestId === studentsLoadRequestRef\.current\) setIsLoadingStudents\(false\)/);

console.log("Adviser RFID registration lookup, idempotency, and local roster update checks passed.");
