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

// The adviser form caps only its birth-date picker and preserves invalid input
// long enough to explain the error to the user.
assert.match(form, /const localToday = getSchoolClock\(\)\.date/);
assert.match(form, /normalizeStudentBirthDate\(form\.birthDate, localToday\)/);
assert.match(form, /type="date"\s+max=\{localToday\}/);
assert.match(form, /error=\{E\.birthDate\}/);
assert.match(form, /onBlur=\{\(\) => touch\("birthDate"\)\}/);
assert.doesNotMatch(form, /remarkDate[\s\S]{0,300}max=\{localToday\}/);

// The server independently rejects a manually crafted future-date request
// before it inserts the student record.
assert.match(api, /normalizeStudentBirthDate\(birthDate, getSchoolClock\(\)\.date\)/);
assert.match(api, /message: normalizedBirthDate\.error/);
assert.match(api, /birth_date: normalizedBirthDate\.value/);

console.log("Student birthdate validation checks passed.");
