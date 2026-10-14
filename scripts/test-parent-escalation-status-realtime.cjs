/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const statusRoute = read("src/app/api/reports/parent-adviser/[id]/status/route.ts");
const realtimeHook = read("src/hooks/useReportMessagesRealtime.ts");
const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const subscriber = read("src/lib/subscribeRealtimeInvalidations.ts");

// Escalating from Adviser Reports is persisted before the data-free status
// invalidation reaches the linked parent's opaque Supabase channel.
assert.match(statusRoute, /normalized === "escalated" \? true : report\.escalated_to_guidance/);
assert.match(statusRoute, /await publishReportRealtimeInvalidation\([\s\S]*?parentId: report\.parent_id,[\s\S]*?reportId,[\s\S]*?kind: "status"/);
assert.match(statusRoute, /await publishReportRealtimeInvalidation\([\s\S]*?kind: "status"[\s\S]*?const updatedReport/);

// `reports` Broadcast events explicitly recognize durable status changes;
// they bypass the message coalescing delay and still use the normal protected
// server API snapshot as the source of UI data.
assert.match(subscriber, /\["message", "status", "typing"\]/);
assert.match(realtimeHook, /onReportStatusUpdate\?: RefreshReport/);
assert.match(realtimeHook, /invalidation\.kind === "status" && reportStatusUpdateRef\.current/);
assert.match(realtimeHook, /void refreshReportStatus\(invalidation\)/);

// Parent Reports reloads both its list and its selected detail so escalation
// status, the Guidance banner, and the composer ownership update in place.
assert.match(parentReports, /const handleLiveReportStatusUpdate = useCallback/);
assert.match(parentReports, /event\.kind !== "status"/);
assert.match(parentReports, /loadReports\(\),[\s\S]*?event\.reportId !== null && event\.reportId === selectedReportId \? loadReportDetail\(event\.reportId\)/);
assert.match(parentReports, /onReportStatusUpdate: handleLiveReportStatusUpdate/);

console.log("parent escalation status realtime checks passed");
