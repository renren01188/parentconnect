/**
 * Canonical Audit Trail filters. Each option is backed by an action or role
 * currently emitted by the application. `databaseValues` retains support for
 * legacy labels already stored in audit_log.
 */
export const AUDIT_ROLE_OPTIONS = [
  { value: "Student", label: "Student", databaseValues: ["Student"] },
  { value: "Subject Teacher", label: "Subject Teacher", databaseValues: ["Subject Teacher"] },
  { value: "Adviser", label: "Adviser", databaseValues: ["Adviser"] },
  { value: "Guidance", label: "Guidance", databaseValues: ["Guidance", "Guidance Counselor"] },
  { value: "ICT", label: "ICT", databaseValues: ["ICT", "ICT Admin"] },
  { value: "Principal", label: "Principal", databaseValues: ["Principal"] },
] as const;

export const AUDIT_ACTION_OPTIONS = [
  { value: "Login", label: "Login", databaseValues: ["Login"] },
  { value: "Logout", label: "Logout", databaseValues: ["Logout"] },
  { value: "Failed Login", label: "Failed Login", databaseValues: ["Failed Login"] },
  { value: "Password Reset", label: "Password Reset", databaseValues: ["Password Reset"] },
  { value: "Security Alert", label: "Security Alert", databaseValues: ["Security Alert"] },
  { value: "Update", label: "Update", databaseValues: ["Update", "edited"] },
  { value: "Approve", label: "Approve", databaseValues: ["Approve", "approved"] },
  { value: "Reject", label: "Reject", databaseValues: ["Reject", "rejected"] },
  { value: "Delete", label: "Delete", databaseValues: ["deleted", "Permanently Delete"] },
  { value: "Message", label: "Message", databaseValues: ["Message", "Message Sent"] },
  { value: "Announcement Published", label: "Announcement Published", databaseValues: ["Announcement Published"] },
  { value: "Announcement Scheduled", label: "Announcement Scheduled", databaseValues: ["Announcement Scheduled"] },
  { value: "Announcement Updated", label: "Announcement Updated", databaseValues: ["Announcement Updated"] },
  { value: "Announcement Deleted", label: "Announcement Deleted", databaseValues: ["Announcement Deleted"] },
  { value: "Submit Report", label: "Submit Report", databaseValues: ["Submit Report", "Report Submitted"] },
  { value: "Report Viewed", label: "Report Viewed", databaseValues: ["Report Viewed"] },
  { value: "Report Status Updated", label: "Report Status Updated", databaseValues: ["Report Status Updated"] },
  { value: "Report Resolved", label: "Report Resolved", databaseValues: ["Report Resolved"] },
  { value: "Escalated to Guidance", label: "Escalated to Guidance", databaseValues: ["Escalated to Guidance"] },
  { value: "Escalated to Principal", label: "Escalated to Principal", databaseValues: ["Escalated to Principal"] },
  { value: "Ticket Submitted", label: "Ticket Submitted", databaseValues: ["Ticket Submitted"] },
  { value: "Ticket Accepted", label: "Ticket Accepted", databaseValues: ["Ticket Accepted"] },
  { value: "Ticket Rejected", label: "Ticket Rejected", databaseValues: ["Ticket Rejected"] },
  { value: "Attendance Recorded", label: "Attendance Recorded", databaseValues: ["Attendance Recorded"] },
  { value: "Attendance Corrected", label: "Attendance Corrected", databaseValues: ["Attendance Corrected"] },
  { value: "Attendance Auto-marked", label: "Attendance Auto-marked", databaseValues: ["Attendance Auto-marked"] },
  { value: "Class Session Updated", label: "Class Session Updated", databaseValues: ["Class Session Updated"] },
  { value: "RFID Assigned", label: "RFID Assigned", databaseValues: ["RFID Assigned"] },
  { value: "RFID Revoked", label: "RFID Revoked", databaseValues: ["RFID Revoked"] },
  { value: "Students Imported", label: "Students Imported", databaseValues: ["Students Imported"] },
  { value: "School Year Created", label: "School Year Created", databaseValues: ["School Year Created"] },
  { value: "School Year Updated", label: "School Year Updated", databaseValues: ["School Year Updated"] },
  { value: "Request Bulk Deletion", label: "Request Bulk Deletion", databaseValues: ["Request Bulk Deletion"] },
  { value: "Schedule Bulk Deletion", label: "Schedule Bulk Deletion", databaseValues: ["Schedule Bulk Deletion"] },
  { value: "Approve Deletion Request", label: "Approve Deletion Request", databaseValues: ["Approve Deletion Request"] },
  { value: "Reject Deletion Request", label: "Reject Deletion Request", databaseValues: ["Reject Deletion Request"] },
  { value: "Record Archived", label: "Record Archived", databaseValues: ["Record Archived"] },
  { value: "Record Restored", label: "Record Restored", databaseValues: ["Record Restored"] },
  { value: "Revert Deletion", label: "Revert Deletion", databaseValues: ["Revert Deletion"] },
  { value: "Subject Teacher Report OTP", label: "Subject Teacher Report OTP", databaseValues: ["Subject Teacher Report OTP"] },
] as const;

function databaseValuesFor<T extends ReadonlyArray<{ value: string; databaseValues: readonly string[] }>>(options: T, value: string) {
  return options.find((option) => option.value === value)?.databaseValues ?? [value];
}

export function auditRoleDatabaseValues(value: string): readonly string[] {
  return databaseValuesFor(AUDIT_ROLE_OPTIONS, value);
}

export function auditActionDatabaseValues(value: string): readonly string[] {
  return databaseValuesFor(AUDIT_ACTION_OPTIONS, value);
}

export function normalizeAuditRole(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return AUDIT_ROLE_OPTIONS.find((option) => option.databaseValues.some((databaseValue) => databaseValue.toLowerCase() === normalized.toLowerCase()))?.label ?? normalized;
}

export function normalizeAuditAction(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return AUDIT_ACTION_OPTIONS.find((option) => option.databaseValues.some((databaseValue) => databaseValue.toLowerCase() === normalized.toLowerCase()))?.label ?? normalized;
}

/** Failed sign-ins are security alerts even though their stored action is
 * intentionally more specific than the generic "Security Alert" label. */
export function isSecurityAuditAction(action: string | null | undefined): boolean {
  const normalized = normalizeAuditAction(action).toLowerCase();
  return normalized === "security alert" || normalized === "failed login";
}

export function matchesAuditRoleFilter(role: string, filter: string): boolean {
  return !filter || auditRoleDatabaseValues(filter).some((value) => value.toLowerCase() === role.toLowerCase());
}

export function matchesAuditActionFilter(action: string, filter: string): boolean {
  return !filter || auditActionDatabaseValues(filter).some((value) => value.toLowerCase() === action.toLowerCase());
}
