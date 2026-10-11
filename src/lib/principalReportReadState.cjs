/**
 * Principal report read receipts are deliberately separate from the shared
 * report workflow and from the Parent/Adviser message flags.  The same report
 * can therefore be read by one Principal while remaining unread for another.
 */
function principalReportReadKey(reportId) {
  const id = Number(reportId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new TypeError("A Principal report read receipt requires a valid report id.");
  }
  return `principal-report-read-${id}`;
}

function hasUnreadForPrincipal({ status, principalHasRead, messages }) {
  return (
    String(status ?? "").toLowerCase() !== "resolved" &&
    !principalHasRead &&
    messages.some((message) => message.sender_role === "parent")
  );
}

function isPrincipalReportUnread(report) {
  return report?.hasUnreadForPrincipal === true;
}

function countUnreadPrincipalReports(reports) {
  return reports.reduce((count, report) => count + (isPrincipalReportUnread(report) ? 1 : 0), 0);
}

function markPrincipalReportRead(report) {
  return {
    ...report,
    hasUnreadForPrincipal: false,
    principalHasRead: true,
  };
}

function invalidatePrincipalReportRead(readKeys, reportId) {
  const key = principalReportReadKey(reportId);
  return new Set([...readKeys].filter((readKey) => readKey !== key));
}

module.exports = {
  countUnreadPrincipalReports,
  hasUnreadForPrincipal,
  invalidatePrincipalReportRead,
  isPrincipalReportUnread,
  markPrincipalReportRead,
  principalReportReadKey,
};
