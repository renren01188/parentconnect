import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";

type LimitRow = { allowed: boolean; retry_after_seconds: number };

/** The reset-code endpoint must not send mail if its shared limiter is down. */
export class ParentPasswordResetRateLimitUnavailableError extends Error {
  constructor() {
    super("Password reset is temporarily unavailable. Please try again later.");
    this.name = "ParentPasswordResetRateLimitUnavailableError";
  }
}

export function isParentPasswordResetRateLimitUnavailableError(error: unknown) {
  return error instanceof ParentPasswordResetRateLimitUnavailableError;
}

/**
 * Limits each matched Parent account before an email is sent. Only a hash of
 * the server-validated account ID reaches the database rate-limit table.
 */
export async function consumeParentPasswordResetRateLimit(parentId: number) {
  if (!Number.isSafeInteger(parentId) || parentId <= 0) {
    throw new ParentPasswordResetRateLimitUnavailableError();
  }
  const subjectHash = createHash("sha256")
    .update(`parent-password-reset:${parentId}`)
    .digest("hex");
  const { data, error } = await supabase.rpc("consume_parent_password_reset_rate_limit", {
    p_subject_hash: subjectHash,
    p_limit: 3,
    p_window_seconds: 15 * 60,
  });
  if (error) throw new ParentPasswordResetRateLimitUnavailableError();

  const row = (Array.isArray(data) ? data[0] : data) as LimitRow | null;
  if (!row) throw new ParentPasswordResetRateLimitUnavailableError();

  return {
    allowed: Boolean(row.allowed),
    retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 15 * 60),
  };
}
