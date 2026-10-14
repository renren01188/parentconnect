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

// The direct-message write broadcasts to both authenticated participants;
// their existing pages reload only their authorized inbox snapshots.
assert.match(staffMessages, /\{ role: current\.type, id: current\.id \},[\s\S]*?\{ role: "parent", id: recipient\.parentId \}/);
assert.match(parentReports, /useReportMessagesRealtime\(loadReports/);
assert.match(principalReports, /useReportMessagesRealtime\(refreshPrincipalInbox/);

// The composer keeps a dedicated, fixed-size send action at every width.
assert.match(principalReports, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
assert.match(principalReports, /aria-label="Send message"/);
assert.match(principalReports, /h-\[52px\] w-\[52px\] shrink-0/);

console.log("principal message panel checks passed");
