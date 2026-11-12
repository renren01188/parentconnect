/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const parentPage = read("src/app/dashboard/parent/reports/page.tsx");
const parentData = read("src/app/dashboard/parent/data.ts");
const reportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const ticketRoute = read("src/app/api/reports/parent-adviser/[id]/ticket/route.ts");
const statusRoute = read("src/app/api/reports/parent-adviser/[id]/status/route.ts");
const migration = read("supabase/migrations/20261112150000_add_parent_guidance_ticket_eligibility.sql");

assert.match(parentData, /createdAt\?: string;/, "The parent report type must retain the raw original submission timestamp.");
assert.match(reportMapper, /createdAt: row\.created_at/, "The Parent report response must use the report creation time, not reply activity.");
assert.match(parentPage, /GUIDANCE_TICKET_WAIT_MS = 72 \* 60 \* 60 \* 1000/, "The client wait must be exactly 72 hours.");
assert.match(parentPage, /Date\.parse\(report\.createdAt \?\? ""\)/, "Client eligibility must read createdAt.");
assert.doesNotMatch(parentPage.match(/function canSubmitGuidanceTicket[\s\S]*?^}/m)?.[0] ?? "", /lastActivityAt|status_updated_at|repl/i, "Replies and status activity must not restart the client wait.");
assert.match(parentPage, /report\.escalatedToGuidance \|\| report\.escalatedToPrincipal/, "Escalated reports must hide the button.");
assert.match(parentPage, /report\.reportStatus === "Resolved" \|\| report\.reportStatus === "Cancelled"/, "Closed reports must hide the button.");
assert.match(parentPage, /canSubmitSelectedGuidanceTicket && \(/, "The button must use the shared client eligibility predicate.");
assert.match(parentPage, /showTicketModal && !canSubmitSelectedGuidanceTicket/, "A live state update must close an ineligible ticket modal.");
assert.match(parentPage, /nextDeadline - now/, "The page must update at the exact upcoming 72-hour deadline.");

assert.match(ticketRoute, /getParentSession\(\)/, "The ticket route must authenticate the Parent.");
assert.match(ticketRoute, /getReportForParent\(reportId, parent\.id\)/, "The route must scope the report to the signed-in Parent.");
assert.match(ticketRoute, /submit_parent_guidance_ticket/, "The route must use the transactional eligibility routine.");
assert.match(ticketRoute, /72 hours\|open reports\|already pending/, "Ineligible submissions must be rejected rather than inserted.");

assert.match(migration, /SELECT \* INTO v_report[\s\S]*?FOR UPDATE;/, "The eligibility routine must lock the report.");
assert.match(migration, /v_report\.parent_id IS DISTINCT FROM p_parent_id/, "The database must enforce exact report ownership.");
assert.match(migration, /v_report\.created_at \+ interval '72 hours'/, "The server must use the original report timestamp for the wait.");
assert.match(migration, /v_report\.status NOT IN \('new', 'read', 'replied', 'ongoing'\)/, "Only open reports may create tickets.");
assert.match(migration, /v_report\.escalated_to_guidance[\s\S]*?escalated_to_principal/, "Escalated reports must be rejected server-side.");
assert.match(migration, /ON CONFLICT \(report_id\) DO NOTHING/, "Ticket insertion must remain duplicate-safe.");
assert.match(migration, /prevent_adviser_escalation_after_pending_parent_ticket/, "Concurrent Adviser escalation must be serialized with a pending Parent ticket.");
assert.match(statusRoute, /Parent Guidance ticket is already pending/, "Adviser escalation must return a conflict instead of a generic server error when the ticket wins.");

console.log("Parent Guidance ticket 72-hour eligibility and concurrency checks passed.");
