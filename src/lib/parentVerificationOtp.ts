import crypto from "crypto";
import { supabase } from "@/lib/supabase";

export type ParentOtpPurpose = "signup" | "password_reset";
export type ParentOtpChannel = "email" | "sms";

export const PARENT_OTP_TTL_SECONDS = 10 * 60;
export const PARENT_OTP_RESEND_COOLDOWN_SECONDS = 60;

type OtpRow = {
  result: "issued" | "cooldown" | "stale" | "invalid" | "used" | "expired" | "locked" | "incorrect" | "verified";
  parent_id: number | null;
  channel: ParentOtpChannel | null;
  expires_at: string | null;
  resend_available_at?: string | null;
  retry_after_seconds: number | null;
};

function otpSecret() {
  const secret = process.env.PARENT_OTP_SECRET ?? process.env.PASSWORD_RESET_OTP_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("PARENT_OTP_SECRET, PASSWORD_RESET_OTP_SECRET, or NEXTAUTH_SECRET must be configured.");
  return secret;
}

function safeSeconds(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.ceil(numeric) : 0;
}

function rpcRow(data: unknown): OtpRow {
  const row = (Array.isArray(data) ? data[0] : data) as OtpRow | null;
  if (!row || typeof row.result !== "string") throw new Error("Parent verification challenge did not return a result.");
  return row;
}

export function createParentOtp() {
  return crypto.randomInt(100_000, 1_000_000).toString();
}

export function hashParentOtp(challengeId: string, purpose: ParentOtpPurpose, otp: string) {
  return crypto.createHmac("sha256", otpSecret()).update(`${challengeId}:${purpose}:${otp}`).digest("hex");
}

export async function issueParentOtp(input: {
  challengeId: string;
  parentId: number | null;
  purpose: ParentOtpPurpose;
  channel: ParentOtpChannel;
  replaceExisting?: boolean;
}) {
  const otp = createParentOtp();
  const issuedAt = Date.now();
  const expiresAt = new Date(issuedAt + PARENT_OTP_TTL_SECONDS * 1_000).toISOString();
  const resendAvailableAt = new Date(issuedAt + PARENT_OTP_RESEND_COOLDOWN_SECONDS * 1_000).toISOString();
  const { data, error } = await supabase.rpc("issue_parent_verification_otp", {
    p_challenge_id: input.challengeId,
    p_parent_id: input.parentId,
    p_purpose: input.purpose,
    p_channel: input.channel,
    p_otp_hash: hashParentOtp(input.challengeId, input.purpose, otp),
    p_expires_at: expiresAt,
    p_resend_available_at: resendAvailableAt,
    p_replace_existing: input.replaceExisting === true,
  });
  if (error) throw error;
  const row = rpcRow(data);
  return {
    result: row.result,
    otp: row.result === "issued" ? otp : null,
    expiresAt: row.expires_at ?? expiresAt,
    resendAvailableAt: row.resend_available_at ?? resendAvailableAt,
    retryAfterSeconds: safeSeconds(row.retry_after_seconds),
  };
}

/**
 * A server-only preflight used to avoid consuming the broader reset-request
 * rate limiter when the durable OTP row is already cooling down. The issuing
 * RPC remains the concurrent-safe authority and repeats these checks.
 */
export async function getParentOtpLimit(parentId: number, purpose: ParentOtpPurpose) {
  if (!Number.isSafeInteger(parentId) || parentId <= 0) throw new Error("Invalid Parent account.");
  const { data, error } = await supabase
    .from("parent_verification_otps")
    .select("locked_until, resend_available_at")
    .eq("parent_id", parentId)
    .eq("purpose", purpose)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { result: "ready" as const, retryAfterSeconds: 0, resendAvailableAt: null as string | null };

  const now = Date.now();
  const lockedUntil = Date.parse(data.locked_until ?? "");
  if (Number.isFinite(lockedUntil) && lockedUntil > now) {
    return { result: "locked" as const, retryAfterSeconds: Math.ceil((lockedUntil - now) / 1_000), resendAvailableAt: data.resend_available_at ?? null };
  }
  const resendAvailableAt = Date.parse(data.resend_available_at ?? "");
  if (Number.isFinite(resendAvailableAt) && resendAvailableAt > now) {
    return { result: "cooldown" as const, retryAfterSeconds: Math.ceil((resendAvailableAt - now) / 1_000), resendAvailableAt: data.resend_available_at ?? null };
  }
  return { result: "ready" as const, retryAfterSeconds: 0, resendAvailableAt: data.resend_available_at ?? null };
}

export async function verifyParentOtp(challengeId: string, purpose: ParentOtpPurpose, otp: string) {
  const { data, error } = await supabase.rpc("verify_parent_verification_otp", {
    p_challenge_id: challengeId,
    p_purpose: purpose,
    p_otp_hash: hashParentOtp(challengeId, purpose, otp),
  });
  if (error) throw error;
  const row = rpcRow(data);
  return {
    result: row.result,
    parentId: row.parent_id == null ? null : Number(row.parent_id),
    channel: row.channel,
    expiresAt: row.expires_at,
    retryAfterSeconds: safeSeconds(row.retry_after_seconds),
  };
}
