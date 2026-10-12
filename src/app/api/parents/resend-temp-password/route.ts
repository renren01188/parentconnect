import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { getJwtSecret } from "@/lib/authSecret";
import { sendTempPasswordEmail } from "@/lib/mailer";
import {
  createTemporaryPassword,
  createTemporaryPasswordProof,
  PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS,
  PARENT_TEMPORARY_PASSWORD_TTL_SECONDS,
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  temporaryPasswordExpiryEpochSeconds,
} from "@/lib/parentTemporaryPassword";
import { PARENT_SIGNUP_CONFIRMATION_MESSAGE } from "@/lib/parentSignupConfirmation";

const SECRET = getJwtSecret();

type PendingSignup = {
  pendingParentId: number | null;
  email: string;
  studentId: string;
  parentName: string;
  studentName: string;
  grade: string | number;
  section: string | number;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  contactNumber: string;
  relationship: "Father" | "Mother" | "Guardian";
  guardianRelationship: string;
  temporaryPasswordExpiresAt: string;
};

function readString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function readTextOrNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" || typeof value === "number" ? value : "";
}

function parseDate(value: unknown) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function pendingSignupFromPayload(payload: Record<string, unknown>): PendingSignup | null {
  const relationship = readString(payload, "relationship");
  const pendingParentIdValue = payload.pendingParentId;
  const pendingParentId = pendingParentIdValue == null ? null : Number(pendingParentIdValue);
  const validPendingParentId = pendingParentId == null || (Number.isSafeInteger(pendingParentId) && pendingParentId > 0);
  const signup: PendingSignup = {
    pendingParentId,
    email: readString(payload, "email").toLowerCase(),
    studentId: readString(payload, "studentId"),
    parentName: readString(payload, "parentName") || "Parent / Guardian",
    studentName: readString(payload, "studentName") || "Student",
    grade: readTextOrNumber(payload, "grade"),
    section: readTextOrNumber(payload, "section"),
    firstName: readString(payload, "firstName"),
    middleName: readString(payload, "middleName"),
    lastName: readString(payload, "lastName"),
    suffix: readString(payload, "suffix"),
    contactNumber: readString(payload, "contactNumber"),
    relationship: relationship as PendingSignup["relationship"],
    guardianRelationship: readString(payload, "guardianRelationship"),
    temporaryPasswordExpiresAt: readString(payload, "temporaryPasswordExpiresAt"),
  };

  if (
    payload.role !== "pending-parent-signup"
    || !validPendingParentId
    || !signup.firstName
    || !signup.lastName
    || !signup.email
    || !signup.studentId
    || !signup.contactNumber
    || !["Father", "Mother", "Guardian"].includes(signup.relationship)
    || !signup.temporaryPasswordExpiresAt
  ) return null;

  return signup;
}

function resendAvailableAt(payload: Record<string, unknown>, expiresAtMs: number) {
  const storedAvailableAt = parseDate(payload.temporaryPasswordResendAvailableAt);
  if (storedAvailableAt != null) return storedAvailableAt;

  // Pending cookies issued before the resend feature did not store this
  // timestamp. Their JWT issue time, or their known 10-minute lifetime,
  // still lets us enforce the same two-minute delay safely.
  const issuedAtSeconds = Number(payload.iat);
  if (Number.isFinite(issuedAtSeconds) && issuedAtSeconds > 0) {
    return issuedAtSeconds * 1_000 + PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS * 1_000;
  }
  return expiresAtMs - PARENT_TEMPORARY_PASSWORD_TTL_SECONDS * 1_000
    + PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS * 1_000;
}

function retryAfterSeconds(availableAtMs: number) {
  return Math.max(1, Math.ceil((availableAtMs - Date.now()) / 1_000));
}

async function readPendingSignup() {
  const cookieStore = await cookies();
  const token = cookieStore.get("parent_signup_token")?.value;
  if (!token) return { cookieStore, signup: null, payload: null, expiresAtMs: null };

  try {
    const verified = await jwtVerify(token, SECRET);
    const payload = verified.payload as Record<string, unknown>;
    const signup = pendingSignupFromPayload(payload);
    const expirySeconds = temporaryPasswordExpiryEpochSeconds(signup?.temporaryPasswordExpiresAt);
    const expiresAtMs = expirySeconds ? expirySeconds * 1_000 : null;
    if (!signup || !expiresAtMs || expiresAtMs <= Date.now()) {
      return { cookieStore, signup: null, payload: null, expiresAtMs: null };
    }
    return { cookieStore, signup, payload, expiresAtMs };
  } catch {
    return { cookieStore, signup: null, payload: null, expiresAtMs: null };
  }
}

function expiredResponse(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete("parent_signup_token");
  return NextResponse.json({
    success: false,
    temporaryPasswordExpired: true,
    redirectTo: "/login/guardian?signup=1&tempPasswordExpired=1",
    message: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  }, { status: 401 });
}

export async function GET() {
  const pending = await readPendingSignup();
  if (!pending.signup || !pending.payload || !pending.expiresAtMs) return expiredResponse(pending.cookieStore);

  const availableAtMs = resendAvailableAt(pending.payload, pending.expiresAtMs);
  return NextResponse.json({
    success: true,
    expiresAt: new Date(pending.expiresAtMs).toISOString(),
    resendAvailableAt: new Date(availableAtMs).toISOString(),
  });
}

export async function POST() {
  const pending = await readPendingSignup();
  if (!pending.signup || !pending.payload || !pending.expiresAtMs) return expiredResponse(pending.cookieStore);

  const availableAtMs = resendAvailableAt(pending.payload, pending.expiresAtMs);
  if (Date.now() < availableAtMs) {
    return NextResponse.json({
      success: false,
      message: `You can resend a temporary password in ${retryAfterSeconds(availableAtMs)} seconds.`,
      retryAfterSeconds: retryAfterSeconds(availableAtMs),
      resendAvailableAt: new Date(availableAtMs).toISOString(),
    }, { status: 429 });
  }

  const issuedAt = new Date();
  const nextResendAvailableAt = new Date(
    issuedAt.getTime() + PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS * 1_000,
  );
  const { password, expiresAt } = createTemporaryPassword(issuedAt.getTime());
  const expiresAtSeconds = temporaryPasswordExpiryEpochSeconds(expiresAt);
  if (!expiresAtSeconds) {
    return NextResponse.json({ success: false, message: "Unable to issue a new temporary password. Please try again." }, { status: 500 });
  }

  try {
    await sendTempPasswordEmail({
      parentEmail: pending.signup.email,
      parentName: pending.signup.parentName,
      studentName: pending.signup.studentName,
      tempPassword: password,
    });
  } catch {
    // Keep the existing signed cookie intact if mail delivery fails, so the
    // recipient can still use the password that was already issued.
    return NextResponse.json({
      success: false,
      message: "We could not send a new temporary password. Your current temporary password is still valid; please try again.",
    }, { status: 503 });
  }

  const token = await new SignJWT({
    role: "pending-parent-signup",
    pendingParentId: pending.signup.pendingParentId,
    email: pending.signup.email,
    studentId: pending.signup.studentId,
    parentName: pending.signup.parentName,
    studentName: pending.signup.studentName,
    grade: pending.signup.grade,
    section: pending.signup.section,
    firstName: pending.signup.firstName,
    middleName: pending.signup.middleName,
    lastName: pending.signup.lastName,
    suffix: pending.signup.suffix,
    contactNumber: pending.signup.contactNumber,
    relationship: pending.signup.relationship,
    guardianRelationship: pending.signup.guardianRelationship,
    temporaryPasswordProof: createTemporaryPasswordProof(password),
    temporaryPasswordExpiresAt: expiresAt.toISOString(),
    temporaryPasswordIssuedAt: issuedAt.toISOString(),
    temporaryPasswordResendAvailableAt: nextResendAvailableAt.toISOString(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1_000))
    .setExpirationTime(expiresAtSeconds)
    .sign(SECRET);

  pending.cookieStore.set("parent_signup_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: PARENT_TEMPORARY_PASSWORD_TTL_SECONDS,
    path: "/",
  });

  return NextResponse.json({
    success: true,
    expiresAt: expiresAt.toISOString(),
    resendAvailableAt: nextResendAvailableAt.toISOString(),
    message: `${PARENT_SIGNUP_CONFIRMATION_MESSAGE} Your previous temporary password is now invalid.`,
  });
}
