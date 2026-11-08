import { displayGuidanceLabel, normalizeAuditRole } from "@/lib/audit-filter-options";
import { formatAuditTimestamp } from "@/lib/auditPresentation";

type AuditCsvRow = {
  action: string | null;
  details: string | null;
  target_user: string | null;
  target_role: string | null;
  target_email: string | null;
  performed_by: string | null;
  performed_by_role: string | null;
  module: string | null;
  ip_address: string | null;
  browser: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
};

function csvCell(value: string | null | undefined) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Produces an Excel-friendly CSV without exposing records beyond an authorized API response. */
export function auditLogRowsToCsv(rows: AuditCsvRow[]) {
  const header = [
    "Timestamp (Manila)",
    "Action",
    "Performed by",
    "Role",
    "Target",
    "Target role",
    "Target email",
    "Module",
    "Details",
    "Previous status",
    "New status",
    "IP address",
    "Device / browser",
  ];

  const values = rows.map((row) => [
    formatAuditTimestamp(row.created_at),
    row.action,
    displayGuidanceLabel(row.performed_by),
    normalizeAuditRole(row.performed_by_role),
    displayGuidanceLabel(row.target_user),
    normalizeAuditRole(row.target_role),
    row.target_email,
    row.module,
    displayGuidanceLabel(row.details),
    row.previous_status,
    row.new_status,
    row.ip_address,
    row.browser,
  ].map(csvCell).join(","));

  return `\uFEFF${header.map(csvCell).join(",")}\r\n${values.join("\r\n")}`;
}
