import { supabase } from "@/lib/supabase";
import { normalizeAuditRole } from "@/lib/audit-filter-options";

export interface AuditPayload {
  action: string;
  performedById?: string | number;
  performedBy: string;
  performedByRole: string;
  performedByEmail?: string;
  targetUser?: string;
  targetRole?: string;
  targetEmail?: string;
  details?: string;
  module?: string;
  ipAddress?: string;
  browser?: string;
  changes?: unknown[];
  targetType?: string;
  targetId?: string | number;
  previousStatus?: string | null;
  newStatus?: string | null;
  relatedReportId?: string | number;
  relatedTicketId?: string | number;
  relatedStudentId?: string | number;
  relatedUserId?: string | number;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY = /(?:pass(?:word)?|otp|captcha|token|secret|authorization|cookie|credential)/i;

/** Removes secrets from structured audit data before it can reach Supabase. */
export function redactAuditData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, nested]) => [key, redactAuditData(nested)])
  );
}

/** Writes a server-side record and rejects a success response if it fails. */
export async function logAudit(payload: AuditPayload): Promise<void> {
  const insert: Record<string, unknown> = {
    action: payload.action.trim(),
    performed_by_id: payload.performedById == null ? null : String(payload.performedById),
    performed_by: payload.performedBy,
    performed_by_role: normalizeAuditRole(payload.performedByRole),
    performed_by_email: payload.performedByEmail ?? null,
    details: payload.details ?? null,
    target_user: payload.targetUser ?? "System",
    target_role: payload.targetRole ?? "System",
    target_email: payload.targetEmail ?? "N/A",
    target_type: payload.targetType ?? "System",
    target_id: payload.targetId == null ? null : String(payload.targetId),
    module: payload.module ?? null,
    previous_status: payload.previousStatus ?? null,
    new_status: payload.newStatus ?? null,
    related_report_id: payload.relatedReportId == null ? null : String(payload.relatedReportId),
    related_ticket_id: payload.relatedTicketId == null ? null : String(payload.relatedTicketId),
    related_student_id: payload.relatedStudentId == null ? null : String(payload.relatedStudentId),
    related_user_id: payload.relatedUserId == null ? null : String(payload.relatedUserId),
    ip_address: payload.ipAddress ?? null,
    browser: payload.browser ?? null,
    changes: redactAuditData(payload.changes ?? null),
    metadata: redactAuditData(payload.metadata ?? null),
  };
  let { error } = await supabase.from("audit_log").insert(insert);
  // The deployed table may be one migration behind during a rolling release.
  // Preserve logging on its legacy shape; the full structured fields become
  // available as soon as 20260909_expand_audit_trail.sql is applied.
  if (error?.code === "PGRST204" || /column .* does not exist|schema cache/i.test(error?.message ?? "")) {
    ({ error } = await supabase.from("audit_log").insert({
      action: insert.action,
      performed_by: insert.performed_by,
      performed_by_role: insert.performed_by_role,
      details: insert.details,
      target_user: insert.target_user,
      target_role: insert.target_role,
      target_email: insert.target_email,
      module: insert.module,
      ip_address: insert.ip_address,
      browser: insert.browser,
      changes: insert.changes,
    }));
  }
  if (error) throw new Error(`Audit log write failed: ${error.message}`);
}

/** Records authentication failures without ever recording credentials. */
export async function logSecurityAlert({ request, identifier, role, reason }: {
  request: Request; identifier: string; role: string; reason: string;
}): Promise<void> {
  const attemptedIdentifier = identifier.trim() || "Unknown account";
  await logAudit({
    action: "Failed Login", performedBy: attemptedIdentifier, performedByRole: role,
    targetUser: attemptedIdentifier, targetRole: role,
    targetEmail: attemptedIdentifier.includes("@") ? attemptedIdentifier : "N/A",
    targetType: "User", module: "Auth", details: `Failed sign-in attempt: ${reason}`,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    browser: request.headers.get("user-agent") ?? undefined,
  });
}
