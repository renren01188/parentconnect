/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const agreement = read("src/components/reports/ConcernViewAgreement.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");

assert.match(agreement, /Terms and Agreement/);
assert.match(agreement, /If this concern is escalated to the Principal, the Principal will be able to view the full conversation, including all previous messages and replies\./);
assert.match(agreement, /I understand that the Principal can view the full conversation if this concern is escalated\./);
assert.match(agreement, /type="checkbox"/);
assert.match(agreement, /checked=\{checked\}/);
assert.match(agreement, /onCheckedChange\(event\.target\.checked\)/);

// Parent and Student/Subject Teacher concerns each have an independent gate
// on the Adviser page. Selecting either concern clears the acknowledgement.
assert.match(adviserReports, /import \{ ConcernViewAgreement \} from "@\/components\/reports\/ConcernViewAgreement"/);
assert.equal((adviserReports.match(/<ConcernViewAgreement/g) ?? []).length, 2);
assert.match(adviserReports, /function selectReport\(r: Report\) \{\s*setViewAgreementConcernKey\(null\);/);
assert.match(adviserReports, /function selectStudentReport\(r: StudentReport\) \{\s*setViewAgreementConcernKey\(null\);/);
assert.match(adviserReports, /checked=\{viewAgreementConcernKey === `parent:\$\{selectedReport\.id\}`\}/);
assert.match(adviserReports, /onCheckedChange=\{\(checked\) => setViewAgreementConcernKey\(checked \? `parent:\$\{selectedReport\.id\}` : null\)\}/);
assert.match(adviserReports, /disabled=\{viewAgreementConcernKey !== `parent:\$\{selectedReport\.id\}`\}/);
assert.match(adviserReports, /checked=\{viewAgreementConcernKey === `student:\$\{selectedStudRep\.id\}`\}/);
assert.match(adviserReports, /onCheckedChange=\{\(checked\) => setViewAgreementConcernKey\(checked \? `student:\$\{selectedStudRep\.id\}` : null\)\}/);
assert.match(adviserReports, /disabled=\{viewAgreementConcernKey !== `student:\$\{selectedStudRep\.id\}`\}/);

// Guidance uses the same agreement and resets its local acknowledgement when
// a different report is opened. The existing view action remains the only
// action called from its gated button.
assert.match(guidanceReports, /import \{ ConcernViewAgreement \} from "@\/components\/reports\/ConcernViewAgreement"/);
assert.equal((guidanceReports.match(/<ConcernViewAgreement/g) ?? []).length, 1);
assert.match(guidanceReports, /function selectReport\(r: Report\) \{\s*setViewAgreementConcernKey\(null\);/);
assert.match(guidanceReports, /checked=\{viewAgreementConcernKey === selectedReport\.id\}/);
assert.match(guidanceReports, /onCheckedChange=\{\(checked\) => setViewAgreementConcernKey\(checked \? selectedReport\.id : null\)\}/);
assert.match(guidanceReports, /disabled=\{viewAgreementConcernKey !== selectedReport\.id\}/);
assert.match(guidanceReports, /disabled=\{viewAgreementConcernKey !== selectedReport\.id\}[\s\S]*?onClick=\{\(\) => markGuidanceSeen\(selectedReport\.id\)\}/);

console.log("report concern view agreement checks passed");
