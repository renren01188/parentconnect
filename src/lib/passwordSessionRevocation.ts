/**
 * A password changed by ICT must invalidate every previously issued session
 * for that account.  The marker itself is stored in audit_log so it remains
 * available to every server instance without exposing any credential data.
 */
export type PasswordSessionRole = "parent" | "adviser" | "guidance";

/** New self-service and ICT resets share this durable audit action. */
export const PASSWORD_SESSION_REVOCATION_ACTION = "Password Session Revoked";

/**
 * Retained while existing ICT-generated audit records age out. New ICT
 * account-management writes still use this action until that flow is migrated.
 */
export const ICT_PASSWORD_SESSION_REVOCATION_ACTION = "ICT Password Session Revoked";

export const PASSWORD_SESSION_REVOCATION_ACTIONS = [
  PASSWORD_SESSION_REVOCATION_ACTION,
  ICT_PASSWORD_SESSION_REVOCATION_ACTION,
] as const;

const roleLabels: Record<PasswordSessionRole, "Parent" | "Adviser" | "Guidance"> = {
  parent: "Parent",
  adviser: "Adviser",
  guidance: "Guidance",
};

const sessionLifetimeMs: Record<PasswordSessionRole, number> = {
  parent: 24 * 60 * 60 * 1_000,
  adviser: 8 * 60 * 60 * 1_000,
  guidance: 8 * 60 * 60 * 1_000,
};

export function passwordSessionAuditRole(role: PasswordSessionRole) {
  return roleLabels[role];
}

function finitePositive(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * New tokens retain millisecond precision so a new sign-in immediately after
 * a reset is distinguishable from the old session.  The iat/exp fallback
 * preserves safe invalidation for tokens issued before this field existed.
 */
export function sessionIssuedAtMs(
  payload: { sessionIssuedAt?: unknown; iat?: unknown; exp?: unknown },
  role: PasswordSessionRole,
) {
  const issuedAt = finitePositive(payload.sessionIssuedAt);
  if (issuedAt) return issuedAt;

  const iat = finitePositive(payload.iat);
  if (iat) return iat * 1_000;

  const expiration = finitePositive(payload.exp);
  return expiration ? expiration * 1_000 - sessionLifetimeMs[role] : null;
}

export function isTokenRevokedByPasswordChange(
  payload: { sessionIssuedAt?: unknown; iat?: unknown; exp?: unknown },
  role: PasswordSessionRole,
  revokedAt: string | null | undefined,
) {
  const revokedAtMs = Date.parse(String(revokedAt ?? ""));
  const issuedAtMs = sessionIssuedAtMs(payload, role);
  // An unverifiable issue time cannot be safely accepted after a reset.
  return !Number.isFinite(revokedAtMs) || !issuedAtMs || issuedAtMs <= revokedAtMs;
}
