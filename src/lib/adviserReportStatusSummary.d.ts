export type AdviserReportStatus = "New" | "Read" | "Ongoing" | "Replied" | "Escalated" | "Resolved";
export type AdviserReportStatusCategory = "pending" | "ongoing" | "escalated" | "resolved";

export interface AdviserReportStatusInput {
  status?: string | null;
  escalatedToGuidance?: boolean | null;
  escalatedToPrincipal?: boolean | null;
  cancelledByParent?: boolean | null;
  resolvedByGuidance?: boolean | null;
  resolvedByPrincipal?: boolean | null;
}

export interface AdviserReportStatusSummary {
  pending: number;
  ongoing: number;
  escalated: number;
  resolved: number;
  total: number;
}

export function effectiveAdviserReportStatus(report: AdviserReportStatusInput): AdviserReportStatus;
export function adviserReportStatusCategory(report: AdviserReportStatusInput): AdviserReportStatusCategory;
export function adviserReportStatusLabel(report: AdviserReportStatusInput): string;
export function summarizeAdviserReportStatuses(reports: AdviserReportStatusInput[]): AdviserReportStatusSummary;
