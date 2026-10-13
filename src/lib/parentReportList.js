/**
 * Parent Reports is an inbox, not an assignment dashboard. A conversation is
 * grouped by the most recent actual staff sender so it can occur in at most
 * one staff-role tab. A newly submitted report without a staff reply remains
 * visible in All Messages (and Unread when applicable), but has no role tab.
 */

const ROLE_TABS = new Set(["Principal", "Adviser", "Guidance"]);

function roleTabForThread(thread) {
  if (thread === "principal") return "Principal";
  if (thread === "adviser") return "Adviser";
  if (thread === "guidance") return "Guidance";
  return undefined;
}

function latestStaffRoleTab(conversation) {
  const declared = roleTabForThread(conversation?.latestStaffRole);
  if (declared) return declared;

  // Detail responses can safely derive the role from staff messages. Parent
  // replies may have a thread type too, but must never move a conversation
  // into a staff role tab.
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sender !== "staff") continue;
    const role = roleTabForThread(message.threadType);
    if (role) return role;
  }

  // Legacy lightweight responses may carry exactly one server-derived role.
  // More than one is intentionally treated as unclassified so a conversation
  // cannot be duplicated between staff tabs.
  const roles = [...new Set((conversation?.threadTypes ?? []).map(roleTabForThread).filter(Boolean))];
  return roles.length === 1 ? roles[0] : undefined;
}

function matchesCategory(conversation, category) {
  return category === "All" || Boolean(conversation?.categories?.includes(category));
}

function matchesParentReportFilter(conversation, tab) {
  if (tab === "All Messages") return true;
  if (tab === "Unread") return Boolean(conversation?.unread);
  return ROLE_TABS.has(tab) && latestStaffRoleTab(conversation) === tab;
}

function filterParentReportConversations(conversations, { tab, category = "All" }) {
  return (conversations ?? []).filter((conversation) =>
    matchesCategory(conversation, category) && matchesParentReportFilter(conversation, tab)
  );
}

function countParentReportTabs(conversations, { category = "All" } = {}) {
  const scoped = (conversations ?? []).filter((conversation) => matchesCategory(conversation, category));
  return {
    "All Messages": scoped.length,
    Unread: scoped.filter((conversation) => Boolean(conversation?.unread)).length,
    Principal: scoped.filter((conversation) => latestStaffRoleTab(conversation) === "Principal").length,
    Adviser: scoped.filter((conversation) => latestStaffRoleTab(conversation) === "Adviser").length,
    Guidance: scoped.filter((conversation) => latestStaffRoleTab(conversation) === "Guidance").length,
  };
}

module.exports = {
  countParentReportTabs,
  filterParentReportConversations,
  latestStaffRoleTab,
};
