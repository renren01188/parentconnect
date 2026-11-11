/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const modal = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const sectionsRoute = read("src/app/api/sections/route.ts");
const studentsRoute = read("src/app/api/ict/students/route.ts");
const rfidRoute = read("src/app/api/ict/rfid/route.ts");
const scanRoute = read("src/app/api/attendance/scan/route.ts");
const adviserAttendance = read("src/app/dashboard/adviser/attendance/page.tsx");
const migration = read("supabase/legacy-migrations/20261021160000_enforce_normalized_rfid_uniqueness.sql");

// The modal uses two small grade-level reads, caches them while it is open,
// and changes sections locally rather than requesting the server again.
assert.match(modal, /registrationOptionsCache/);
assert.match(modal, /Promise\.all\(\[\s*getJson\(`\/api\/sections\?grade=\$\{encodeURIComponent\(grade\)\}&purpose=rfid-registration`\),\s*getJson\(`\/api\/ict\/students\?grade=\$\{encodeURIComponent\(grade\)\}&purpose=rfid-registration`\)/s);
assert.match(modal, /modalGradeStudents\.filter\(\(student\) => student\.section === selectedSection\)/);
assert.match(modal, /new AbortController/);
assert.match(modal, /Loading grade levels/);
assert.match(modal, /Loading sections/);
assert.match(modal, /Loading students/);
assert.match(modal, /No sections are configured/);
assert.match(modal, /Retry loading students/);

// The authorization boundary stays in the existing routes; their new purpose
// branches avoid the heavyweight aggregation/enrichment queries.
assert.match(sectionsRoute, /if \(purpose === "rfid-registration"\)/);
assert.match(sectionsRoute, /from\("sections"\)\s*\.select\("name"\)/s);
assert.match(studentsRoute, /const ict = await getActiveIct\(\)/);
assert.match(studentsRoute, /if \(purpose === "rfid-registration"\)/);
assert.match(studentsRoute, /select\("id, first_name, middle_name, last_name, suffix, student_id, gender, grade, section, rfid_card"\)/);

// Empty/duplicate UIDs show a clear error before save; the save route repeats
// the validation, verifies the target student, and handles a database race.
assert.match(modal, /Enter or scan an RFID UID before checking it\./);
assert.match(modal, /This RFID is already registered\. Enter or scan a different card\./);
assert.match(rfidRoute, /Number\.isSafeInteger\(targetStudentId\)/);
assert.match(rfidRoute, /Student not found\. Refresh the list and try again\./);
assert.match(rfidRoute, /error: existingError/);
assert.match(rfidRoute, /error\.code === "23505"/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS students_rfid_card_normalized_unique/);
assert.match(migration, /upper\(btrim\(rfid_card\)\)/);

// Assignment is written to students.rfid_card, published through the existing
// protected student channel, and the Adviser scanner queries the same value.
assert.match(rfidRoute, /update\(\{ rfid_card: normalized \}\)/);
assert.match(rfidRoute, /publishStudentRealtimeInvalidation\(\{ studentDbId: updatedStudent\.id \}\)/);
assert.match(scanRoute, /\.ilike\("rfid_card", rfidCard\)/);
assert.match(adviserAttendance, /event\.scope === "students" \|\| event\.scope === "accounts"/);

console.log("ICT RFID registration modal checks passed.");
