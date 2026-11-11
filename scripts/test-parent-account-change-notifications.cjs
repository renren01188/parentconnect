/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/legacy-migrations/20261109100000_add_parent_account_change_notifications.sql");
const helper = read("src/lib/parentAccountChangeNotifications.ts");
const adviserStudentRoute = read("src/app/api/students/[id]/route.ts");
const ictStudentRoute = read("src/app/api/ict/students/[id]/route.ts");
const ictUserManagementRoute = read("src/app/api/ict/user-management/route.ts");
const ictParentLinkRoute = read("src/app/api/ict/parent-student-links/route.ts");
const parentNotificationsRoute = read("src/app/api/parents/notifications/route.ts");
const parentNotificationsPage = read("src/app/dashboard/parent/notifications/page.tsx");

assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.parent_account_change_notifications/);
assert.match(migration, /changed_fields text\[\] NOT NULL/);
assert.match(migration, /CHECK \(actor_role IN \('Adviser', 'ICT'\)\)/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);

assert.match(helper, /hasCompletedActiveParentSignup/, "Only completed, active Parent accounts may receive dashboard notices.");
assert.match(helper, /parent_student_links/, "Student updates must resolve modern Parent links.");
assert.match(helper, /\.from\("parents"\)[\s\S]*?\.eq\("student_id", normalizedStudentId\)/, "Student updates must resolve legacy Parent links.");
assert.match(helper, /parent_account_change_notifications/);
assert.match(helper, /publishRealtimeInvalidation[\s\S]*?"notifications"/, "A successful write must refresh the Parent feed without a page reload.");

assert.match(adviserStudentRoute, /notifyParentsOfAccountChange/);
assert.match(adviserStudentRoute, /role: "Adviser"/);
assert.match(ictStudentRoute, /notifyParentsOfAccountChange/);
assert.match(ictStudentRoute, /role: "ICT"/);
assert.match(ictUserManagementRoute, /studentChangeNotifications/);
assert.match(ictUserManagementRoute, /parentAccountChangedFields/);
assert.match(ictParentLinkRoute, /changedFields: \["Parent or guardian link"\]/);

assert.match(parentNotificationsRoute, /from\("parent_account_change_notifications"\)/);
assert.match(parentNotificationsRoute, /parentAccountChangeNotificationId/);
assert.match(parentNotificationsRoute, /Student information updated/);
assert.match(parentNotificationsRoute, /Parent account information updated/);
assert.match(parentNotificationsRoute, /parentAccountChangeNotificationIds/);
assert.match(parentNotificationsPage, /parentAccountChangeNotificationId/);
assert.match(parentNotificationsPage, /parentAccountChangeNotificationIds/);
assert.match(parentNotificationsPage, /"Account"\] as FilterTab\[\]/);

console.log("Parent account-change notification checks passed.");
