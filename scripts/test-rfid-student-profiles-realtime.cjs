const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const adviserRfidRoute = read("src/app/api/students/register-rfid/route.ts");
const ictRfidRoute = read("src/app/api/ict/rfid/route.ts");
const ictStudentProfilesRoute = read("src/app/api/ict/students/[id]/route.ts");
const scheduledDeletionRoute = read("src/app/api/scheduled-deletions/route.ts");
const studentProfiles = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const realtime = read("src/lib/realtimeInvalidation.ts");
const sessionInvalidation = read("src/hooks/useSessionInvalidation.ts");

// Adviser writes use the same verified students.id row as ICT and emit the
// data-free student refresh only after the update and audit record succeed.
assert.match(adviserRfidRoute, /import \{ publishStudentRealtimeInvalidation \} from "@\/lib\/realtimeInvalidation"/);
assert.match(adviserRfidRoute, /await logAudit\([\s\S]*?await publishStudentRealtimeInvalidation\(\{ studentDbId: updatedStudent\.id \}\)/);
assert.equal((adviserRfidRoute.match(/publishStudentRealtimeInvalidation\(\{ studentDbId: updatedStudent\.id \}\)/g) ?? []).length, 2);

// The shared student event includes all ICT accounts, so assignments from an
// Adviser and changes made by ICT update every open Student Profiles tab.
assert.match(realtime, /const \[studentRecipients, ictRecipients\] = await Promise\.all/);
assert.match(realtime, /recipientsForRoles\(\["ict"\]\)/);
assert.match(realtime, /publishRealtimeInvalidation\(\[\.\.\.studentRecipients, \.\.\.ictRecipients\], "students"\)/);
assert.match(ictRfidRoute, /await publishStudentRealtimeInvalidation\(\{ studentDbId: updatedStudent\.id \}\)/);
assert.match(ictStudentProfilesRoute, /const ict = await getActiveIct\(\)/);
assert.match(ictStudentProfilesRoute, /await publishStudentRealtimeInvalidation\(\{ studentDbId \}\)/);
assert.match(ictStudentProfilesRoute, /supabase\.rpc\("rename_student_lrn"/);
assert.match(scheduledDeletionRoute, /item\.target_type === "student"[\s\S]*?publishStudentRealtimeInvalidation/);

// Student Profiles uses its normal protected, no-store API snapshot after a
// Realtime event. It does not open another direct channel, because the shared
// session hook owns the one account subscription and removes it on unmount.
assert.match(studentProfiles, /useSessionInvalidation\(\(event\) => \{[\s\S]*?event\.scope === "students" \|\| event\.scope === "accounts"[\s\S]*?setStudentRefreshKey/);
assert.match(studentProfiles, /fetch\(`\/api\/ict\/students\?\$\{params\.toString\(\)\}`, \{ cache: "no-store" \}\)/);
assert.match(studentProfiles, /setStudents\(data\.data\.map\(mapStudent\)\)/);
assert.match(studentProfiles, /fetch\(`\/api\/ict\/students\/\$\{student\.id\}`, \{/);
assert.match(studentProfiles, /fetch\("\/api\/scheduled-deletions", \{/);
assert.match(sessionInvalidation, /const listeners = new Set/);
assert.match(sessionInvalidation, /removeChannel\(current\)/);
assert.match(sessionInvalidation, /stopSharedChannelWhenUnused/);

console.log("RFID Student Profiles realtime checks passed");
