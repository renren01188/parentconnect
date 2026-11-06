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
const adviserStudentEditRoute = read("src/app/api/students/[id]/route.ts");
const ictStudentEditRoute = read("src/app/api/ict/students/[id]/route.ts");
const adviserSidebar = read("src/app/dashboard/adviser/components/Sidebar.tsx");
const adviserNotificationContext = read("src/app/dashboard/adviser/context/NotificationContext.tsx");
const mailer = read("src/lib/mailer.ts");
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

// The layout-wide Adviser provider owns the Students sidebar badge, so it
// receives the target-class transfer invalidation even before Students opens.
assert.match(adviserNotificationContext, /transferUnreadCount/);
assert.match(adviserNotificationContext, /fetchJsonWithRetry<ReadyTransferSummaryResponse>\([\s\S]*?"\/api\/students\/standby-summary"/);
assert.match(adviserNotificationContext, /scope === "reports" \|\| scope === "students"[\s\S]*?loadTransferCount\(\)/);
assert.match(adviserSidebar, /Students", icon: Users, href: "\/dashboard\/adviser\/students", badgeKey: "transfers"/);
assert.match(adviserSidebar, /NAV_ITEMS\.find\([\s\S]*?pathname\.startsWith\(href\)/);
assert.match(adviserSidebar, /dismissBadge\(badgeKey\)/);

// A receiving Adviser email is sent only after every conditional standby
// update succeeds. Re-submitting that batch cannot reach this code again.
assert.match(mailer, /export async function sendAdviserTransferReadyEmail/);
assert.match(transferQueueRoute, /import \{ sendAdviserTransferReadyEmail \} from "@\/lib\/mailer"/);
assert.match(transferQueueRoute, /queuedStudents\?\.length \?\? 0\) !== ownedIds\.length[\s\S]*?notifyReceivingAdvisersByEmail/);
assert.match(transferQueueRoute, /new Map<string, ReceivingAdviser>/);
assert.match(transferQueueRoute, /Promise\.allSettled[\s\S]*?sendAdviserTransferReadyEmail/);
assert.match(transferPage, /json\.emailNotification/);

// Receipt is authorized against the exact target class, and writes the class
// fields only while the row still has its pending state. This prevents a
// different adviser or a second request from accepting it.
assert.match(receiveBatchRoute, /student\.target_grade !== adviser\.grade \|\| !adviserSections\.includes\(student\.target_section\)/);
assert.match(receiveBatchRoute, /\.eq\("transfer_status", "standby"\)[\s\S]*?\.eq\("target_grade", student\.target_grade\)[\s\S]*?\.eq\("target_section", student\.target_section\)/);
assert.match(receiveBatchRoute, /grade: student\.target_grade,[\s\S]*?section: student\.target_section,[\s\S]*?transfer_status: null,[\s\S]*?target_grade: null,[\s\S]*?target_section: null/);
assert.match(receiveBatchRoute, /TransferStateConflict/);
assert.match(receiveSingleRoute, /student\.target_grade !== adviser\.grade/);
assert.match(receiveSingleRoute, /\.eq\("transfer_status", "standby"\)[\s\S]*?\.eq\("target_grade", student\.target_grade\)[\s\S]*?\.eq\("target_section", student\.target_section\)/);

// An Adviser may directly move a learner they currently own to any valid
// grade/section. This is an immediate reassignment, not the separate
// standby-transfer workflow above: the destination section is validated,
// controls the future attendance session, and the action is audited.
assert.doesNotMatch(adviserStudentEditRoute, /grade && grade !== adviser\.grade/);
assert.match(adviserStudentEditRoute, /\.from\("sections"\)[\s\S]*?\.eq\("grade", targetGrade\)[\s\S]*?\.eq\("name", targetSection\)/);
assert.match(adviserStudentEditRoute, /assignmentChanged && existing\.transfer_status/);
assert.match(adviserStudentEditRoute, /class_session: targetClass\.class_session/);
assert.match(adviserStudentEditRoute, /action: assignmentChanged \? "Student Transferred" : "Student Profile Updated"/);
assert.match(adviserStudentEditRoute, /adviserRecipientsForClass\(existing\.grade, existing\.section\)/);
assert.match(adviserStudentEditRoute, /publishRealtimeInvalidation\(previousClassAdvisers, "students"\)/);

// ICT has the same immediate reassignment safeguards for the Class & RFID
// editor: an existing target section, no pending transfer, and a session
// aligned to the chosen section.
assert.match(ictStudentEditRoute, /\.from\("sections"\)[\s\S]*?\.eq\("grade", grade\)[\s\S]*?\.eq\("name", section\)/);
assert.match(ictStudentEditRoute, /assignmentChanged && existing\.transfer_status/);
assert.match(ictStudentEditRoute, /class_session: validSection\.class_session/);

console.log("Student transfer pending/receipt flow checks passed.");
