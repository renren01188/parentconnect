import { supabase } from "@/lib/supabase";

export interface AuditPayload {
  action: string;          // "Login" | "Logout" | "Submit Report" | "Message" | "Escalate" | "Resolve"
  performedBy: string;     // Full name of the actor
  performedByRole: string; // "Parent" | "Adviser" | "Principal" | "ICT Admin"
  performedByEmail?: string;
  targetUser?: string;
  targetRole?: string;
  targetEmail?: string;
  details?: string;        // Human-readable description
  module?: string;         // "Reports" | "Auth" | "Users"
  ipAddress?: string;
  browser?: string;
  changes?: unknown[];
}

/**
 * Write a single audit log entry to the `audit_log` table.
 * Errors are caught and logged to console only — never thrown —
 * so audit failures never interrupt the actual user action.
 */
export async function logAudit(payload: AuditPayload): Promise<void> {
  try {
    const insert: Record<string, unknown> = {
      action:            payload.action,
      performed_by:      payload.performedBy,
      performed_by_role: payload.performedByRole,
      details:           payload.details ?? null,
      // The existing audit_log schema requires target fields. System-level
      // events (for example Login/Logout) have no separate target, so retain
      // them with explicit values instead of inserting NULL.
      target_user:       payload.targetUser  ?? "System",
      target_role:       payload.targetRole  ?? "System",
      target_email:      payload.targetEmail ?? "N/A",
      module:            payload.module      ?? null,
      ip_address:        payload.ipAddress   ?? null,
      browser:           payload.browser     ?? null,
      changes:           payload.changes     ?? null,
    };

    const { error } = await supabase.from("audit_log").insert(insert);
    if (error) throw error;
  } catch (err) {
    // Never let audit errors surface to the user
    console.error("[audit] logAudit failed:", err);
  }
}

/** Records failed authentication attempts without exposing credentials. */
export async function logSecurityAlert({
  request,
  identifier,
  role,
  reason,
}: {
  request: Request;
  identifier: string;
  role: string;
  reason: string;
}): Promise<void> {
  const attemptedIdentifier = identifier.trim() || "Unknown account";
  await logAudit({
    action: "Security Alert",
    performedBy: attemptedIdentifier,
    performedByRole: role,
    targetUser: attemptedIdentifier,
    targetRole: role,
    targetEmail: attemptedIdentifier.includes("@") ? attemptedIdentifier : "N/A",
    module: "Auth",
    details: `Failed sign-in attempt: ${reason}`,
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    browser: request.headers.get("user-agent") ?? undefined,
  });
}
