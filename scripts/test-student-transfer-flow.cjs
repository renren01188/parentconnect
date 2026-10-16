const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const rosterRoute = read("src/app/api/students/route.ts");
const transferQueueRoute = read("src/app/api/students/transfer-standby/route.ts");
const standbyRoute = read("src/app/api/students/standby/route.ts");
const receiveBatchRoute = read("src/app/api/students/transfer-assign-rfid-batch/route.ts");
const receiveSingleRoute = read("src/app/api/students/transfer-assign-rfid/route.ts");
const studentsPage = read("src/app/dashboard/adviser/students/page.tsx");
const transferPage = read("src/app/dashboard/adviser/transfer-level/page.tsx");
const receiveModal = read("src/app/dashboard/adviser/students/TransferFromStandbyModal.tsx");
const realtime = read("src/lib/realtimeInvalidation.ts");

// A pending transfer stays out of every active Students roster. This is the
// boundary that keeps it in Receive Transfer until the receiving adviser
// explicitly accepts it.
assert.match(rosterRoute, /function listAdviserRoster[\s\S]*?\.eq\("archive_status", "active"\)[\s\S]*?\.is\("transfer_status", null\)/);
assert.match(transferPage, /fetch\("\/api\/students\/transfer-standby"/);
assert.match(transferQueueRoute, /\.eq\("archive_status", "active"\)[\s\S]*?\.is\("transfer_status", null\)/);
assert.match(transferQueueRoute, /ownedStudents\.length !== requestedStudentIds\.length/);
assert.match(transferQueueRoute, /queuedStudents\?\.length \?\? 0\) !== ownedIds\.length/);
assert.match(transferQueueRoute, /Choose an existing destination grade level and section/);
assert.match(transferQueueRoute, /targetAdviserRecipients\.length === 0/);
assert.match(realtime, /adviserRecipientsForClass[\s\S]*?\.eq\("status", "active"\)[\s\S]*?\.neq\("archive_status", "archived"\)/);

// The target adviser sees the request through the dedicated pending endpoint,
// not through the active roster endpoint.
assert.match(standbyRoute, /\.eq\("transfer_status", "standby"\)[\s\S]*?\.eq\("target_grade",\s+grade\)[\s\S]*?\.eq\("target_section",\s+section\)/);
assert.match(studentsPage, /fetch\("\/api\/students\/standby-summary", \{ cache: "no-store" \}\)/);
assert.match(receiveModal, /fetch\(`\/api\/students\/standby\?\$\{qs\}`\)/);

// Receipt is authorized against the exact target class, and writes the class
// fields only while the row still has its pending state. This prevents a
// different adviser or a second request from accepting it.
assert.match(receiveBatchRoute, /student\.target_grade !== adviser\.grade \|\| !adviserSections\.includes\(student\.target_section\)/);
assert.match(receiveBatchRoute, /\.eq\("transfer_status", "standby"\)[\s\S]*?\.eq\("target_grade", student\.target_grade\)[\s\S]*?\.eq\("target_section", student\.target_section\)/);
assert.match(receiveBatchRoute, /grade: student\.target_grade,[\s\S]*?section: student\.target_section,[\s\S]*?transfer_status: null,[\s\S]*?target_grade: null,[\s\S]*?target_section: null/);
assert.match(receiveBatchRoute, /TransferStateConflict/);
assert.match(receiveSingleRoute, /student\.target_grade !== adviser\.grade/);
assert.match(receiveSingleRoute, /\.eq\("transfer_status", "standby"\)[\s\S]*?\.eq\("target_grade", student\.target_grade\)[\s\S]*?\.eq\("target_section", student\.target_section\)/);

console.log("Student transfer pending/receipt flow checks passed.");
