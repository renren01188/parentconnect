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
      target_user:       payload.targetUser  ?? null,
      target_role:       payload.targetRole  ?? null,
      target_email:      payload.targetEmail ?? null,
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
