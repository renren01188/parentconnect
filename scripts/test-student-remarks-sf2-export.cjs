/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const XLSX = require("xlsx");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20261021120000_add_student_sf1_remarks.sql");
const registration = read("src/components/student-parent-registration/StudentParentRegistration.tsx");
const createStudentApi = read("src/app/api/students/route.ts");
const detailApi = read("src/app/api/students/[id]/route.ts");
const remarksApi = read("src/app/api/students/remarks/route.ts");
const monthlyApi = read("src/app/api/attendance/monthly/route.ts");
const attendancePage = read("src/app/dashboard/adviser/attendance/page.tsx");
const detailPage = read("src/app/dashboard/adviser/students/[id]/page.tsx");
const studentRemarks = read("src/lib/studentRemarks.ts");
const principalSummaryApi = read("src/app/api/attendance/monthly-summary/route.ts");
const principalAttendancePage = read("src/app/dashboard/principal/AttendanceSummary/page.tsx");
const ictStudentsApi = read("src/app/api/ict/students/route.ts");
const ictStudentProfileApi = read("src/app/api/ict/students/[id]/route.ts");
const ictStudentProfilesPage = read("src/app/dashboard/ict/StudentProfiles/page.tsx");
const ictUserManagementApi = read("src/app/api/ict/user-management/route.ts");
const ictUserManagementPage = read("src/app/dashboard/ict/user-management/page.tsx");
const parentRemarksMigration = read("supabase/migrations/20261021130000_add_parent_account_remarks.sql");

// Dated records are student-ID based, constrained to the three SF2 remark
// types, and retain a transfer school or dropout reason without touching
// attendance/student rows.
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.student_remarks/);
assert.match(migration, /student_db_id integer NOT NULL/);
assert.match(migration, /REFERENCES public\.students\(id\) ON DELETE CASCADE/);
assert.match(migration, /'Dropped out', 'Transferred In', 'Transferred Out'/);
assert.match(migration, /student_remarks_student_type_date_unique/);
assert.match(migration, /student_remarks_student_date_idx/);
assert.doesNotMatch(migration, /DELETE FROM public\.students/);

const compiledRemarks = ts.transpileModule(studentRemarks, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const remarkModule = { exports: {} };
vm.runInNewContext(compiledRemarks, { module: remarkModule, exports: remarkModule.exports });
const { normalizeStudentRemark, formatStudentRemarkForSf2 } = remarkModule.exports;
for (const input of [
  { type: "Dropped out", date: "2026-10-09", note: "b.6 Lack of interest" },
  { type: "Transferred In", date: "2026-10-10", schoolName: "Example Elementary School" },
  { type: "Transferred Out", date: "2026-10-11", schoolName: "Newtown Elementary School" },
]) {
  const normalized = normalizeStudentRemark(input);
  assert.equal(normalized.error, null);
  assert.ok(normalized.value);
}
assert.match(normalizeStudentRemark({ type: "Dropped out", date: "2026-10-09" }).error, /reason/i);
assert.match(normalizeStudentRemark({ type: "Transferred In", date: "2026-10-10" }).error, /school name/i);
assert.match(formatStudentRemarkForSf2({ remark_type: "Transferred In", effectivity_date: "2026-10-10", school_name: "Example Elementary School" }), /Example Elementary School.*10\/10\/2026/);

// Registration, profile editing, and the export action share the same save
// shape instead of maintaining competing student fields.
assert.match(registration, /STUDENT_REMARK_OPTIONS/);
assert.match(registration, /School Transferred From/);
assert.match(registration, /remarkType: "", remarkDate: "", remarkNote: "", remarkSchoolName: ""/);
assert.match(createStudentApi, /normalizeStudentRemark/);
assert.match(createStudentApi, /from\("student_remarks"\)\.insert/);
assert.match(detailApi, /latest_remark/);
assert.match(detailApi, /from\("student_remarks"\)[\s\S]*?\.upsert/);
assert.match(detailPage, /SF2 Remarks/);
assert.match(remarksApi, /Student not found in your assigned class/);
assert.match(remarksApi, /from\("student_remarks"\)[\s\S]*?\.insert\(/);
assert.match(remarksApi, /This student already has a saved remark/);
assert.match(remarksApi, /View Actions on the Students page/);
assert.match(remarksApi, /effectivity date must be in the selected export month/i);
assert.match(attendancePage, /const \[remarkDate, setRemarkDate\] = useState\(""\)/);
assert.match(attendancePage, /min=\{selectedMonthStart\} max=\{selectedMonthEnd\}/);
assert.match(attendancePage, /selectedRemarkStudentHasSavedRemark/);

// The monthly API reads dated records in the requested month, counts unique
// students by gender/type, and the workbook writer uses the template's real
// Remarks column and three summary rows.
assert.match(monthlyApi, /from\("student_remarks"\)/);
assert.match(monthlyApi, /gte\("effectivity_date", monthStart\)/);
assert.match(monthlyApi, /remarksByStudentId/);
assert.match(monthlyApi, /remarkSummary/);
assert.match(attendancePage, /`AQ\$\{row\}`/);
assert.match(attendancePage, /summaryStartRow \+ 16/);
assert.match(attendancePage, /summaryStartRow \+ 18/);
assert.match(attendancePage, /summaryStartRow \+ 20/);
assert.match(attendancePage, /Save Remark/);
// The official SF2 sheet preserves the varied fonts and alignment supplied
// by the template. Only the app-generated Attendance Detail sheet is
// normalized for readability.
assert.doesNotMatch(attendancePage, /setWorksheetFontSize\(ws, 9\)/);
assert.doesNotMatch(attendancePage, /setSf2DateHeader[\s\S]*?cell\.alignment\s*=/);
assert.match(attendancePage, /setAttendanceDetailFontSize\(detailWs, 9\)/);
assert.match(attendancePage, /function cloneExcelStyle/);
assert.doesNotMatch(attendancePage, /targetCell\.style = sourceCell\.style/);

// The Principal export reads the same dated source for the selected month,
// writes the template's Remarks column, and uses the identical three summary
// rows rather than separate sample values or a hard-coded school header.
assert.match(principalSummaryApi, /from\("student_remarks"\)/);
assert.match(principalSummaryApi, /gte\("effectivity_date", remarkPeriodStart\)/);
assert.match(principalSummaryApi, /remarksByStudentDbId/);
assert.match(principalAttendancePage, /formatStudentRemarkForSf2/);
assert.match(principalAttendancePage, /`AQ\$\{row\}`/);
assert.match(principalAttendancePage, /summaryStartRow \+ 16/);
assert.match(principalAttendancePage, /summaryStartRow \+ 18/);
assert.match(principalAttendancePage, /summaryStartRow \+ 20/);
assert.doesNotMatch(principalAttendancePage, /setWorksheetFontSize\(ws, 9\)/);
assert.doesNotMatch(principalAttendancePage, /setSf2DateHeader[\s\S]*?cell\.alignment\s*=/);
assert.match(principalAttendancePage, /setAttendanceDetailFontSize\(detailWs, 9\)/);
assert.match(principalAttendancePage, /function cloneExcelStyle/);
assert.doesNotMatch(principalAttendancePage, /target\.style = source\.style/);
assert.doesNotMatch(principalAttendancePage, /setCellValue\(ws, "F3", 107966\)/);
assert.doesNotMatch(principalAttendancePage, /setCellValue\(ws, "F4", "Santiago Elementary School"\)/);

// ICT registration uses the shared registration form. ICT student profile
// editing loads/updates student_remarks, while parent notes have their own
// parents column and cannot feed an SF2 export.
assert.match(ictStudentsApi, /latest_remark/);
assert.match(ictStudentProfileApi, /normalizeStudentRemark/);
assert.match(ictStudentProfileApi, /from\("student_remarks"\)[\s\S]*?\.update\(payload\)/);
assert.match(ictStudentProfilesPage, /School Transferred From/);
assert.match(ictStudentProfilesPage, /Student Remark/);
assert.match(parentRemarksMigration, /ADD COLUMN IF NOT EXISTS parent_remarks text/);
assert.match(ictUserManagementApi, /parent_remarks/);
assert.match(ictUserManagementPage, /Parent account note/);
assert.match(ictUserManagementPage, /never changes a linked student/);

const workbook = XLSX.readFile(path.join(root, "public/SF2_2025_newtemplate.xlsx"));
const sheet = workbook.Sheets[workbook.SheetNames[0]];
assert.match(String(sheet.AQ5?.v), /REMARKS/i);
assert.equal(sheet.AM65?.v, "Dropped out");
assert.equal(sheet.AM67?.v, "Transferred out");
assert.equal(sheet.AM69?.v, "Transferred in");

console.log("Student remarks and SF2 export regression checks passed.");
