import { supabase } from "@/lib/supabase";
import {
  ICT_PASSWORD_SESSION_REVOCATION_ACTION,
  isTokenRevokedByPasswordChange,
  passwordSessionAuditRole,
  type PasswordSessionRole,
} from "@/lib/passwordSessionRevocation";

type SessionPayload = { sessionIssuedAt?: unknown; iat?: unknown; exp?: unknown };

/** Returns true only when the supplied token predates ICT's latest reset. */
export async function isPasswordSessionRevoked({
  role,
  accountId,
  payload,
}: {
  role: PasswordSessionRole;
  accountId: number;
  payload: SessionPayload;
}) {
  if (!Number.isSafeInteger(accountId) || accountId <= 0) return true;

  const { data, error } = await supabase
    .from("audit_log")
    .select("created_at")
    .eq("action", ICT_PASSWORD_SESSION_REVOCATION_ACTION)
    .eq("target_type", "user")
    .eq("target_id", String(accountId))
    .eq("target_role", passwordSessionAuditRole(role))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // This check protects a credential boundary.  If the durable revocation
  // record cannot be read, do not continue using a potentially reset token.
  if (error) {
    console.error("Unable to validate password session revocation:", error.message);
    return true;
  }
  if (!data?.created_at) return false;

  return isTokenRevokedByPasswordChange(payload, role, data.created_at);
}
