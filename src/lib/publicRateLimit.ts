import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";

type LimitRow = { allowed: boolean; retry_after_seconds: number };

/** The public API must fail closed when the shared limiter is unavailable. */
export class PublicRateLimitUnavailableError extends Error {
  constructor() {
    super("Public request protection is temporarily unavailable. Please try again later.");
    this.name = "PublicRateLimitUnavailableError";
  }
}

export function isPublicRateLimitUnavailableError(error: unknown) {
  return error instanceof PublicRateLimitUnavailableError;
}

/**
 * Shared server-side limiter. Callers provide a server-validated identity
 * (for example a matched student LRN or normalized DepEd email), never a
 * forwarding/IP header supplied by the browser.
 */
export async function consumePublicRateLimit(
  scope: string,
  trustedSubject: string,
  limit: number,
  windowSeconds: number,
) {
  const subjectHash = createHash("sha256")
    .update(`${scope}:${trustedSubject.trim().toLocaleLowerCase()}`)
    .digest("hex");
  const { data, error } = await supabase.rpc("consume_public_api_rate_limit", {
    p_scope: scope,
    p_subject_hash: subjectHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new PublicRateLimitUnavailableError();
  const row = (Array.isArray(data) ? data[0] : data) as LimitRow | null;
  if (!row) throw new PublicRateLimitUnavailableError();
  return { allowed: Boolean(row.allowed), retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || windowSeconds) };
}
