/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const dismissalHook = read("src/hooks/useSidebarBadgeDismissal.ts");

// Navigation must affect only the presentation of a numeric badge. The hook
// never calls an API or updates unread records, and restores a badge when the
// authoritative source falls (an item was actually handled) or rises (new work).
assert.match(dismissalHook, /Separates a sidebar badge's visual acknowledgement from the source's[\s\S]*?unread\/read state/);
assert.match(dismissalHook, /const \[dismissedThrough, setDismissedThrough\]/);
assert.match(dismissalHook, /if \(asCount\(counts\[key\]\) < dismissedCount\)/);
assert.match(dismissalHook, /Math\.max\(0, asCount\(counts\[key\]\) - asCount\(dismissedThrough\[key\]\)\)/);
assert.doesNotMatch(dismissalHook, /fetch\(|PATCH|POST|PUT|DELETE/);

for (const [file, keys] of [
  ["src/app/dashboard/parent/components/Sidebar.tsx", ["reports", "notifications"]],
  ["src/app/dashboard/adviser/components/Sidebar.tsx", ["reports", "notifications", "ict"]],
  ["src/app/dashboard/guidance/components/Sidebar.tsx", ["reports", "announcements", "ict", "notifications"]],
  ["src/app/dashboard/ict/components/Sidebar.tsx", ["inbox", "announcements"]],
  ["src/app/dashboard/principal/components/Sidebar.tsx", ["reports", "ict", "notifications"]],
]) {
  const sidebar = read(file);
  assert.match(sidebar, /import \{ useSidebarBadgeDismissal \} from "@\/hooks\/useSidebarBadgeDismissal"/);
  assert.match(sidebar, /const \{ dismissBadge, visibleBadgeCount \} = useSidebarBadgeDismissal\(/);
  assert.match(sidebar, /dismissBadge\(/);
  assert.match(sidebar, /visibleBadgeCount\(/);
  for (const key of keys) assert.match(sidebar, new RegExp(`${key}:`));
}

// Opening an actual Contact ICT/Inbox conversation remains the only place that
// marks its persisted message state read; the page-entry acknowledgement is
// deliberately just a badge dismissal.
for (const [file, clearMethod] of [
  ["src/app/dashboard/adviser/contact-ict/page.tsx", "clearIctUnreadCount"],
  ["src/app/dashboard/guidance/contact-ict/page.tsx", "clearIctUnreadCount"],
  ["src/app/dashboard/principal/contact-ict/page.tsx", "clearIctMessageCount"],
]) {
  const page = read(file);
  assert.match(page, new RegExp(`useEffect\\(\\(\\) => \\{[\\s\\S]*?${clearMethod}\\(\\)`));
  assert.match(page, /async function openConversation\(conversation: Conversation\)[\s\S]*?if \(!conversation\.isUnread\) return;/);
}
const ictInbox = read("src/app/dashboard/ict/inbox/page.tsx");
assert.match(ictInbox, /Dismiss the sidebar attention badge without changing a thread's read state/);
assert.match(ictInbox, /async function openConversation\(conversation: Conversation\)[\s\S]*?if \(!conversation\.isUnread\) return;/);

// Approvals are not a sidebar route, but their visible count follows the same
// rule: opening it hides only the badge; Pending records remain Pending.
const ictUsers = read("src/app/dashboard/ict/user-management/page.tsx");
assert.match(ictUsers, /const \[dismissedApprovalBadgeCount, setDismissedApprovalBadgeCount\]/);
assert.match(ictUsers, /const visibleApprovalBadgeCount = Math\.max\(0, pendingApprovalCount - dismissedApprovalBadgeCount\)/);
assert.match(ictUsers, /const openApprovals = \(\) => \{[\s\S]*?setDismissedApprovalBadgeCount\(pendingApprovalCount\)[\s\S]*?setShowApprovals\(true\)/);
assert.match(ictUsers, /status === "Pending"/);

console.log("sidebar badge dismissal checks passed");
