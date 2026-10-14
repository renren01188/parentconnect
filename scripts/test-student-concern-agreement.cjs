/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const parentReports = read("src/app/dashboard/parent/reports/page.tsx");
const consentRoute = read("src/app/api/reports/parent-adviser/[id]/consent/route.ts");
const messageRoute = read("src/app/api/reports/parent-adviser/[id]/messages/route.ts");
const presenceRoute = read("src/app/api/reports/parent-adviser/[id]/realtime/route.ts");
const parentAdviserRoute = read("src/app/api/reports/parent-adviser/route.ts");
const principalNotifications = read("src/app/api/principal/notifications/route.ts");
const principalMapper = read("src/app/api/reports/parent-adviser/_lib.ts");
const principalReadState = read("src/lib/principalReportReadState.cjs");
const principalNotificationContext = read("src/app/dashboard/principal/context/NotificationContext.tsx");

// The parent sees one required visibility checkbox—there are no Yes/No history
// controls—and the reply UI stays unavailable until the acknowledgement is stored.
assert.match(parentReports, /function StudentConcernConsent\(\{ onConfirm \}: \{ onConfirm: \(\) => Promise<void> \}\)/);
assert.match(parentReports, /Conversation Visibility/);
assert.match(parentReports, /The Principal may review this conversation to monitor the student concern\./);
assert.match(parentReports, /id="student-concern-visibility" type="checkbox"/);
assert.match(parentReports, /I understand that the Principal can view this conversation\./);
assert.match(parentReports, /disabled=\{!termsAccepted \|\| saving\}/);
assert.doesNotMatch(parentReports, /student-concern-history-consent/);
assert.doesNotMatch(parentReports, /Terms and Agreement/);
assert.match(parentReports, /selectedReport\.allowHistoryAccess !== true/);
assert.match(parentReports, /body: JSON\.stringify\(\{ termsAccepted: true \}\)/);

// The endpoint is authoritative: a client cannot start or type in the
// conversation until it supplies the accepted agreement, and the stored value
// is always true rather than trusting a caller-controlled history flag.
assert.match(consentRoute, /const \{ termsAccepted \} = await req\.json\(\)/);
assert.match(consentRoute, /termsAccepted !== true/);
assert.match(consentRoute, /update\(\{ allow_history_access: true,/);
assert.doesNotMatch(consentRoute, /const \{ allowHistoryAccess \}/);
assert.match(messageRoute, /isStudentConcernReport\(report\) && report\.allow_history_access !== true/);
assert.match(presenceRoute, /role === "parent" && isStudentConcernReport\(report\) && report\.allow_history_access !== true/);

// An unconfirmed Student Concern stays out of the Principal report list and
// notification count. Once the agreement commits, the normal report
// Broadcast wakes the Principal page and sidebar context immediately.
assert.match(parentAdviserRoute, /\.filter\(isPrincipalVisibleReport\)/);
assert.match(principalNotifications, /\.filter\(isPrincipalVisibleReport\)/);
assert.match(consentRoute, /await publishReportRealtimeInvalidation\([\s\S]*?reportId,[\s\S]*?kind: "status"/);
assert.match(principalNotificationContext, /scope === "reports"[\s\S]*?refreshNotifications\(\)/);
assert.match(principalMapper, /isStudentConcern: isStudentConcernReport\(row\) && row\.allow_history_access === true/);
assert.match(principalReadState, /isStudentConcern = false/);

console.log("student concern agreement and Principal Realtime checks passed");
