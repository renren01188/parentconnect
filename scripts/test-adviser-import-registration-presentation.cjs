/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const modal = fs.readFileSync(
  path.join(root, "src/app/dashboard/adviser/students/ImportRegistrationModal.tsx"),
  "utf8",
);
const importRoute = fs.readFileSync(
  path.join(root, "src/app/api/students/import/route.ts"),
  "utf8",
);

// Duplicates must be loaded with enough current-record detail to identify the
// learner and their existing section. The client skips those rows before the
// detailed preview and the actual import request, rather than blocking every
// non-duplicate row in the file.
assert.match(importRoute, /select\("student_id, first_name, middle_name, last_name, suffix, section"\)/);
assert.match(importRoute, /const existingStudents = \(existing \?\? \[\]\)/);
assert.match(importRoute, /existingStudents, parentLinkSuggestions/);
assert.match(importRoute, /result\.rows\.filter\(\(row\) => !existingLrnSet\.has\(row\.lrn\)\)/);
assert.match(modal, /const importableRows = rows\?\.filter\(\(row\) => !existingLrns\.has\(row\.lrn\)\) \?\? \[\];/);
assert.match(modal, /body: JSON\.stringify\(\{ rows: importableRows, section, parentLinks \}\)/);
assert.match(modal, /Import \{importableRows\.length\} Student/);
assert.doesNotMatch(modal, /existing\.length > 0 \|\| unresolvedParentLinks/);

// The compact duplicate-row expander uses five records per page, identifies
// each existing learner, and keeps numbered navigation accessible. A 12-row
// file exercises the more-than-ten pagination boundary (5, 5, 2).
assert.match(modal, /Already Registered Students:/);
assert.match(modal, /\{showExistingStudents \? "Hide" : "View"\} \(\{existingStudents\.length\}\)/);
assert.match(modal, /const existingPageSize = 5;/);
assert.match(modal, /slice\(\(existingPage - 1\) \* existingPageSize, existingPage \* existingPageSize\)/);
assert.match(modal, /2xl:grid-cols-5/);
assert.match(modal, /student\.fullName/);
assert.match(modal, /LRN \{student\.lrn\}/);
assert.match(modal, /Section: <strong>\{student\.section\}<\/strong>/);
assert.match(modal, /aria-current=\{pageNumber === existingPage \? "page" : undefined\}/);
const duplicateFixture = Array.from({ length: 12 }, (_, index) => ({ lrn: String(index) }));
const pages = Array.from({ length: Math.ceil(duplicateFixture.length / 5) }, (_, index) => duplicateFixture.slice(index * 5, (index + 1) * 5));
assert.deepEqual(pages.map((page) => page.length), [5, 5, 2]);

// Only candidates with an active Parent account appear in the linking review.
// Unmatched learners have no card, while ambiguous candidates retain their
// existing explicit account selection control. A link is only labelled as
// already saved when the relationship lookup confirms it.
assert.match(modal, /const linkableSuggestions = suggestions\.filter\(\(suggestion\) => suggestion\.candidates\.length > 0\);/);
assert.match(modal, /const parentLinkRows = importableRows\.filter/);
assert.match(modal, /\{parentLinkRows\.length > 0 && <section/);
assert.match(modal, /Will be linked to \$\{candidate\.displayName\} when imported/);
assert.match(modal, /Already linked to \$\{candidate\.displayName\}/);
assert.match(modal, /Choose the correct Parent account/);
assert.match(importRoute, /select\("parent_id, student_id"\)/);
assert.match(importRoute, /isAlreadyLinked: existingLinkKeys\.has/);
assert.doesNotMatch(modal, /Not Registered: Waiting to Sign Up/);

console.log("adviser import-registration presentation checks passed");
