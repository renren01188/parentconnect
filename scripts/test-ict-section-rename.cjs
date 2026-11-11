/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const sectionApi = read("src/app/api/sections/route.ts");
const createUserPage = read("src/app/dashboard/ict/user-management/create-user/page.tsx");
const migration = read("supabase/legacy-migrations/20261021100000_rename_sections_in_place.sql");
const ambiguityRepairMigration = read("supabase/legacy-migrations/20261111103000_fix_section_rename_column_ambiguity.sql");

// The client has an explicit rename action and checks every section in the
// grade, not merely the currently visible class-session tab.
assert.match(createUserPage, /Pencil/);
assert.match(createUserPage, />\s*Rename\s*</);
assert.match(createUserPage, /const requestRenameSection = async/);
assert.match(createUserPage, /api\/sections\?grade=/);
assert.match(createUserPage, /already exists in \$\{grade\}\. Choose a different name/);
assert.match(createUserPage, /type: "rename"/);
assert.match(createUserPage, /id: action\.sectionId, new_name: action\.newSectionName/);

// A rename is accepted only with a stable section ID and is handled by the
// in-place database RPC. Its conflict responses are clear to the ICT user.
assert.match(sectionApi, /type: "rename"/);
assert.match(sectionApi, /typeof candidate\.new_name !== "string"/);
assert.match(sectionApi, /code: "SECTION_NAME_EXISTS"/);
assert.match(sectionApi, /Section \\"\$\{name\}\\" already exists in \$\{grade\}\. Choose a different name/);
assert.match(sectionApi, /supabase\.rpc\("rename_sections", \{/);
assert.match(sectionApi, /id: change\.id/);
assert.match(sectionApi, /old_name: change\.name/);
assert.match(sectionApi, /new_name: change\.new_name/);
assert.match(sectionApi, /select\("id, name, class_session"\)/);

// The migration updates the existing row, preserves id/class_session, blocks
// case-insensitive duplicates, and cascades all live display references.
assert.match(migration, /sections_grade_name_case_insensitive_key/);
assert.match(migration, /lower\(btrim\(grade\)\), lower\(btrim\(name\)\)/);
assert.match(migration, /ON UPDATE CASCADE/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rename_section/);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rename_sections\(p_renames jsonb\)/);
assert.match(migration, /PERFORM public\.rename_section/);
assert.match(migration, /WHERE sections\.id = p_section_id/);
assert.match(migration, /UPDATE public\.sections\s+SET name = v_new_name/);
assert.match(migration, /RETURNING \* INTO v_section/);
assert.match(migration, /SECTION_NAME_EXISTS/);
assert.match(migration, /UPDATE public\.students\s+SET target_section = v_new_name/);
assert.match(migration, /UPDATE public\.advisers/);
assert.match(migration, /UPDATE public\.parent_adviser_reports/);
assert.match(migration, /UPDATE public\.student_reports/);
assert.match(migration, /UPDATE public\.parent_announcement_notifications/);
assert.match(migration, /UPDATE public\.adviser_announcements/);
assert.match(migration, /UPDATE public\.scheduled_adviser_transfers/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.rename_section/);

// The original routine returns columns named id/name/grade/class_session.
// A forward repair must therefore qualify every table reference so a staged
// rename cannot fail with PostgreSQL 42702 (ambiguous "grade").
assert.match(ambiguityRepairMigration, /CREATE OR REPLACE FUNCTION public\.rename_section/);
assert.match(ambiguityRepairMigration, /FROM public\.sections AS section_row/);
assert.match(ambiguityRepairMigration, /section_row\.grade = v_grade/);
assert.match(ambiguityRepairMigration, /UPDATE public\.sections AS section_row/);
assert.match(ambiguityRepairMigration, /UPDATE public\.advisers AS adviser_row/);
assert.match(ambiguityRepairMigration, /adviser_row\.grade = v_grade/);
assert.match(ambiguityRepairMigration, /UPDATE public\.student_reports AS report_row/);
assert.match(ambiguityRepairMigration, /report_row\.grade = v_grade/);
assert.match(ambiguityRepairMigration, /UPDATE public\.scheduled_adviser_transfers AS transfer_row/);
assert.match(ambiguityRepairMigration, /transfer_row\.grade = v_grade/);
assert.match(ambiguityRepairMigration, /REVOKE ALL ON FUNCTION public\.rename_section/);
assert.match(ambiguityRepairMigration, /GRANT EXECUTE ON FUNCTION public\.rename_section\(integer, text, text, text\) TO service_role/);
assert.doesNotMatch(ambiguityRepairMigration, /\bWHERE grade = v_grade\b/);
assert.doesNotMatch(ambiguityRepairMigration, /\bAND grade = v_grade\b/);

console.log("ICT section rename regression checks passed.");
