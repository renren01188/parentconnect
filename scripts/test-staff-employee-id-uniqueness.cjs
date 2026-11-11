const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/legacy-migrations/20261019100000_enforce_global_staff_employee_ids.sql");
const employeeIdLib = read("src/lib/staffEmployeeId.ts");
const adviserRegister = read("src/app/api/adviser/register/route.ts");
const ictRegister = read("src/app/api/ict/register/route.ts");
const guidanceRegister = read("src/app/api/guidance/register/route.ts");
const principalSuccession = read("src/app/api/principal/succession/route.ts");
const userManagement = read("src/app/api/ict/user-management/route.ts");
const ictProfile = read("src/app/api/ict/me/route.ts");
const principalProfile = read("src/app/api/principal/me/route.ts");
const guidanceProfile = read("src/app/api/guidance/me/route.ts");
const guidanceApproval = read("src/app/api/ict/approvals/route.ts");
const conflictsRoute = read("src/app/api/ict/staff-employee-id-conflicts/route.ts");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.staff_employee_ids/);
assert.match(migration, /employee_id_key text PRIMARY KEY/);
assert.match(migration, /CREATE OR REPLACE VIEW public\.staff_employee_id_conflicts/);
assert.match(migration, /ERRCODE = '23505'/);
for (const table of ["advisers", "ict_admins", "guidance_counselors", "principals"]) {
  assert.match(migration, new RegExp(`AFTER INSERT OR UPDATE OF employee_id OR DELETE ON public\\.${table}`));
}
assert.match(migration, /FOR EACH ROW EXECUTE FUNCTION public\.sync_staff_employee_id_registry/);

assert.match(employeeIdLib, /assertStaffEmployeeIdAvailable/);
assert.match(employeeIdLib, /staff_employee_ids/);
assert.match(employeeIdLib, /StaffEmployeeIdConflictError/);

for (const route of [adviserRegister, ictRegister, guidanceRegister, principalSuccession]) {
  assert.match(route, /await assertStaffEmployeeIdAvailable/);
  assert.match(route, /isStaffEmployeeIdConflict/);
}
for (const route of [userManagement, ictProfile, principalProfile, guidanceProfile, guidanceApproval]) {
  assert.match(route, /assertStaffEmployeeIdAvailable/);
  assert.match(route, /isStaffEmployeeIdConflict/);
}
assert.match(userManagement, /role: "ICT", id/);
assert.match(userManagement, /role: "Guidance", id/);
assert.match(userManagement, /role: "Adviser", id/);
assert.match(conflictsRoute, /staff_employee_id_conflicts/);
assert.match(conflictsRoute, /getActiveIct/);

console.log("Staff Employee ID uniqueness checks passed.");
