/* eslint-disable no-console */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

function normalizeAge(value) {
  if (value === null || value === undefined || value === "") return { value: null, error: null };
  const text = (typeof value === "string" || typeof value === "number") ? String(value).trim() : "";
  if (!/^\d{1,3}$/.test(text)) return { value: null, error: "invalid" };
  const age = Number(text);
  return Number.isSafeInteger(age) && age >= 1 && age <= 120
    ? { value: age, error: null }
    : { value: null, error: "invalid" };
}

function calculateAge(birthDate, today) {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) age--;
  return age;
}

assert.deepEqual(normalizeAge("12"), { value: 12, error: null });
assert.deepEqual(normalizeAge(120), { value: 120, error: null });
assert.deepEqual(normalizeAge(""), { value: null, error: null });
assert.equal(normalizeAge("0").error, "invalid");
assert.equal(normalizeAge("121").error, "invalid");
assert.equal(normalizeAge("12.5").error, "invalid");
assert.equal(normalizeAge("twelve").error, "invalid");
assert.equal(calculateAge("2022-11-10", "2026-11-10"), 4);
assert.equal(calculateAge("2022-11-11", "2026-11-10"), 3);
assert.equal(calculateAge("2014-12-01", "2026-11-10"), 11);

const registration = read("src", "components", "student-parent-registration", "StudentParentRegistration.tsx");
assert.match(registration, /normalizeStudentAge/);
assert.match(registration, /age:\s*""/);
assert.match(registration, /Field label="Age"/);
assert.match(registration, /ageValidation\.error/);
assert.match(registration, /calculateStudentAge\(value, localToday\)/);
assert.match(registration, /readOnly aria-readonly="true"/);
assert.doesNotMatch(registration, /set\("age", e\.target\.value\)/);

const createStudent = read("src", "app", "api", "students", "route.ts");
assert.match(createStudent, /calculateStudentAge\(normalizedBirthDate\.value, localToday\)/);
assert.match(createStudent, /normalizeStudentAge\(calculatedAge\)/);
assert.match(createStudent, /age:\s*normalizedCalculatedAge\.value/);

const profile = read("src", "app", "dashboard", "ict", "StudentProfiles", "page.tsx");
assert.match(profile, /FInput label="LRN"/);
assert.match(profile, /FInput label="Age"/);
assert.match(profile, /age:\s*row\.age == null \? "" : String\(row\.age\)/);

const adviserDetailApi = read("src", "app", "api", "students", "[id]", "route.ts");
assert.match(adviserDetailApi, /birth_date, age, mother_tongue/);
assert.match(adviserDetailApi, /age:\s*student\.age/);
const adviserDetail = read("src", "app", "dashboard", "adviser", "students", "[id]", "page.tsx");
assert.match(adviserDetail, /student\.age == null \? getStudentAge\(student\.birth_date\) : String\(student\.age\)/);

const ictPatch = read("src", "app", "api", "ict", "students", "[id]", "route.ts");
assert.match(ictPatch, /normalizeStudentAge\(body\.age\)/);
assert.match(ictPatch, /age:\s*normalizedAge\.value/);
assert.match(ictPatch, /select\("id, class_session"\)/);
assert.match(ictPatch, /class_session:\s*validSection\.class_session \?\? existing\.class_session \?\? null/);
assert.match(ictPatch, /pending transfer/i);
assert.doesNotMatch(ictPatch, /from\("attendance_logs"\)\.update/);

const migration = read("supabase", "migrations", "20261021140000_validate_student_age.sql");
assert.match(migration, /ADD COLUMN IF NOT EXISTS age integer/);
assert.match(migration, /age IS NULL OR age BETWEEN 1 AND 120/);

console.log("Student age and current-assignment safeguards verified.");
