const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const sectionsApi = read("src/app/api/sections/route.ts");
const sessionsUi = read("src/app/dashboard/ict/user-management/create-user/page.tsx");
const deletionApi = read("src/app/api/scheduled-deletions/route.ts");
const deletionWorker = read("src/lib/processScheduledDeletions.ts");
const archival = read("src/lib/permanentDeletion.ts");
const userManagementApi = read("src/app/api/ict/user-management/route.ts");
const bulkUi = read("src/app/dashboard/ict/user-management/BulkDeletionModal.tsx");
const adviserBulkUi = read("src/app/dashboard/adviser/students/BulkDeleteModal.tsx");
const migration = read("supabase/legacy-migrations/20261105150000_ensure_occupied_sections_cannot_be_deleted.sql");
const scheduledDeletionMigration = read("supabase/legacy-migrations/20261111100000_enforce_one_active_scheduled_deletion_per_target.sql");
const deletionAccess = read("src/lib/deletionAccess.ts");

// The displayed count and server preflight ignore only explicitly archived or
// deleted students. An occupied section returns a clear conflict before delete.
assert.match(sectionsApi, /select\("id, archive_status"\)/);
assert.match(sectionsApi, /function isActiveStudent/);
assert.match(sectionsApi, /filter\(isActiveStudent\)\.length/);
assert.match(sectionsApi, /select\("section, archive_status"\)/);
assert.match(sectionsApi, /row\.section && isActiveStudent\(row\)/);
assert.match(sectionsApi, /code: "SECTION_IN_USE"/);
assert.match(sectionsApi, /Remove or reassign the students first/);
assert.match(sectionsApi, /isOccupiedSectionDatabaseError/);
assert.match(sectionsApi, /occupiedSectionRaceResponse/);

// The modal exposes counts and never stages an occupied section for deletion.
assert.match(sessionsUi, /\{sec\.count\} student/);
assert.match(sessionsUi, /const hasStudents = sec\.count > 0/);
assert.match(sessionsUi, /disabled=\{hasStudents \|\| hasStagedRename\}/);
assert.match(sessionsUi, /Remove or reassign them first/);
assert.match(sessionsUi, /Remove or reassign students first/);
assert.match(sessionsUi, /Remove or reassign the students before deleting this section/);
assert.match(sessionsUi, /requestDeleteSection\(grade, sec\.name, sec\.count\)/);

// PostgreSQL is the final protection against a student assignment racing the
// request after the API preflight.
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prevent_occupied_section_deletion/);
assert.match(migration, /lower\(coalesce\(student\.archive_status, 'active'\)\) NOT IN \('archived', 'deleted'\)/);
assert.match(migration, /BEFORE DELETE ON public\.sections/);
assert.match(migration, /ERRCODE = '23503'/);

// Immediate and due deletion archive the root only; history remains in place.
assert.match(archival, /ARCHIVABLE_TABLES/);
assert.match(archival, /archive_status: "archived"/);
assert.match(archival, /archive_status\.eq\.active,archive_status\.is\.null/);
assert.doesNotMatch(archival, /from\("attendance"\)\.delete/);
assert.match(deletionApi, /if \(action === "delete-now"\)[\s\S]*?await archiveTarget\(item/);
assert.match(deletionApi, /status: "Archived"/);
assert.match(deletionWorker, /await archiveTarget\(item/);
assert.match(deletionWorker, /status: "Archived"/);
assert.match(deletionWorker, /item\.target_type === "student"[\s\S]*?publishStudentRealtimeInvalidation/);
assert.match(userManagementApi, /await Promise\.all\(\[processDueScheduledDeletions\(\), processDueAdviserTransfers\(\)\]\)/);
assert.match(userManagementApi, /function isVisibleUserRecord/);

// ICT bulk selection is unpaginated, supports students and parents, and the
// server independently validates active root rows and existing requests.
assert.match(userManagementApi, /const bulkDeletionCandidates =/);
assert.match(userManagementApi, /advisers: adviserRows\.map/);
assert.match(userManagementApi, /guidance: guidanceRows\.map/);
assert.match(userManagementApi, /parents: parentRows\.map/);
assert.match(userManagementApi, /students: visibleStudents\.map/);
assert.match(bulkUi, /advisers: StaffCandidate\[\];/);
assert.match(bulkUi, /guidance: StaffCandidate\[\];/);
assert.match(bulkUi, /const staffUsers = useMemo/);
assert.match(bulkUi, /candidates\.advisers/);
assert.match(bulkUi, /candidates\.guidance/);
assert.match(bulkUi, /setKind\("student"\)/);
assert.match(bulkUi, /const candidateStudents = useMemo/);
assert.match(bulkUi, /type: "student"/);
assert.match(deletionApi, /requestedStudentIds/);
assert.match(deletionApi, /requestedParentIds/);
assert.match(deletionApi, /requestedAdviserIds/);
assert.match(deletionApi, /requestedGuidanceIds/);
assert.match(deletionApi, /from\("advisers"\)/);
assert.match(deletionApi, /from\("guidance_counselors"\)/);
assert.match(deletionApi, /staffName\(staff\)/);
assert.match(deletionApi, /import \{ isValidEmail \} from "@\/lib\/deletionEmailQueue"/);
assert.match(deletionApi, /const ictRecipientEmails = \[\.\.\.new Set\(\(ictAdmins \?\? \[\]\)/);
assert.match(deletionApi, /\.filter\(isValidEmail\)/);
assert.match(deletionApi, /from\("students"\)[\s\S]*?archive_status/);
assert.match(deletionApi, /from\("parents"\)[\s\S]*?archive_status/);
assert.match(deletionApi, /isActiveArchivableRecord/);
assert.match(deletionApi, /activeStudentRequests/);
assert.match(deletionApi, /activeParentRequests/);
assert.match(deletionApi, /activeAdviserRequests/);
assert.match(deletionApi, /activeGuidanceRequests/);
assert.match(deletionApi, /Each record can be selected only once for deletion/);
assert.match(deletionApi, /student \? studentName\(student\)/);
assert.match(deletionApi, /sendAccountDeletionScheduledEmail\(\{/);
assert.match(deletionApi, /isActiveScheduledDeletionConflict/);
assert.match(bulkUi, /onChanged\(\)/);

// Database uniqueness closes the interval between the route's preflight and
// its insert, including simultaneous ICT requests for the same staff member.
assert.match(scheduledDeletionMigration, /GROUP BY target_type, target_id/);
assert.match(scheduledDeletionMigration, /CREATE UNIQUE INDEX IF NOT EXISTS scheduled_deletions_one_active_target_idx/);
assert.match(scheduledDeletionMigration, /WHERE status IN \('PendingICT', 'Scheduled'\)/);

// ICT schedules independent root targets for a recoverable 30-day archive;
// it neither permanently deletes history nor silently archives a linked
// Parent when a Student is selected (or the reverse).
assert.match(deletionApi, /const deleteAfter = new Date\(Date\.now\(\) \+ THIRTY_DAYS\)\.toISOString\(\)/);
assert.match(deletionApi, /status: "Scheduled"/);
assert.match(deletionApi, /action === "restore"/);
assert.match(deletionApi, /action === "delete-now"/);
assert.match(deletionWorker, /\.eq\("status", "Scheduled"\)/);
assert.match(deletionWorker, /\.lte\("delete_after", now\)/);
assert.match(deletionWorker, /await archiveTarget\(item/);
assert.match(deletionAccess, /if \(item\.target_type === "parent"\)/);
assert.match(deletionAccess, /return \[\];/);
assert.match(archival, /Archives only the selected root record/);
assert.match(bulkUi, /function DeletionScopeNotice/);
assert.match(bulkUi, /Student selection affects only the selected student records/);
assert.match(bulkUi, /Parent Account selection affects only the selected account/);
assert.match(bulkUi, /Confirm immediate archive/);
assert.match(bulkUi, /does not permanently delete the record/);
assert.match(adviserBulkUi, /function StudentOnlyDeletionNotice/);
assert.match(adviserBulkUi, /This request applies only to the selected student records/);
assert.match(adviserBulkUi, /Parent or Guardian accounts remain active/);

console.log("ICT section and bulk-deletion regression checks passed.");
