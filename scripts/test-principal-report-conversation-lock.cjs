/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function loadPrincipalReportMapper() {
  const source = read("src/app/api/reports/parent-adviser/_lib.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  const requireStub = (request) => {
    if (request === "next/headers") return { cookies: async () => ({ get: () => undefined }) };
    if (request === "jose") return { jwtVerify: async () => ({ payload: {} }) };
    if (request === "@/lib/supabase") return { supabase: {} };
    if (request === "@/lib/adviserReportStatusSummary") return { effectiveAdviserReportStatus: () => "new" };
    if (request === "@/lib/getAdviserFromToken") return { getAdviserFromToken: async () => null };
    if (request === "@/lib/parentAccountAccess") return { parentAccountCanAccess: () => false };
    if (request === "@/lib/principalReportReadState.cjs") {
      return {
        hasUnreadForPrincipal: ({ messages }) => messages.some((message) => message.sender_role === "parent"),
      };
    }
    if (request === "@/lib/passwordSessionRevocationStore") return { isPasswordSessionRevoked: async () => false };
    if (request === "@/lib/dashboardIdleSession") return { isCurrentDashboardIdleSession: () => true };
    throw new Error(`Unexpected import in report mapper test: ${request}`);
  };

  vm.runInNewContext(compiled, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: requireStub,
    process,
    console,
    TextEncoder,
    Intl,
    Date,
    Map,
    Set,
  });
  return loadedModule.exports;
}

const report = {
  id: 81,
  parent_id: 18,
  parent_email: "parent@example.test",
  parent_name: "Pat Parent",
  adviser_id: 5,
  adviser_name: "Ada Adviser",
  student_id: "S-81",
  student_name: "Sam Student",
  grade: "6",
  section: "A",
  subject: "Private concern",
  categories: ["Behavioral Issue"],
  concern_level: 80,
  allow_history_access: true,
  status: "escalated",
  escalated_to_guidance: true,
  escalated_to_principal: false,
  guidance_seen_at: null,
  parent_seen_at: null,
  status_updated_at: "2026-10-27T00:00:00.000Z",
  created_at: "2026-10-27T00:00:00.000Z",
  updated_at: "2026-10-27T00:00:00.000Z",
  last_message_at: "2026-10-27T00:00:00.000Z",
};

const messages = [
  {
    id: 1,
    report_id: report.id,
    sender_role: "parent",
    sender_name: report.parent_name,
    body: "Private parent message",
    thread_type: "adviser",
    attachments: [{ name: "private-note.pdf", type: "application/pdf", size: 1, dataUrl: "data:application/pdf;base64,AA==" }],
    created_at: report.created_at,
    read_by_parent: true,
    read_by_adviser: true,
  },
  {
    id: 2,
    report_id: report.id,
    sender_role: "guidance",
    sender_name: "Gina Guidance",
    body: "Private Guidance reply",
    thread_type: "guidance",
    attachments: [],
    created_at: "2026-10-27T00:01:00.000Z",
    read_by_parent: false,
    read_by_adviser: true,
  },
];

const { toPrincipalReport } = loadPrincipalReportMapper();
const locked = toPrincipalReport(report, messages);
assert.equal(locked.conversationAvailable, false);
assert.equal(locked.canReply, false);
assert.equal(locked.hasUnreadForPrincipal, false);
assert.equal(locked.message, "");
assert.equal(locked.attachments.length, 0);
assert.equal(locked.replies.length, 0);

const escalated = toPrincipalReport({ ...report, escalated_to_principal: true }, messages);
assert.equal(escalated.conversationAvailable, true);
assert.equal(escalated.canReply, true);
assert.equal(escalated.message, "Private parent message");
assert.equal(escalated.replies.length, 2);
assert.equal(escalated.replies[1].message, "Private Guidance reply");

const principalRoute = read("src/app/api/reports/parent-adviser/route.ts");
const principalStatusRoute = read("src/app/api/reports/principal/[id]/status/route.ts");
const principalPage = read("src/app/dashboard/principal/reports/page.tsx");

assert.match(principalRoute, /const conversationRows = rows\.filter\(\(row\) => Boolean\(row\.escalated_to_principal\)\)/);
assert.match(principalRoute, /\(summary \? listMessageSummaries : listMessages\)\(conversationRows\.map\(\(row\) => row\.id\)\)/);
assert.match(principalStatusRoute, /report\.escalated_to_principal\s*\? await listMessages\(\[reportId\]\)\s*:\s*new Map\(\)/);
assert.match(principalPage, /const conversationAvailable = selectedReport\.conversationAvailable === true/);
assert.match(principalPage, /if \(!conversationAvailable\)/);
assert.match(principalPage, /This conversation will be available after Guidance escalates the report to the Principal\./);
assert.match(principalPage, /blur-\[7px\] select-none pointer-events-none/);
assert.match(principalPage, /refreshReportDetailAfterInFlight\(event\.reportId\)/);
assert.doesNotMatch(principalPage, /unlockedReports|unlockReport|Start Conversation/);

console.log("Principal report conversation lock checks passed.");
