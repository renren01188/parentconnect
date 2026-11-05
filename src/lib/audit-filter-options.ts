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
  { value: "Password Session Revoked", label: "Password Session Revoked", databaseValues: ["Password Session Revoked", "ICT Password Session Revoked"] },
  { value: "Security Alert", label: "Security Alert", databaseValues: ["Security Alert"] },
  { value: "Subject Teacher OTP CAPTCHA Failed", label: "Subject Teacher OTP CAPTCHA Failed", databaseValues: ["Subject Teacher OTP CAPTCHA Failed"] },
  { value: "Subject Teacher OTP Rate Limited", label: "Subject Teacher OTP Rate Limited", databaseValues: ["Subject Teacher OTP Rate Limited"] },
  // A grouped filter which powers the Security Alerts summary card. It stays
  // after its individual actions so stored entries retain their precise label.
  { value: "Security Events", label: "Security Events", databaseValues: ["Failed Login", "Security Alert", "Subject Teacher OTP CAPTCHA Failed", "Subject Teacher OTP Rate Limited"] },
  { value: "Password Activated", label: "Password Activated", databaseValues: ["Password Activated"] },
  { value: "Password Updated", label: "Password Updated", databaseValues: ["Password Updated"] },
  { value: "Temporary Password Resent", label: "Temporary Password Resent", databaseValues: ["Temporary Password Resent"] },
  { value: "Account Created", label: "Account Created", databaseValues: ["Account Created"] },
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
  { value: "Student Report Submitted", label: "Student Report Submitted", databaseValues: ["Student Report Submitted"] },
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
  { value: "Attendance Edited", label: "Attendance Edited", databaseValues: ["Attendance Edited"] },
  { value: "Rapid Tap Attendance Corrected", label: "Rapid Tap Attendance Corrected", databaseValues: ["Rapid Tap Attendance Corrected"] },
  { value: "Attendance Auto-marked", label: "Attendance Auto-marked", databaseValues: ["Attendance Auto-marked"] },
  { value: "Manual Excuse Recorded", label: "Manual Excuse Recorded", databaseValues: ["Manual Excuse Recorded"] },
  { value: "Class Session Updated", label: "Class Session Updated", databaseValues: ["Class Session Updated"] },
  { value: "RFID Assigned", label: "RFID Assigned", databaseValues: ["RFID Assigned"] },
  { value: "RFID Revoked", label: "RFID Revoked", databaseValues: ["RFID Revoked"] },
  { value: "RFID Replaced", label: "RFID Replaced", databaseValues: ["RFID Replaced"] },
  { value: "Students Imported", label: "Students Imported", databaseValues: ["Students Imported"] },
  { value: "Student LRN Corrected", label: "Student LRN Corrected", databaseValues: ["Student LRN Corrected"] },
  { value: "Student Profile Updated", label: "Student Profile Updated", databaseValues: ["Student Profile Updated"] },
  { value: "School Year Created", label: "School Year Created", databaseValues: ["School Year Created"] },
  { value: "School Year Updated", label: "School Year Updated", databaseValues: ["School Year Updated"] },
  { value: "Request Bulk Deletion", label: "Request Bulk Deletion", databaseValues: ["Request Bulk Deletion"] },
  { value: "Schedule Bulk Deletion", label: "Schedule Bulk Deletion", databaseValues: ["Schedule Bulk Deletion"] },
  { value: "Approve Deletion Request", label: "Approve Deletion Request", databaseValues: ["Approve Deletion Request"] },
  { value: "Reject Deletion Request", label: "Reject Deletion Request", databaseValues: ["Reject Deletion Request"] },
  { value: "Record Archived", label: "Record Archived", databaseValues: ["Record Archived"] },
  { value: "Record Restored", label: "Record Restored", databaseValues: ["Record Restored"] },
  { value: "Revert Deletion", label: "Revert Deletion", databaseValues: ["Revert Deletion"] },
  { value: "Adviser Transfer Scheduled", label: "Adviser Transfer Scheduled", databaseValues: ["Adviser Transfer Scheduled"] },
  { value: "Adviser Transfer Completed", label: "Adviser Transfer Completed", databaseValues: ["Adviser Transfer Completed"] },
  { value: "Adviser Transfer Cancelled", label: "Adviser Transfer Cancelled", databaseValues: ["Adviser Transfer Cancelled"] },
  { value: "Adviser Transfer Failed", label: "Adviser Transfer Failed", databaseValues: ["Adviser Transfer Failed"] },
  { value: "Principal Succession", label: "Principal Succession", databaseValues: ["Principal Succession"] },
  { value: "Report Cancelled", label: "Report Cancelled", databaseValues: ["Report Cancelled"] },
  { value: "Subject Teacher Report OTP", label: "Subject Teacher Report OTP", databaseValues: ["Subject Teacher Report OTP"] },
] as const;

/** Every status currently written to `audit_log` by the application. */
export const AUDIT_STATUS_OPTIONS = [
  { value: "new", label: "New", databaseValues: ["new"] },
  { value: "read", label: "Read", databaseValues: ["read"] },
  { value: "ongoing", label: "Ongoing", databaseValues: ["ongoing"] },
  { value: "replied", label: "Replied", databaseValues: ["replied"] },
  { value: "escalated", label: "Escalated", databaseValues: ["escalated"] },
  { value: "resolved", label: "Resolved", databaseValues: ["resolved"] },
  { value: "Pending", label: "Pending", databaseValues: ["Pending"] },
  { value: "Approved", label: "Approved", databaseValues: ["Approved"] },
  { value: "accepted", label: "Accepted", databaseValues: ["accepted"] },
  { value: "rejected", label: "Rejected", databaseValues: ["rejected"] },
  { value: "cancelled", label: "Cancelled", databaseValues: ["cancelled"] },
  { value: "Pending Activation", label: "Pending Activation", databaseValues: ["Pending Activation"] },
  { value: "Active", label: "Active", databaseValues: ["Active"] },
  { value: "Inactive", label: "Inactive", databaseValues: ["Inactive"] },
  { value: "Scheduled", label: "Scheduled", databaseValues: ["Scheduled"] },
  { value: "Published", label: "Published", databaseValues: ["Published"] },
  { value: "Ended", label: "Ended", databaseValues: ["Ended"] },
  { value: "Assigned", label: "Assigned", databaseValues: ["Assigned"] },
  { value: "Unassigned", label: "Unassigned", databaseValues: ["Unassigned"] },
  { value: "Imported", label: "Imported", databaseValues: ["Imported"] },
  { value: "Archived", label: "Archived", databaseValues: ["Archived"] },
  { value: "Restored", label: "Restored", databaseValues: ["Restored"] },
  { value: "On Time", label: "On Time", databaseValues: ["On Time"] },
  { value: "Late", label: "Late", databaseValues: ["Late"] },
  { value: "Absent", label: "Absent", databaseValues: ["Absent"] },
  { value: "Excused", label: "Excused", databaseValues: ["Excused"] },
  { value: "No record", label: "No record", databaseValues: ["No record"] },
] as const;

export const AUDIT_SECURITY_ALERT_ACTION_VALUES = [
  "Failed Login",
  "Security Alert",
  "Subject Teacher OTP CAPTCHA Failed",
  "Subject Teacher OTP Rate Limited",
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

export function auditStatusDatabaseValues(value: string): readonly string[] {
  return AUDIT_STATUS_OPTIONS.find((option) => option.value === value)?.databaseValues ?? [];
}

export function normalizeAuditRole(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return AUDIT_ROLE_OPTIONS.find((option) => option.databaseValues.some((databaseValue) => databaseValue.toLowerCase() === normalized.toLowerCase()))?.label ?? normalized;
}

/** Formats legacy audit text at the display boundary without changing stored
 * audit records, role values, or authorization behavior. */
export function displayGuidanceLabel(value: string | null | undefined): string {
  return String(value ?? "").replace(/\bGuidance\s+Counselor\b/gi, "Guidance");
}

export function normalizeAuditAction(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return AUDIT_ACTION_OPTIONS.find((option) => option.databaseValues.some((databaseValue) => databaseValue.toLowerCase() === normalized.toLowerCase()))?.label ?? normalized;
}

/** Failed sign-ins are security alerts even though their stored action is
 * intentionally more specific than the generic "Security Alert" label. */
export function isSecurityAuditAction(action: string | null | undefined): boolean {
  const normalized = String(action ?? "").trim().toLowerCase();
  return AUDIT_SECURITY_ALERT_ACTION_VALUES.some((value) => value.toLowerCase() === normalized);
}

export function matchesAuditRoleFilter(role: string, filter: string): boolean {
  return !filter || auditRoleDatabaseValues(filter).some((value) => value.toLowerCase() === role.toLowerCase());
}

export function matchesAuditActionFilter(action: string, filter: string): boolean {
  return !filter || auditActionDatabaseValues(filter).some((value) => value.toLowerCase() === action.toLowerCase());
}
