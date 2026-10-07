import crypto from "crypto";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export const SUBJECT_TEACHER_REPORT_COOKIE = "subject_teacher_report_token";
export const SUBJECT_TEACHER_OTP_EXPIRY_MINUTES = 10;
export const SUBJECT_TEACHER_OTP_RESEND_COOLDOWN_MS = 60_000;
export const SUBJECT_TEACHER_OTP_MAX_ATTEMPTS = 5;

function secret() {
  const value = process.env.SUBJECT_TEACHER_REPORT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("SUBJECT_TEACHER_REPORT_SECRET or NEXTAUTH_SECRET must be configured.");
  return value;
}

export function signingKey() {
  return new TextEncoder().encode(secret());
}

export function normalizeDepEdEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isDepEdEmail(value: unknown) {
  const email = normalizeDepEdEmail(value);
  return /^[a-z0-9._%+-]+@deped\.gov\.ph$/i.test(email);
}

/** Allows one configured address to exercise the OTP flow on a local dev server. */
function isLocalTestEmail(value: unknown) {
  if (process.env.NODE_ENV !== "development") return false;
  const configuredEmail = normalizeDepEdEmail(process.env.SUBJECT_TEACHER_TEST_EMAIL);
  return Boolean(configuredEmail) && normalizeDepEdEmail(value) === configuredEmail;
}

/** Production and preview deployments remain strictly @deped.gov.ph-only. */
export function isAllowedSubjectTeacherEmail(value: unknown) {
  return isDepEdEmail(value) || isLocalTestEmail(value);
}

export function otpHash(email: string, otp: string) {
  return crypto.createHmac("sha256", secret()).update(`${normalizeDepEdEmail(email)}:${otp}`).digest("hex");
}

export function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function getVerifiedSubjectTeacher() {
  const token = (await cookies()).get(SUBJECT_TEACHER_REPORT_COOKIE)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, signingKey());
    const payload = verified.payload;
    if (payload.role !== "subject_teacher_report" || typeof payload.email !== "string" || !isAllowedSubjectTeacherEmail(payload.email)) return null;
    return { email: normalizeDepEdEmail(payload.email) };
  } catch {
    return null;
  }
}
