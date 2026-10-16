/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const principalMessages = read("src/app/api/reports/principal-messages/route.ts");
const staffMessages = read("src/app/api/reports/staff-messages/route.ts");
const notificationContext = read("src/app/dashboard/principal/context/NotificationContext.tsx");
const principalReports = read("src/app/dashboard/principal/reports/page.tsx");
const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const adviserReports = read("src/app/dashboard/adviser/reports/page.tsx");
const adviserData = read("src/app/dashboard/adviser/data.ts");
const adviserMessages = read("src/app/api/reports/adviser-messages/route.ts");
const reportRealtimeHook = read("src/hooks/useReportMessagesRealtime.ts");

// A direct parent conversation must retain the real participant role rather
// than falling through to the Adviser label used by legacy staff messages.
assert.match(principalMessages, /sender_type: "parent" \| "adviser" \| "guidance" \| "principal" \| "ict"/);
assert.match(principalMessages, /if \(type === "parent"\) return "Parent"/);
assert.match(principalMessages, /otherType = principalIsSender \? root\.recipient_type : root\.sender_type/);

// Standalone inbox messages have message states, not report workflow states.
assert.match(principalMessages, /if \(latestFromPrincipal\) return "Sent" as const/);
assert.match(principalMessages, /status: unread \? "New Message" as const : latestFromPrincipal \? "Sent" as const : "Read" as const/);
assert.doesNotMatch(principalMessages, /latestFromPrincipal \? "Replied"/);
assert.match(principalReports, /status: "New Message" \| "Unread" \| "Read" \| "Sent" \| "Replied" \| null/);
assert.match(principalReports, /status: "Sent" as const/);
assert.match(principalReports, /School Messages/);
assert.match(principalReports, /border-violet-100 bg-violet-50\/60/);
assert.doesNotMatch(principalReports, /uppercase tracking-widest text-slate-400">Received/);
assert.match(adviserReports, /School Messages/);
assert.match(adviserReports, /border-emerald-100 bg-emerald-50\/60/);

// Stored timestamps use the application's configured timezone on both the
// Principal endpoint and its short optimistic display before it is refreshed.
assert.match(principalMessages, /timeZone: "Asia\/Manila"/);
assert.match(principalMessages, /lastMessageAt: formatDate\(String\(last\.created_at \?\? root\.created_at\)\)/);
assert.doesNotMatch(principalMessages, /lastMessageAt: formatDate\(String\(last\.updated_at/);
assert.match(staffMessages, /function formatDate\(value: string\)[\s\S]*?timeZone: "Asia\/Manila"/);
assert.match(principalReports, /function formatManilaTimestamp/);
assert.match(principalReports, /timeZone: "Asia\/Manila"/);
assert.match(principalReports, /await loadPrincipalMessages\(\);/);
assert.match(principalReports, /const loadPrincipalMessages = useCallback\(async \(preferredConversationId\?: string\)/);
assert.match(principalReports, /await loadPrincipalMessages\(conversationId\);/);

// A Parent reply is represented as New Message by the unified inbox, so the
// Reports sidebar must apply the same unread rule as the Message tab.
assert.match(notificationContext, /conversation\.status === "New Message" \|\| conversation\.status === "Unread"/);
assert.match(principalReports, /const unreadMessageCount = conversations\.filter\(\(conversation\) => conversation\.status === "New Message" \|\| conversation\.status === "Unread"\)\.length/);

// The direct-message header is intentionally focused on the participant and
// subject. Workflow/status labels still remain available in the message list.
assert.match(principalReports, /overflow-hidden bg-slate-50 font-sans/);
assert.match(principalReports, /text-sm font-extrabold leading-snug text-slate-800/);
assert.match(principalReports, /text-sm font-bold text-slate-600/);
assert.doesNotMatch(principalReports, /selectedConversation\.category\}<\/span>/);
assert.doesNotMatch(principalReports, /selectedConversation\.status &&/);

// The direct-message write broadcasts to both authenticated participants;
// their existing pages reload only their authorized inbox snapshots.
assert.match(staffMessages, /\{ role: current\.type, id: current\.id \},[\s\S]*?\{ role: "parent", id: recipient\.parentId \}/);
assert.match(parentReports, /useReportMessagesRealtime\(loadReports/);
assert.match(principalReports, /useReportMessagesRealtime\(refreshPrincipalInbox/);
assert.match(principalReports, /const refreshReportDetailAfterInFlight = useCallback/);
assert.match(principalReports, /const inFlight = reportDetailRequestsRef\.current\.get\(id\)[\s\S]*?await loadReportDetail\(id\)/);
assert.match(principalReports, /event\.reportId !== null && event\.reportId === selectedReportId[\s\S]*?refreshReportDetailAfterInFlight\(event\.reportId\)/);
assert.match(reportRealtimeHook, /if \(invalidation\.kind === "message"\)[\s\S]*?void refreshReport\(invalidation\)/);

// The current staff-message path and the retained Adviserâ€“Principal path
// must both wake an idle Principal Reports inbox. The page re-reads the
// server-authorized thread, preventing optimistic duplication.
assert.match(adviserMessages, /Legacy Adviser[^\n]*Principal[\s\S]*?publishRealtimeInvalidation\([\s\S]*?\{ role: "principal", id: Number\(principalId\) \}[\s\S]*?scope: "staff-messages", kind: "message"/);
assert.match(adviserMessages, /idle Principal immediately[\s\S]*?publishRealtimeInvalidation\([\s\S]*?\{ role: "principal", id: Number\(receivedMsg\.principal_id\) \}/);
assert.match(principalMessages, /async function publishPrincipalReportsReadInvalidation\(principalId: number\)/);
assert.match(principalMessages, /scope: "staff-messages", kind: "status"/);
assert.match(principalMessages, /await publishPrincipalReportsReadInvalidation\(principal\.id\);/);
assert.match(notificationContext, /if \(scope === "staff-messages"\)[\s\S]*?refreshAdviserMessages\(\)/);

// The composer keeps a dedicated, fixed-size send action at every width.
assert.match(principalReports, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
assert.match(principalReports, /aria-label="Send message"/);
assert.match(principalReports, /h-\[52px\] w-\[52px\] shrink-0/);

// Direct staff threads preserve the root for the detail view but expose the
// real final row for an inbox card. This keeps the Adviser conversation's
// sender, preview, timestamp, and ordering correct after every reply.
assert.match(staffMessages, /latest_message: String\(last\.body \?\? ""\)/);
assert.match(staffMessages, /latest_sender_name: String\(last\.sender_name \?\? ""\)/);
assert.match(staffMessages, /latest_created_at: String\(last\.created_at \?\? root\.created_at\)/);
assert.match(adviserData, /latest_message\?: string/);
assert.match(adviserReports, /function getLatestAdminPreview/);
assert.match(adviserReports, /message\.latest_message \?\? latestReply\?\.message \?\? message\.message/);
assert.match(adviserReports, /a\.latest_created_at \?\? a\.sent_at/);
assert.match(adviserReports, /\{preview\.senderName\} · \{preview\.senderRole\}:/);
assert.match(adviserReports, /if \(!res\.ok && !staffRes\.ok\)/);
assert.match(principalReports, /\{latestSenderName\} · \{latestSenderRole\}:/);
assert.match(principalReports, /staffConversationTyping\.isOtherParticipantTyping[\s\S]*?The other participant is typing…/);
assert.match(adviserReports, /staffConversationTyping\.isOtherParticipantTyping[\s\S]*?The other participant is typing…/);

// Both message composers reserve a fixed send action and allow the draft
// column to shrink, so no input or control can extend off-screen.
assert.match(adviserReports, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
assert.match(adviserReports, /aria-label="Send message"/);
assert.match(adviserReports, /h-\[52px\] w-\[52px\] shrink-0/);
assert.match(principalReports, /min-w-0 w-full flex-col overflow-hidden bg-slate-50/);

console.log("principal message panel checks passed");
