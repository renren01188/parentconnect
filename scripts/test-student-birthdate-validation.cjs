/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const form = read("src/components/student-parent-registration/StudentParentRegistration.tsx");
const api = read("src/app/api/students/route.ts");
const birthDate = read("src/lib/studentBirthDate.ts");

// Date-only values are validated as calendar keys, so they cannot shift when
// a browser or server uses a different timezone.
assert.match(birthDate, /ISO_DATE_PATTERN/);
assert.match(birthDate, /Date\.UTC\(year, month - 1, day\)/);
assert.match(birthDate, /text > localToday/);
assert.match(birthDate, /Birth date cannot be in the future\./);
assert.match(birthDate, /MINIMUM_STUDENT_REGISTRATION_AGE = 4/);
assert.match(birthDate, /latestStudentRegistrationBirthDate/);
assert.match(birthDate, /normalizeStudentRegistrationBirthDate/);
assert.match(birthDate, /Birth date is required\./);
assert.match(birthDate, /Student must be at least \$\{MINIMUM_STUDENT_REGISTRATION_AGE\} years old\./);

// The adviser form caps the picker at the fourth birthday boundary and keeps
// the derived age read-only.
assert.match(form, /const localToday = getSchoolClock\(\)\.date/);
assert.match(form, /latestStudentRegistrationBirthDate\(localToday\)/);
assert.match(form, /normalizeStudentRegistrationBirthDate\(form\.birthDate, localToday\)/);
assert.match(form, /type="date"\s+max=\{latestBirthDate\}/);
assert.match(form, /calculateStudentAge\(value, localToday\)/);
assert.match(form, /readOnly aria-readonly="true"/);
assert.match(form, /error=\{E\.birthDate\}/);
assert.match(form, /onBlur=\{\(\) => touch\("birthDate"\)\}/);
assert.doesNotMatch(form, /remarkDate[\s\S]{0,300}max=\{localToday\}/);

// The server independently rejects a crafted under-age request and derives
// the stored age from its validated birth date.
assert.match(api, /normalizeStudentRegistrationBirthDate\(birthDate, localToday\)/);
assert.match(api, /message: normalizedBirthDate\.error/);
assert.match(api, /calculateStudentAge\(normalizedBirthDate\.value, localToday\)/);
assert.match(api, /birth_date: normalizedBirthDate\.value/);
assert.match(api, /age: normalizedCalculatedAge\.value/);

console.log("Student birthdate validation checks passed.");
