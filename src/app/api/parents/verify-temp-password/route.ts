import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/authSecret";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import { sameParentEnrollmentName } from "@/lib/familyName";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { ensureParentStudentLink, reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { sameGuardianRelationship } from "@/lib/guardianRelationship";
import {
  legacyTemporaryPasswordExpiryEpochSeconds,
  matchingTemporaryPasswordProof,
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  temporaryPasswordExpiryEpochSeconds,
  temporaryPasswordProofEntries,
} from "@/lib/parentTemporaryPassword";
import { verifyParentOtp } from "@/lib/parentVerificationOtp";

const SECRET = getJwtSecret();
const INCORRECT_PASSWORD_MESSAGE = "Please check the correct temporary password or check your email address if it is correct.";
const SIGNUP_RETRY_MESSAGE = "This signup could not be completed. Return to sign up and try again.";
const MOBILE_NUMBER_IN_USE_MESSAGE = "This mobile number is already linked to a ParentConnect account. Sign in to that account, or return to sign up and use another verified mobile number.";
const ACCOUNT_IDENTIFIER_CONFLICT_MESSAGE = "This email address or mobile number is already linked to a ParentConnect account. Return to sign up and use a different account identifier.";

type FamilyMember = {
  role: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  relationship: string | null;
  contact_number: string | null;
};

type ParentRow = {
  id: number;
  email: string | null;
  contact_number: string | null;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
  relationship: string | null;
  password: string;
  temp_password: string | null;
  temporary_password_expires_at: string | null;
  password_set: number | boolean | null;
  status: string | null;
  archive_status: string | null;
};

type PendingSignup = {
  pendingParentId: number | null;
  email: string;
  studentId: string;
  parentName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  contactNumber: string;
  relationship: "Father" | "Mother" | "Guardian";
  guardianRelationship: string;
  temporaryPasswordProof: string;
  temporaryPasswordExpiresAt: string;
  otpChallengeId: string;
};

const parentColumns = "id, email, contact_number, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, password, temp_password, temporary_password_expires_at, password_set, status, archive_status";

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return digits;
}

function matchesRecordedPhone(recorded: unknown, claimed: string) {
  const normalizedRecorded = normalizePhone(recorded);
  return !normalizedRecorded || normalizedRecorded === normalizePhone(claimed);
}

function isPasswordSet(value: ParentRow["password_set"]) {
  return value === true || value === 1;
}

function safeFinalizationMessage(error: unknown) {
  if (!(error instanceof Error)) return SIGNUP_RETRY_MESSAGE;
  return [MOBILE_NUMBER_IN_USE_MESSAGE, ACCOUNT_IDENTIFIER_CONFLICT_MESSAGE].includes(error.message)
    ? error.message
    : SIGNUP_RETRY_MESSAGE;
}

function safeErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "Unknown error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code ? code : error instanceof Error ? error.name : "Unknown error";
}

function readString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
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
    parentName: readString(payload, "parentName"),
    firstName: readString(payload, "firstName"),
    middleName: readString(payload, "middleName"),
    lastName: readString(payload, "lastName"),
    suffix: readString(payload, "suffix"),
    contactNumber: readString(payload, "contactNumber"),
    relationship: relationship as PendingSignup["relationship"],
    guardianRelationship: readString(payload, "guardianRelationship"),
    temporaryPasswordProof: readString(payload, "temporaryPasswordProof"),
    temporaryPasswordExpiresAt: readString(payload, "temporaryPasswordExpiresAt"),
    otpChallengeId: readString(payload, "otpChallengeId"),
  };

  if (
    payload.role !== "pending-parent-signup"
    || !validPendingParentId
    || !signup.firstName
    || !signup.lastName
    || !signup.studentId
    || !signup.contactNumber
    || !["Father", "Mother", "Guardian"].includes(signup.relationship)
  ) return null;
  return signup;
}

async function finalizePendingSignup(signup: PendingSignup, password: string, verificationExpiresAt = signup.temporaryPasswordExpiresAt) {
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id, student_id, first_name, last_name, grade, section")
    .eq("student_id", signup.studentId)
    .eq("archive_status", "active")
    .maybeSingle();
  if (studentError) throw studentError;
  if (!student) throw new Error(SIGNUP_RETRY_MESSAGE);

  const { data: familyMembers, error: familyError } = await supabase
    .from("student_family_members")
    .select("role, first_name, middle_name, last_name, suffix, relationship, contact_number")
    .eq("student_db_id", student.id)
    .eq("role", signup.relationship);
  if (familyError) throw familyError;
  const familyMember = ((familyMembers ?? []) as FamilyMember[])[0];
  if (
    !familyMember
    || !sameParentEnrollmentName(
      { firstName: signup.firstName, middleName: signup.middleName, lastName: signup.lastName },
      { firstName: familyMember.first_name, middleName: familyMember.middle_name, lastName: familyMember.last_name },
    )
    || (signup.relationship === "Guardian" && !sameGuardianRelationship(signup.guardianRelationship, familyMember.relationship || "Guardian"))
    || !matchesRecordedPhone(familyMember.contact_number, signup.contactNumber)
  ) throw new Error(SIGNUP_RETRY_MESSAGE);

  let existingParent: ParentRow | null = null;
  if (signup.pendingParentId) {
    const { data, error } = await supabase.from("parents").select(parentColumns).eq("id", signup.pendingParentId).maybeSingle();
    if (error) throw error;
    existingParent = data as ParentRow | null;
    if (!existingParent || !parentAccountCanAccess(existingParent) || isPasswordSet(existingParent.password_set)) {
      throw new Error(SIGNUP_RETRY_MESSAGE);
    }
  }

  const emailRows: ParentRow[] = signup.email
    ? await (async () => {
      const { data, error: emailError } = await supabase
        .from("parents")
        .select(parentColumns)
        .eq("email", signup.email);
      if (emailError) throw emailError;
      return (data ?? []) as ParentRow[];
    })()
    : [];
  const conflictingEmail = emailRows.some((parent) => parent.id !== existingParent?.id);
  // A matching name is not an account identifier. The verified LRN and the
  // email account are the only records considered here, so same-name parents
  // can complete separate signups without being blocked or cross-linked.
  if (conflictingEmail) throw new Error(SIGNUP_RETRY_MESSAGE);

  // Keep this check at finalization as well as signup. A different browser
  // can register the same mobile number after signup has issued its cookie
  // but before this request inserts the Parent account.
  const { data: phoneRows, error: phoneError } = await supabase
    .from("parents")
    .select("id")
    .eq("login_contact_number", signup.contactNumber);
  if (phoneError) throw phoneError;
  if ((phoneRows ?? []).some((parent) => Number(parent.id) !== existingParent?.id)) {
    throw new Error(MOBILE_NUMBER_IN_USE_MESSAGE);
  }

  const expirySeconds = temporaryPasswordExpiryEpochSeconds(verificationExpiresAt);
  if (!expirySeconds || expirySeconds * 1_000 <= Date.now()) throw new Error(SIGNUP_RETRY_MESSAGE);
  const temporaryPasswordHash = await bcrypt.hash(password, 12);
  const patch = {
    parent_first_name: signup.firstName,
    parent_middle_name: signup.middleName || null,
    parent_last_name: signup.lastName,
    parent_suffix: signup.suffix || familyMember.suffix || null,
    relationship: signup.relationship,
    email: signup.email || null,
    contact_number: signup.contactNumber,
    password: temporaryPasswordHash,
    temp_password: null,
    temporary_password_expires_at: verificationExpiresAt,
    password_set: 0,
    // The row is still a pending registration at this point, so it has no
    // Parent-selected preference to preserve. Newly registered Parents begin
    // with SMS and can later select Email or Neither from their profile.
    attendance_email_notifications: false,
    attendance_sms_notifications: true,
    attendance_notification_preference: "SMS",
  };

  let parent: ParentRow;
  let createdParentId: number | null = null;
  if (existingParent) {
    const { data, error } = await supabase
      .from("parents")
      .update(patch)
      .eq("id", existingParent.id)
      .neq("archive_status", "archived")
      .neq("password_set", 1)
      .select(parentColumns)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(SIGNUP_RETRY_MESSAGE);
    parent = data as ParentRow;
  } else {
    const { data, error } = await supabase
      .from("parents")
      .insert({ ...patch, student_id: student.student_id, status: "active" })
      .select(parentColumns)
      .single();
    if (error?.code === "23505") throw new Error(ACCOUNT_IDENTIFIER_CONFLICT_MESSAGE);
    if (error) throw error;
    parent = data as ParentRow;
    createdParentId = parent.id;
  }

  try {
    await ensureParentStudentLink({
      parentId: parent.id,
      studentId: student.student_id,
      relationship: signup.relationship,
    });
  } catch (error) {
    if (createdParentId) {
      await supabase.from("parents").delete().eq("id", createdParentId).eq("password", temporaryPasswordHash);
    }
    throw error;
  }

  // The directly verified child link above is required. Sibling reconciliation
  // is a convenience operation over historical records and must not block a
  // completed signup if one unrelated legacy row is malformed.
  try {
    await reconcileParentStudentLinks({ parentId: parent.id });
  } catch (error) {
    console.error("Parent sibling-link reconciliation failed after verified signup:", safeErrorCode(error));
  }

  return { parent, student, expiresAt: verificationExpiresAt };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const password = body?.password;
    const otp = body?.otp;
    if ((!password || typeof password !== "string") && (!otp || typeof otp !== "string")) {
      return NextResponse.json({ success: false, message: INCORRECT_PASSWORD_MESSAGE }, { status: 401 });
    }

    const cookieStore = await cookies();
    const temporaryPasswordExpired = () => {
      cookieStore.delete("parent_token");
      cookieStore.delete("parent_signup_token");
      return NextResponse.json({
        success: false,
        temporaryPasswordExpired: true,
        redirectTo: "/login/guardian?signup=1&tempPasswordExpired=1",
        message: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
      }, { status: 401 });
    };

    // New signups live only in a short-lived, HttpOnly cookie until the
    // recipient proves they received the emailed temporary password.
    const pendingToken = cookieStore.get("parent_signup_token")?.value;
    if (pendingToken) {
      let pendingPayload: Record<string, unknown>;
      try {
        const verified = await jwtVerify(pendingToken, SECRET);
        pendingPayload = verified.payload;
      } catch {
        return temporaryPasswordExpired();
      }

      const signup = pendingSignupFromPayload(pendingPayload);
      if (typeof otp === "string") {
        if (!signup?.otpChallengeId || !/^\d{6}$/.test(otp)) {
          return NextResponse.json({ success: false, message: "Enter the six-digit verification code." }, { status: 400 });
        }
        const otpResult = await verifyParentOtp(signup.otpChallengeId, "signup", otp);
        if (otpResult.result !== "verified" || !otpResult.expiresAt) {
          const wait = otpResult.retryAfterSeconds > 0
            ? ` Please wait ${otpResult.retryAfterSeconds} seconds before trying again.`
            : "";
          const message = otpResult.result === "expired"
            ? "This verification code has expired. Request a new code."
            : otpResult.result === "used"
              ? "This verification code was already used. Request a new code."
              : otpResult.result === "locked" || otpResult.result === "incorrect"
                ? `The verification code is incorrect.${wait}`
                : "This verification code is invalid. Request a new code.";
          return NextResponse.json({ success: false, message, retryAfterSeconds: otpResult.retryAfterSeconds }, { status: 400 });
        }

        let otpCompleted: Awaited<ReturnType<typeof finalizePendingSignup>>;
        try {
          otpCompleted = await finalizePendingSignup(signup, crypto.randomUUID(), otpResult.expiresAt);
        } catch (error) {
          console.error("SMS parent signup finalization failed:", safeErrorCode(error));
          return NextResponse.json({ success: false, message: safeFinalizationMessage(error) }, { status: 409 });
        }
        const otpParentName = [
          otpCompleted.parent.parent_first_name,
          otpCompleted.parent.parent_middle_name,
          otpCompleted.parent.parent_last_name,
          otpCompleted.parent.parent_suffix,
        ].filter(Boolean).join(" ") || "Parent / Guardian";
        const { token: otpVerifiedToken } = await issueDashboardIdleSession({
          id: otpCompleted.parent.id,
          role: "parent",
          email: otpCompleted.parent.email,
          studentId: otpCompleted.student.student_id,
          parentName: otpParentName,
          studentName: `${otpCompleted.student.first_name} ${otpCompleted.student.last_name}`.trim(),
          grade: otpCompleted.student.grade,
          section: otpCompleted.student.section,
          passwordSet: false,
          temporaryPasswordVerified: true,
          temporaryPasswordExpiresAt: otpCompleted.expiresAt,
        });
        cookieStore.set("parent_token", otpVerifiedToken, dashboardSessionCookieOptions);
        cookieStore.delete("parent_signup_token");
        return NextResponse.json({ success: true, expiresAt: otpCompleted.expiresAt, redirectTo: "/login/guardian/set-password" });
      }

      const proofEntries = temporaryPasswordProofEntries(pendingPayload);
      const hasActiveProof = proofEntries.some((entry) => {
        const proofExpiresAt = temporaryPasswordExpiryEpochSeconds(entry.expiresAt);
        return !!proofExpiresAt && proofExpiresAt * 1_000 > Date.now();
      });
      const matchingProof = signup
        ? matchingTemporaryPasswordProof(password, proofEntries)
        : null;
      const expirySeconds = temporaryPasswordExpiryEpochSeconds(matchingProof?.expiresAt);
      if (!signup || !signup.email || !hasActiveProof) {
        return temporaryPasswordExpired();
      }
      if (!matchingProof) {
        return NextResponse.json({ success: false, message: INCORRECT_PASSWORD_MESSAGE }, { status: 401 });
      }
      if (!expirySeconds || expirySeconds * 1_000 <= Date.now()) return temporaryPasswordExpired();

      let completed: Awaited<ReturnType<typeof finalizePendingSignup>>;
      try {
        completed = await finalizePendingSignup({
          ...signup,
          temporaryPasswordExpiresAt: matchingProof.expiresAt,
        }, password);
      } catch (error) {
        console.error("Pending parent signup finalization failed:", safeErrorCode(error));
        return NextResponse.json({ success: false, message: safeFinalizationMessage(error) }, { status: 409 });
      }

      const parentName = [
        completed.parent.parent_first_name,
        completed.parent.parent_middle_name,
        completed.parent.parent_last_name,
        completed.parent.parent_suffix,
      ].filter(Boolean).join(" ") || "Parent / Guardian";
      const { token: verifiedToken } = await issueDashboardIdleSession({
        id: completed.parent.id,
        role: "parent",
        email: completed.parent.email,
        studentId: completed.student.student_id,
        parentName,
        studentName: `${completed.student.first_name} ${completed.student.last_name}`.trim(),
        grade: completed.student.grade,
        section: completed.student.section,
        passwordSet: false,
        temporaryPasswordVerified: true,
        temporaryPasswordExpiresAt: completed.expiresAt,
      });

      cookieStore.set("parent_token", verifiedToken, dashboardSessionCookieOptions);
      cookieStore.delete("parent_signup_token");
      return NextResponse.json({ success: true, expiresAt: completed.expiresAt, redirectTo: "/login/guardian/set-password" });
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json({ success: false, message: INCORRECT_PASSWORD_MESSAGE }, { status: 401 });
    }

    // Registrations that began before this change keep their existing flow.
    const token = cookieStore.get("parent_token")?.value;
    if (!token) return temporaryPasswordExpired();

    let payload: { id?: unknown; passwordSet?: unknown; [key: string]: unknown };
    try {
      ({ payload } = await jwtVerify(token, SECRET));
    } catch {
      return temporaryPasswordExpired();
    }

    const parentId = Number(payload.id);
    const tokenExpirySeconds = typeof payload.temporaryPasswordExpiresAt === "string"
      ? Math.floor(new Date(payload.temporaryPasswordExpiresAt).getTime() / 1_000)
      : Number.NaN;
    if (
      !Number.isInteger(parentId)
      || parentId <= 0
      || payload.role !== "parent"
      || payload.passwordSet === true
      || !Number.isFinite(tokenExpirySeconds)
      || tokenExpirySeconds * 1_000 <= Date.now()
    ) return temporaryPasswordExpired();

    const { data: parent, error } = await supabase
      .from("parents")
      .select("password, password_set, status, archive_status, temporary_password_expires_at")
      .eq("id", parentId)
      .maybeSingle();
    if (error) throw error;
    const matches = !!parent
      && parentAccountCanAccess(parent)
      && parent.password_set !== 1
      && await bcrypt.compare(password, parent.password);
    if (!matches) {
      return NextResponse.json({ success: false, message: INCORRECT_PASSWORD_MESSAGE }, { status: 401 });
    }

    const passwordExpirySeconds = temporaryPasswordExpiryEpochSeconds(parent?.temporary_password_expires_at)
      ?? legacyTemporaryPasswordExpiryEpochSeconds(password);
    if (
      !passwordExpirySeconds
      || passwordExpirySeconds !== tokenExpirySeconds
      || passwordExpirySeconds * 1_000 <= Date.now()
    ) return temporaryPasswordExpired();

    const { token: verifiedToken } = await issueDashboardIdleSession({ ...payload, temporaryPasswordVerified: true });
    cookieStore.set("parent_token", verifiedToken, dashboardSessionCookieOptions);

    return NextResponse.json({
      success: true,
      expiresAt: new Date(tokenExpirySeconds * 1_000).toISOString(),
      redirectTo: "/login/guardian/set-password",
    });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to verify the temporary password. Please try again." }, { status: 500 });
  }
}
