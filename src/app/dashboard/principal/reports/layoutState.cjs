/**
 * The Reports screen keeps a parent/report column open while a conversation is
 * open on desktop.  These helpers deliberately use the immutable report
 * relationship IDs first: parent and student names can be corrected between
 * realtime snapshots and must never change the selected column.
 */
function reportGroupKey(report) {
  const parent = report.parent_id ?? `name:${report.parent_name || "unknown-parent"}`;
  const student = report.student_id ?? `name:${report.student_name || "unknown-student"}`;
  return `${parent}:${student}`;
}

/**
 * Prefer the persisted parent/student selection.  The report-ID fallback also
 * keeps legacy rows (which predate those IDs) selected across a name refresh.
 */
function findSelectedParentGroup(groups, selectedParentKey, selectedReportId) {
  if (selectedParentKey) {
    const byKey = groups.find((group) => group.key === selectedParentKey);
    if (byKey) return byKey;
  }
  if (selectedReportId !== null) {
    return groups.find((group) => group.reports.some((report) => report.id === selectedReportId)) ?? null;
  }
  return null;
}

function isReportsPanelVisible(viewStep, hasSelectedParent, desktop) {
  if (!desktop) return viewStep === "reports";
  return viewStep === "reports" || (viewStep === "detail" && hasSelectedParent);
}

function detailPanelLayout(hasSelectedParent) {
  return hasSelectedParent
    ? { position: "left-[420px]", width: "right-0 w-auto" }
    : { position: "left-0", width: "w-full max-w-[860px]" };
}

/**
 * These flags are the routing source of truth. Principal monitoring makes a
 * report visible, but is not a handoff: only persisted routing flags may
 * describe a report as escalated in the Principal UI.
 */
function principalReportStatusLabel(report) {
  const status = String(report.status ?? "").toLowerCase();
  if (report?.cancelledByParent) return "Cancelled by Parents";
  if (status === "resolved") {
    const storedResolverRole = String(report.resolvedByRole ?? "").trim();
    if (["Adviser", "Guidance", "Principal"].includes(storedResolverRole)) {
      return `Resolved by ${storedResolverRole}`;
    }

    // Reports resolved before resolver metadata was introduced retain their
    // correct owner through the same durable routing rules used at the time.
    if (report.escalatedToPrincipal) return "Resolved by Principal";
    if (report.escalatedToGuidance) return "Resolved by Guidance";
    return "Resolved by Adviser";
  }
  if (report.escalatedToPrincipal) return "Escalated from Guidance";
  if (report.escalatedToGuidance) return "Escalated to Guidance";
  if (report.ticketStatus === "accepted") return "Accepted Ticket";
  if (status === "ongoing") return "On Going";
  if (status === "read") return "Read";
  return "Submitted report to Adviser";
}

module.exports = {
  detailPanelLayout,
  findSelectedParentGroup,
  isReportsPanelVisible,
  principalReportStatusLabel,
  reportGroupKey,
};
