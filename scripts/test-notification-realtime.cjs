/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const parentLayout = read("src/app/dashboard/parent/layout.tsx");
const parentNotifications = read("src/app/dashboard/parent/context/NotificationContext.tsx");
const parentNotificationsPage = read("src/app/dashboard/parent/notifications/page.tsx");
const parentNotificationsRoute = read("src/app/api/parents/notifications/route.ts");
const parentReportMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const guidanceTicketDecisionRoute = read("src/app/api/reports/guidance/tickets/[id]/route.ts");
const adviserAnnouncements = read("src/app/api/adviser/announcements/route.ts");
const adviserAnnouncementDelivery = read("src/lib/deliverAdviserAnnouncement.ts");

assert.match(parentLayout, /<NotificationProvider>/, "The Parent layout must mount its shared notification provider on every dashboard route.");
assert.match(parentNotifications, /useSessionInvalidation/, "The Parent sidebar counts must use the shared Realtime subscription.");
assert.match(parentNotifications, /scope === "reports" \|\| scope === "staff-messages"/);
assert.match(parentNotifications, /scope === "notifications" \|\| scope === "announcements" \|\| scope === "attendance"/);
assert.match(parentNotifications, /refreshUnreadReportsCount\(\)\.catch/);
assert.match(parentNotifications, /refreshNotificationFeed\(\)\.catch/);
assert.match(parentNotificationsPage, /notificationRefreshVersion/, "The visible notification feed must reload after the layout receives a live invalidation.");
assert.match(parentNotificationsPage, /loadNotifications\(\)/);
assert.match(parentNotificationsRoute, /publishRealtimeInvalidation\(\[\{ role: "parent", id: session\.id \}\], "notifications"\)/, "Read state must synchronize across Parent tabs.");
assert.match(adviserAnnouncementDelivery, /parent_announcement_notifications/, "Adviser announcements must create durable Parent notification rows.");
assert.match(adviserAnnouncements, /delivery\.parentIds\.map\(\(id\) => \(\{ role: "parent" as const, id \}\)\)/, "Adviser announcements must wake only target Parent dashboards.");

// Guidance acceptance is a durable ticket transition, not just a transient
// client event. One ticket is allowed per report, and its saved acceptance
// timestamp powers exactly one Parent notification/read state.
assert.match(guidanceTicketDecisionRoute, /\.eq\("status", "pending"\)/);
assert.match(guidanceTicketDecisionRoute, /parentId: report\.parent_id/);
assert.match(guidanceTicketDecisionRoute, /kind: "status"/);
assert.match(parentReportMapper, /const ticketAcceptedAt = ticket\?\.status === "accepted" \? ticket\.decided_at : null/);
assert.match(parentReportMapper, /const acceptedTicketIsUnread = Boolean\(/);
assert.match(parentReportMapper, /const unread = !isResolved && \(hasUnreadStaffMessage \|\| acceptedTicketIsUnread\)/);
assert.match(parentNotificationsRoute, /from\("parent_report_guidance_tickets"\)[\s\S]*?\.eq\("parent_id", session\.id\)[\s\S]*?\.eq\("status", "accepted"\)/);
assert.match(parentNotificationsRoute, /const acceptedTicketReportById = new Map<number, ParentReportNotification>/);
assert.match(parentNotificationsRoute, /id: 1_250_000_000 \+ Number\(ticket\.id\)/);
assert.match(parentNotificationsRoute, /title: "Guidance accepted your ticket"/);
assert.match(parentNotificationsRoute, /reportId: Number\(report\.id\)/);
assert.match(parentNotificationsRoute, /acceptedAtMs > parentSeenAtMs/);

console.log("Parent notification Realtime coverage checks passed.");
