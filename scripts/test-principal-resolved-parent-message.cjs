/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20261105140000_link_principal_parent_messages_to_reports.sql");
const route = read("src/app/api/reports/principal/[id]/parent-message/route.ts");
const staffMessages = read("src/app/api/reports/staff-messages/route.ts");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");
const parentReports = read("src/app/dashboard/parent/reports/page.tsx");

// The delivery record lives in the existing School Messages table and only
// receives an optional source-report link. The report workflow itself is not
// changed or reopened by this migration.
assert.match(migration, /ALTER TABLE public\.staff_messages[\s\S]*?ADD COLUMN IF NOT EXISTS report_id bigint/);
assert.match(migration, /REFERENCES public\.parent_adviser_reports\(id\) ON DELETE SET NULL/);
assert.match(migration, /CREATE INDEX IF NOT EXISTS staff_messages_report_id_created_at_idx/);
assert.doesNotMatch(migration, /UPDATE public\.parent_adviser_reports|DELETE FROM public\.parent_adviser_reports/i);

// Both reads and writes require a Principal session and only authorize
// reports currently resolved by an Adviser or Guidance. The report message
// table is intentionally never touched.
assert.match(route, /const principal = await getPrincipalSession\(\)/);
assert.match(route, /String\(report\.status\)\.toLowerCase\(\) !== "resolved"/);
assert.match(route, /resolver !== "Adviser" && resolver !== "Guidance"/);
assert.match(route, /isPrincipalVisibleReport\(report\)/);
assert.doesNotMatch(route, /parent_adviser_report_messages/);
assert.doesNotMatch(route, /\.from\("parent_adviser_reports"\)\.update/);

// The server independently validates both the client-declared and decoded
// attachment sizes before storing anything.
assert.match(route, /const MAX_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
assert.match(route, /Buffer\.from\(match\[2\], "base64"\)/);
assert.match(route, /bytes\.byteLength !== size \|\| bytes\.byteLength > MAX_ATTACHMENT_BYTES/);
assert.match(route, /You can attach up to \$\{MAX_ATTACHMENTS\} files/);

// A saved message remains a root School Message with its report link, then
// wakes the authenticated Parent and Principal and schedules email delivery.
assert.match(route, /\.from\("staff_messages"\)[\s\S]*?report_id: reportId,[\s\S]*?status: "unread"/);
assert.match(route, /\{ role: "principal", id: principal\.id \},[\s\S]*?\{ role: "parent", id: parent\.id \}/);
assert.match(route, /scope: "staff-messages",[\s\S]*?reportId,/);
assert.match(route, /after\(async \(\) =>[\s\S]*?sendStaffMessageEmail/);
assert.match(route, /parentAccountCanAccess\(data\)/);

// Parent replies keep the optional link, allowing the report-level panel to
// display the separate thread while normal School Messages behavior remains.
assert.match(staffMessages, /report_id: Number\(root\.report_id\) \|\| null/);
assert.match(parentReports, /fetch\("\/api\/reports\/staff-messages\?role=parent/);

// The Principal page uses a visible modal, client-side 10 MB validation, a
// report-specific panel, and the existing staff-message Realtime scope.
assert.match(principalReports, /function canSendResolvedReportParentMessage/);
assert.match(principalReports, /report\.resolvedByRole === "Adviser" \|\| report\.resolvedByRole === "Guidance"/);
assert.match(principalReports, /function ResolvedReportParentMessageModal/);
assert.match(principalReports, /Send Message to Parent/);
assert.match(principalReports, /is over the 10 MB attachment limit/);
assert.match(principalReports, /function PrincipalReportParentMessages/);
assert.match(principalReports, /Separate School Messages for this resolved report\. They do not reopen the locked report conversation\./);
assert.match(principalReports, /fetch\(`\/api\/reports\/principal\/\$\{report\.id\}\/parent-message`/);
assert.match(principalReports, /event\.reportId && selectedReport\?\.id === event\.reportId[\s\S]*?loadResolvedReportParentMessages/);

console.log("principal resolved Parent-message checks passed");
