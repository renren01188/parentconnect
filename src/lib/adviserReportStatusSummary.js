/**
 * Adviser-facing report state helpers.
 *
 * Guidance changes the shared report status to "ongoing" when it starts work.
 * That must not make an Adviser view a handed-off report as an Adviser-owned
 * ongoing report. The unresolved escalation flags therefore take precedence
 * for Adviser labels, filters, and parent-card summaries.
 */

function effectiveAdviserReportStatus(report) {
  const status = String(report?.status ?? "").trim().toLowerCase();

  // A completed report remains resolved even though the escalation history is
  // intentionally retained for audit and permissions.
  if (status === "resolved") return "Resolved";
  if (status === "escalated" || report?.escalatedToPrincipal || report?.escalatedToGuidance) return "Escalated";
  if (status === "ongoing") return "Ongoing";
  if (status === "replied") return "Replied";
  if (status === "read") return "Read";
  return "New";
}

function adviserReportStatusCategory(report) {
  switch (effectiveAdviserReportStatus(report)) {
    case "Ongoing": return "ongoing";
    case "Replied": return "ongoing";
    case "Escalated": return "escalated";
    case "Resolved": return "resolved";
    default: return "pending";
  }
}

function adviserReportStatusLabel(report) {
  if (report?.cancelledByParent) return "Cancelled by Parents";
  const status = effectiveAdviserReportStatus(report);
  if (status === "Resolved" && report?.resolvedByPrincipal) return "Resolved By the Principal";
  if (status === "Resolved" && report?.resolvedByGuidance) return "Resolved By the Guidance";
  if (status === "Escalated" && report?.escalatedToPrincipal) return "Escalated to Principal";
  if (status === "Escalated" && report?.escalatedToGuidance) return "Escalated to Guidance";
  if (status === "New" || status === "Read") return "Pending Review";
  return status;
}

function summarizeAdviserReportStatuses(reports) {
  const summary = { pending: 0, ongoing: 0, escalated: 0, resolved: 0, total: reports.length };
  for (const report of reports) summary[adviserReportStatusCategory(report)] += 1;
  return summary;
}

module.exports = {
  effectiveAdviserReportStatus,
  adviserReportStatusCategory,
  adviserReportStatusLabel,
  summarizeAdviserReportStatuses,
};
