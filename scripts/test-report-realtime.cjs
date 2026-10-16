/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const messageRoute = read("src/app/api/reports/parent-adviser/[id]/messages/route.ts");
const realtimePublisher = read("src/lib/realtimeInvalidation.ts");
const realtimeSubscriber = read("src/lib/subscribeRealtimeInvalidations.ts");
const sessionInvalidation = read("src/hooks/useSessionInvalidation.ts");
const reportRealtimeHook = read("src/hooks/useReportMessagesRealtime.ts");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const guidanceReports = read("src/app/dashboard/guidance/reports/page.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");
const staffMessagesRoute = read("src/app/api/reports/staff-messages/route.ts");
const studentReportsRoute = read("src/app/api/student-reports/route.ts");
const guidanceTicketRoute = read("src/app/api/reports/parent-adviser/[id]/ticket/route.ts");
const guidanceNotificationContext = read("src/app/dashboard/guidance/context/NotificationContext.tsx");
const reportPresenceRoute = read("src/app/api/reports/parent-adviser/[id]/realtime/route.ts");
const guidanceStatusRoute = read("src/app/api/reports/guidance/[id]/status/route.ts");

// A committed message must publish its invalidation before its serverless
// request resolves. `after()` is reserved for non-interactive audit/email work.
assert.match(messageRoute, /async function deliverReportInvalidation\(/);
assert.match(messageRoute, /await publishReportInvalidation\(report, reportId, messageId\)/);
assert.doesNotMatch(messageRoute, /after\(\(\) => publishReportInvalidation\(/);
assert.equal(
  (messageRoute.match(/await deliverReportInvalidation\(report, reportId, result\.id\)/g) ?? []).length,
  4,
  "Adviser, Guidance, Principal, and Parent report replies should all publish before responding.",
);
assert.match(
  messageRoute,
  /const result = await insertMessage\(reportId, "parent",[\s\S]*?if \(!result\.duplicate\) await deliverReportInvalidation\(report, reportId, result\.id\);[\s\S]*?return NextResponse\.json\(\{ success: true, messageId: result\.id \}\);/,
);
assert.match(messageRoute, /kind: "message"/);

// Realtime messages are data-free, role-scoped Broadcast invalidations. The
// recipient then reloads through its existing authorized API route.
assert.match(realtimePublisher, /realtime\/v1\/api\/broadcast/);
assert.match(realtimePublisher, /topic: realtimeChannelTopic\(recipient\)/);
assert.match(realtimePublisher, /event: "invalidate"/);
assert.match(realtimePublisher, /scope: "reports"/);
assert.match(messageRoute, /parentId: report\.parent_id/);
assert.match(messageRoute, /adviserId: principalConversation \|\| guidanceConversation \? null : report\.adviser_id/);
assert.match(realtimeSubscriber, /\.on\("broadcast", \{ event: "invalidate" \}/);
assert.match(realtimeSubscriber, /const channelUrl = role[\s\S]*?\/api\/realtime\/channel\?role=\$\{encodeURIComponent\(role\)\}/);
assert.match(realtimeSubscriber, /fetch\(channelUrl/);

// The Adviser page applies a report-specific refresh without a navigation,
// preserves the selected conversation, and reconnects through the shared
// session channel if the socket closes.
assert.match(adviserReports, /useReportMessagesRealtime\(refreshAdviserInbox/);
assert.match(adviserReports, /event\.reportId !== null && event\.reportId === selectedReportId \? loadReportDetail\(event\.reportId\)/);
assert.match(adviserReports, /setSelectedReport\(\(current\) => current\?\.id === id \? report : current\)/);
assert.match(adviserReports, /reportDetailRefreshQueuedRef/);
assert.match(adviserReports, /if \(inFlight\) \{[\s\S]*?reportDetailRefreshQueuedRef\.current\.add\(id\)[\s\S]*?return inFlight;/);
assert.match(adviserReports, /do \{[\s\S]*?reportDetailRefreshQueuedRef\.current\.delete\(id\)[\s\S]*?\} while \(reportDetailRefreshQueuedRef\.current\.has\(id\)\)/);
assert.match(reportRealtimeHook, /if \(invalidation\.scope === "reports"\)/);
assert.match(reportRealtimeHook, /scheduleReportRefresh\(invalidation\)/);
assert.match(
  reportRealtimeHook,
  /if \(invalidation\.kind === "message"\)[\s\S]*?void refreshReport\(invalidation\)/,
  "a committed report message must begin its targeted refresh immediately",
);
assert.match(
  reportRealtimeHook,
  /reportRefreshInFlightRef[\s\S]*?queuedReportInvalidationRef/,
  "bursts of durable message events must retain one authoritative follow-up refresh",
);
assert.match(
  reportRealtimeHook,
  /if \(isDurableMessage && reportRefreshInFlightRef\.current\)[\s\S]*?queuedReportInvalidationRef\.current = invalidation/,
  "a later report reply must not race the currently loading detail snapshot",
);
assert.match(
  reportRealtimeHook,
  /const queuedInvalidation = queuedReportInvalidationRef\.current[\s\S]*?void refreshReport\(queuedInvalidation\)/,
  "the queued report event must be re-read after the prior refresh completes",
);
assert.match(sessionInvalidation, /CHANNEL_ERROR.*TIMED_OUT.*CLOSED/s);
assert.match(sessionInvalidation, /scheduleReconnect\(\)/);

// A New Message is a standalone staff conversation. It must publish to the
// selected parent before the response completes, and Parent Reports handles
// that scope by re-reading its already-authorized inbox rather than reloading.
assert.match(staffMessagesRoute, /recipient_type: "parent"[\s\S]*?await publishRealtimeInvalidation\([\s\S]*?\{ role: current\.type, id: current\.id \}[\s\S]*?\{ role: "parent", id: recipient\.parentId \}[\s\S]*?"staff-messages"/);
assert.match(reportRealtimeHook, /if \(invalidation\.scope === "staff-messages"\)[\s\S]*?scheduleRefresh\(\)/);
assert.match(parentReports, /useReportMessagesRealtime\(loadReports/);
assert.match(
  parentReports,
  /const alreadyInInbox = current\.some\(\(item\) => item\.id === id\)[\s\S]*?sortParentReportConversations\(\[\.\.\.current, mergedReport\]\)/,
  "a detail Broadcast must retain the correct Parent conversation if its summary request is still in flight",
);
assert.match(
  parentReports,
  /loaded\?\.detailsLoaded && !report\.isStandaloneStaffMessage[\s\S]*?\? \{ \.\.\.report, messages: loaded\.messages, detailsLoaded: true \}[\s\S]*?: report/,
  "An open standalone staff conversation must accept its complete live snapshot rather than preserve stale messages.",
);
assert.match(guidanceReports, /useReportMessagesRealtime\(refreshGuidanceInbox/);
assert.match(guidanceReports, /Promise\.all\(\[loadGuidanceReports\(\), loadGuidanceStaffMessages\(\)\]\)/);
assert.match(guidanceReports, /role: "guidance"[\s\S]*?recipientId: payload\.recipient\.id/);
assert.match(guidanceReports, /setSelectedAdminMsg\(\(current\) => \{[\s\S]*?requestedConversationId[\s\S]*?nextMessages\.find[\s\S]*?\?\? current/);
assert.match(principalReports, /useReportMessagesRealtime\(refreshPrincipalInbox/);
assert.match(principalReports, /Promise\.all\(\[loadPrincipalReports\(\), loadPrincipalMessages\(\)\]\)/);
assert.match(principalReports, /principalMessagesRequestVersionRef/);
assert.match(principalReports, /const requestVersion = \+\+principalMessagesRequestVersionRef\.current/);
assert.match(principalReports, /if \(requestVersion !== principalMessagesRequestVersionRef\.current\) return;/);

// Both Guidance and Adviser keep the selected standalone conversation in sync
// when its inbox snapshot changes, so parent replies appear in-place in either
// direction rather than requiring a navigation or page reload.
assert.match(guidanceReports, /setSelectedAdminMsg\(\(current\) => \{[\s\S]*?requestedConversationId[\s\S]*?nextMessages\.find[\s\S]*?\?\? current/);
assert.match(adviserReports, /setSelectedAdminMsg\(current => current[\s\S]*?adminMessageKey\(message\) === adminMessageKey\(current\)[\s\S]*?\?\? current/);
assert.match(adviserReports, /adminMessagesRequestVersionRef/);
assert.match(adviserReports, /const requestVersion = \+\+adminMessagesRequestVersionRef\.current/);
assert.match(adviserReports, /if \(requestVersion !== adminMessagesRequestVersionRef\.current\) return \[\];/);
assert.match(adviserReports, /role: "adviser"[\s\S]*?recipientId,/);

// Public Student Reports wake the assigned Adviser and active Principal only
// after the row is committed; each client refreshes its protected monitoring
// snapshot in place.
assert.match(studentReportsRoute, /import \{ publishStudentReportsRealtimeInvalidation \} from "@\/lib\/realtimeInvalidation"/);
assert.match(studentReportsRoute, /await publishStudentReportsRealtimeInvalidation\(adviser\.id\)/);
assert.match(realtimePublisher, /export async function publishStudentReportsRealtimeInvalidation\(adviserId\?: number \| null\)/);
assert.match(reportRealtimeHook, /onStudentReportUpdate\?: RefreshReports/);
assert.match(reportRealtimeHook, /if \(invalidation\.scope === "students"\)/);
assert.match(adviserReports, /onStudentReportUpdate: loadStudentReports/);
assert.match(principalReports, /onStudentReportUpdate: loadPrincipalReports/);

// A submitted Guidance ticket has a dedicated, post-commit invalidation.
// Guidance refreshes its authorized ticket snapshot and the ticket-backed
// Notifications feed, so both kinds of sidebar count update in place.
assert.match(realtimePublisher, /\| "tickets"/);
assert.match(realtimeSubscriber, /\["reports", "tickets", "staff-messages"/);
assert.match(guidanceTicketRoute, /import \{ publishRealtimeInvalidation, publishReportRealtimeInvalidation \}/);
assert.match(guidanceTicketRoute, /await publishRealtimeInvalidation\([\s\S]*?\{ scope: "tickets", reportId, kind: "status" \}/);
assert.match(guidanceTicketRoute, /includeGuidance: false/);
assert.match(reportRealtimeHook, /onTicketUpdate\?: RefreshReports/);
assert.match(reportRealtimeHook, /if \(invalidation\.scope === "tickets"\)/);
assert.match(guidanceReports, /onTicketUpdate: async \(\) => \{ await refreshTickets\("background"\); \}/);
assert.match(guidanceNotificationContext, /if \(scope === "tickets"\)[\s\S]*?Promise\.all\(\[refreshGuidanceCounts\(\), refreshNotificationCounts\(\)\]\)/);

// After Guidance accepts a ticket, report messages and ephemeral typing use
// the accepted counselor's opaque channel. Older ticketless escalations keep
// the existing active-Guidance fallback, so no authorized conversation loses
// live updates during a migration.
assert.match(realtimePublisher, /async function acceptedGuidanceRecipientForReport\(reportId: number\)/);
assert.match(realtimePublisher, /guidanceId\?: number \| null/);
assert.match(realtimePublisher, /\{ id: Number\(guidanceId\) \}/);
assert.match(messageRoute, /await acceptedGuidanceRecipientForReport\(reportId\)/);
assert.match(messageRoute, /guidanceId,/);
assert.match(reportPresenceRoute, /await acceptedGuidanceRecipientForReport\(reportId\)/);
assert.match(reportPresenceRoute, /kind: "typing"/);
assert.match(parentReports, /useReportTyping\(selectedReportId, "parent"\)/);
assert.match(parentReports, /reportTyping\.onDraftChange\(hasDraft\)/);
assert.match(parentReports, /reportTyping\.isOtherParticipantTyping/);
assert.match(guidanceReports, /useReportTyping\(selectedReportId, "guidance"\)/);
assert.match(guidanceReports, /reportTyping\.onDraftChange\(Boolean\(e\.target\.value\.trim\(\)\)\)/);
assert.match(guidanceReports, /reportTyping\.isOtherParticipantTyping/);

// Typing is scoped to the current handoff. Once Guidance escalates a report,
// only the Parent and Principal receive presence events; durable status
// changes still use their wider monitoring recipient set.
assert.match(realtimePublisher, /includeAdviser = true/);
assert.match(realtimePublisher, /includePrincipals = true/);
assert.match(realtimePublisher, /includeAdviser && Number\.isSafeInteger/);
assert.match(reportPresenceRoute, /const principalConversation = Boolean\(report\.escalated_to_principal\)/);
assert.match(reportPresenceRoute, /const guidanceConversation = !principalConversation && Boolean\(report\.escalated_to_guidance\)/);
assert.match(reportPresenceRoute, /select\("id, parent_id, adviser_id, status, escalated_to_guidance, escalated_to_principal, subject, allow_history_access"\)/);
assert.match(reportPresenceRoute, /includeAdviser: !principalConversation && !guidanceConversation/);
assert.match(reportPresenceRoute, /includePrincipals: principalConversation/);
assert.match(reportPresenceRoute, /if \(role === "guidance"\) \{[\s\S]*?if \(report\.escalated_to_principal\)/);
assert.match(parentReports, /event\.reportId !== null && event\.reportId === selectedReportId \? loadReportDetail\(event\.reportId\)/);
assert.match(principalReports, /const refreshReportDetailAfterInFlight = useCallback/);
assert.match(principalReports, /event\.reportId !== null && event\.reportId === selectedReportId[\s\S]*?refreshReportDetailAfterInFlight\(event\.reportId\)/);
assert.match(principalReports, /useReportTyping\(selectedReportId, "principal"\)/);
assert.match(principalReports, /reportTyping\.onDraftChange\(Boolean\(event\.target\.value\.trim\(\)\)\)/);
assert.match(guidanceStatusRoute, /if \(escalatedToPrincipal\) updatePayload\.escalated_to_principal = true/);
assert.match(guidanceStatusRoute, /await publishReportRealtimeInvalidation\([\s\S]*?reportId,[\s\S]*?kind: "status"/);

console.log("report realtime delivery checks passed");
