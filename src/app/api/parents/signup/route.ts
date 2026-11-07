import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { cleanNamePart, sameParentEnrollmentName } from "@/lib/familyName";
import { sendTempPasswordEmail } from "@/lib/mailer";
import { getJwtSecret } from "@/lib/authSecret";
import { verifyGoogleRecaptcha } from "@/lib/googleRecaptcha";
import {
  clearLoginFailures,
  failedLoginResult,
  getLoginLockStatus,
  PARENT_SIGNUP_GUARD_SCOPE,
} from "@/lib/loginProtection";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { ensureParentStudentLink, reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import {
  guardianRelationshipForStorage,
  isMissingOtherGuardianRelationship,
  sameGuardianRelationship,
} from "@/lib/guardianRelationship";
import {
  createTemporaryPassword,
  createTemporaryPasswordProof,
  PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS,
  PARENT_TEMPORARY_PASSWORD_TTL_SECONDS,
  temporaryPasswordExpiryEpochSeconds,
} from "@/lib/parentTemporaryPassword";
import { PARENT_SIGNUP_CONFIRMATION_MESSAGE } from "@/lib/parentSignupConfirmation";
import { PUBLIC_ROUTE_ALIASES } from "@/lib/routeAliases";

const SECRET = getJwtSecret();
const ENROLLMENT_ERROR = "We could not verify this enrollment request. Please contact the school office for assistance.";
const RECORDED_CONTACT_NUMBER_MISMATCH_MESSAGE = "The contact number does not match the number recorded by the Adviser.";
const CAPTCHA_ERROR = "Security verification is missing, expired, or incorrect. Please complete the CAPTCHA again.";
const MOBILE_NUMBER_IN_USE_MESSAGE = "This mobile number is already linked to a ParentConnect account. Sign in to that account, or use another verified mobile number.";
const PHONE_SIGNUP_PENDING_TTL_SECONDS = 30 * 60;

type MatchedParent = {
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

type FamilyMember = {
  role: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  relationship: string | null;
  contact_number: string | null;
};

function normalizePhone(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return digits;
}

/**
 * An imported SF1 AP contact number is an enrollment check when it exists.
 * Older SF1 records may leave AP blank; those retain the normal signup flow
 * and use the number from a successfully completed ParentConnect signup as the account
 * contact number.
 */
function matchesRecordedPhone(recorded: unknown, claimed: string) {
  const normalizedRecorded = normalizePhone(recorded);
  return !normalizedRecorded || normalizedRecorded === claimed;
}

function genericEnrollmentError(status = 400) {
  return NextResponse.json({ success: false, message: ENROLLMENT_ERROR }, { status });
}

function clientSubject(req: NextRequest) {
  const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")?.trim()
    ?? "unknown";
  return `guardian-signup:${address}`;
}

async function enrollmentFailure(req: NextRequest, status = 400) {
  const result = await failedLoginResult("parent", clientSubject(req), req, PARENT_SIGNUP_GUARD_SCOPE);
  return genericEnrollmentError(result.status === 429 ? 429 : status);
}

async function recordedContactNumberMismatch(req: NextRequest) {
  const result = await failedLoginResult("parent", clientSubject(req), req, PARENT_SIGNUP_GUARD_SCOPE);
  if (result.status === 429) return genericEnrollmentError(429);
  return NextResponse.json({
    success: false,
    message: RECORDED_CONTACT_NUMBER_MISMATCH_MESSAGE,
  }, { status: 403 });
}

async function enrollmentCaptchaFailure(req: NextRequest) {
  const result = await failedLoginResult("parent", clientSubject(req), req, PARENT_SIGNUP_GUARD_SCOPE);
  if (result.status === 429) return genericEnrollmentError(429);
  return NextResponse.json({ success: false, message: CAPTCHA_ERROR }, { status: 400 });
}

async function clearEnrollmentFailures(req: NextRequest) {
  await clearLoginFailures("parent", clientSubject(req), req, PARENT_SIGNUP_GUARD_SCOPE);
}

function isPasswordSet(value: MatchedParent["password_set"]) {
  return value === true || value === 1;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    // Clean spacing for safe comparison but preserve the parent-provided
    // capitalization/format when their account and shared details are saved.
    const firstName = cleanNamePart(body?.firstName) ?? "";
    const middleName = cleanNamePart(body?.middleName) ?? "";
    const lastName = cleanNamePart(body?.lastName) ?? "";
    const suffix = cleanNamePart(body?.suffix) ?? "";
    const contactNumber = normalizePhone(body?.contactNumber);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const studentLrn = typeof body?.studentLrn === "string" ? body.studentLrn.replace(/\D/g, "") : "";
    const relationship = body?.relationship === "Father" || body?.relationship === "Mother" || body?.relationship === "Guardian"
      ? body.relationship
      : "";
    // Older invite links did not send this field. They remain compatible as
    // the general Guardian relationship, while new signups use the selector.
    const guardianRelationshipSelection = typeof body?.guardianRelationship === "string"
      ? body.guardianRelationship
      : "Guardian";
    const guardianRelationship = guardianRelationshipForStorage(
      guardianRelationshipSelection,
      body?.guardianRelationshipOther,
    );

    if (
      !firstName || !lastName || !/^\d{12}$/.test(studentLrn) || !relationship || body?.termsAccepted !== true
      || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || contactNumber.length !== 11
    ) return genericEnrollmentError();
    if (relationship === "Guardian" && (
      isMissingOtherGuardianRelationship(guardianRelationshipSelection, body?.guardianRelationshipOther)
      || !guardianRelationship
    )) return genericEnrollmentError();

    // Do not increment the failed-attempt counter before a verification
    // attempt. The previous ordering locked a parent who retried with a
    // corrected spelling. CAPTCHA is verified exactly once below.
    const lockStatus = await getLoginLockStatus("parent", clientSubject(req), req, PARENT_SIGNUP_GUARD_SCOPE);
    if (lockStatus.locked) return genericEnrollmentError(429);
    if (!await verifyGoogleRecaptcha(body?.recaptchaToken)) return enrollmentCaptchaFailure(req);

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section")
      .eq("student_id", studentLrn)
      .eq("archive_status", "active")
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) return enrollmentFailure(req, 403);

    // ICT maintains these SF1 family rows. Read them for every enrollment
    // attempt so an ICT correction is effective immediately and never relies
    // on a stale name copied into a legacy parent-account record.
    const { data: familyMembers, error: familyError } = await supabase
      .from("student_family_members")
      .select("role, first_name, middle_name, last_name, suffix, relationship, contact_number")
      .eq("student_db_id", student.id)
      .in("role", ["Father", "Mother", "Guardian"]);
    if (familyError) throw familyError;
    const currentFamilyMember = ((familyMembers ?? []) as FamilyMember[])
      .find((member) => member.role === relationship) ?? null;
    // A parent may omit the optional middle name and suffix. The selected
    // family role, exact LRN, and complete first/last name remain required;
    // do not use optional registration fields to reject the enrollment.
    if (!currentFamilyMember || !sameParentEnrollmentName(
      { firstName, middleName, lastName },
      {
        firstName: currentFamilyMember.first_name,
        middleName: currentFamilyMember.middle_name,
        lastName: currentFamilyMember.last_name,
      },
    )) return enrollmentFailure(req, 403);
    if (relationship === "Guardian" && !sameGuardianRelationship(
      guardianRelationship,
      currentFamilyMember.relationship || "Guardian",
    )) return enrollmentFailure(req, 403);
    if (!matchesRecordedPhone(currentFamilyMember.contact_number, contactNumber)) {
      return recordedContactNumberMismatch(req);
    }

    // Ownership is established from the current SF1 family name, role, and
    // child LRN. When SF1 AP has a contact number, the check above also binds
    // enrollment to it. When AP is blank, the parent-provided number continues
    // through the established email/SMS verification path and becomes the
    // ParentConnect account's contact/login number.
    const { data: links, error: linksError } = await supabase
      .from("parent_student_links")
      .select(`
        relationship,
        parents!inner (
          id, email, contact_number,
          parent_first_name, parent_middle_name, parent_last_name, parent_suffix,
          relationship, password, temp_password, temporary_password_expires_at, password_set, status, archive_status
        )
      `)
      .eq("student_id", student.student_id);
    if (linksError) throw linksError;

    const linkedParents = (links ?? []).flatMap((link) => {
      const parent = link.parents as unknown as MatchedParent | null;
      return parent ? [parent] : [];
    });

    const parentColumns = "id, email, contact_number, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, password, temp_password, temporary_password_expires_at, password_set, status, archive_status";
    // Archived accounts are retained as historical records, but their email
    // and mobile number must not reserve the identifiers for a later signup
    // for a new active student. Only an active ParentConnect account may be
    // found or claimed through an account identifier.
    const parentsByEmail: MatchedParent[] = email
      ? await (async () => {
        const { data, error: emailError } = await supabase
          .from("parents")
          .select(parentColumns)
          .eq("email", email)
          .eq("archive_status", "active");
        if (emailError) throw emailError;
        return (data ?? []) as MatchedParent[];
      })()
      : [];
    // An email identifies an account. Never locate an account by a shared
    // family name alone: two different Fathers/Mothers/Guardians can share a
    // name, but must be able to use their own account and child LRN.
    if (parentsByEmail.length > 1) return enrollmentFailure(req, 409);

    const emailParent = parentsByEmail[0];
    const accountMatchesVerifiedFamily = (parent: MatchedParent) =>
      parent.relationship === relationship
      && sameParentEnrollmentName(
        {
          firstName: parent.parent_first_name,
          middleName: parent.parent_middle_name,
          lastName: parent.parent_last_name,
        },
        {
          firstName: currentFamilyMember.first_name,
          middleName: currentFamilyMember.middle_name,
          lastName: currentFamilyMember.last_name,
        },
      )
      && matchesRecordedPhone(parent.contact_number, contactNumber);
    const linkedClaimableParents = linkedParents.filter((parent) =>
      parentAccountCanAccess(parent)
      && !isPasswordSet(parent.password_set)
      && parent.relationship === relationship,
    );
    // Older Adviser manual registrations created an unclaimed placeholder
    // account and link before sign-up. Once the SF1 name + role + LRN check
    // above succeeds, one such placeholder can be safely claimed even if its
    // copied role/name/email was wrong. This prevents a duplicate account
    // while preserving existing records. Ambiguous legacy data is never
    // guessed.
    const linkedUnclaimedParents = linkedParents.filter((parent) =>
      parentAccountCanAccess(parent)
      && !isPasswordSet(parent.password_set),
    );
    const linkedRegisteredParents = linkedParents.filter((parent) =>
      parentAccountCanAccess(parent)
      && isPasswordSet(parent.password_set)
      && accountMatchesVerifiedFamily(parent),
    );

    let matchedParent: MatchedParent | null = null;
    if (emailParent) {
      if (!parentAccountCanAccess(emailParent) || !accountMatchesVerifiedFamily(emailParent)) {
        return enrollmentFailure(req, 403);
      }
      matchedParent = emailParent;
    } else if (linkedRegisteredParents.length === 1) {
      // The account is already linked to this exact verified child, so no
      // global name search is needed. Guide the parent back to login/recovery
      // instead of ever creating a duplicate account.
      matchedParent = linkedRegisteredParents[0];
    } else if (linkedRegisteredParents.length > 1) {
      return enrollmentFailure(req, 409);
    } else if (linkedClaimableParents.length === 1) {
      // ICT may have corrected an old manual-registration family name while
      // the legacy pending account still contains the old name. Its one link
      // to this LRN is sufficient to repair and claim it.
      matchedParent = linkedClaimableParents[0];
    } else if (linkedClaimableParents.length > 1) {
      return enrollmentFailure(req, 409);
    } else if (linkedUnclaimedParents.length === 1) {
      matchedParent = linkedUnclaimedParents[0];
    } else if (linkedUnclaimedParents.length > 1) {
      return enrollmentFailure(req, 409);
    }

    // Mobile numbers are valid Parent login identifiers and are unique among
    // active accounts. An archived account is historical only, so it cannot
    // prevent a verified guardian from creating a fresh account for a new
    // active student. A matching active legacy placeholder is allowed to be
    // claimed because it is the same pending account.
    const { data: phoneRows, error: phoneError } = await supabase
      .from("parents")
      .select("id")
      .eq("login_contact_number", contactNumber)
      .eq("archive_status", "active");
    if (phoneError) throw phoneError;
    if ((phoneRows ?? []).some((parent) => Number(parent.id) !== matchedParent?.id)) {
      return NextResponse.json({ success: false, message: MOBILE_NUMBER_IN_USE_MESSAGE }, { status: 409 });
    }

    // A parent who already completed registration can submit another child's
    // LRN without creating a second account. The email, exact child LRN,
    // selected family role, and SF1 name/phone have all been verified above.
    // The selected child is linked directly; optional reconciliation may add
    // only siblings with the same staff-recorded phone number.
    if (matchedParent && isPasswordSet(matchedParent.password_set)) {
      if (!accountMatchesVerifiedFamily(matchedParent)) return enrollmentFailure(req, 403);
      await ensureParentStudentLink({
        parentId: matchedParent.id,
        studentId: student.student_id,
        relationship,
      });
      await reconcileParentStudentLinks({ parentId: matchedParent.id });
      await clearEnrollmentFailures(req);
      return NextResponse.json({
        success: true,
        accountExists: true,
        message: "This student is linked to your existing Parent account. Please log in, or use Forgot password if you need to recover access.",
      });
    }

    const parentName = [
      firstName,
      middleName,
      lastName,
      suffix || currentFamilyMember.suffix,
    ].filter(Boolean).join(" ") || "Parent / Guardian";
    const verificationMethod = email ? "email" : "sms";
    const otpChallengeId = crypto.randomUUID();
    const temporaryPasswordIssuedAt = new Date();
    const temporaryPasswordResendAvailableAt = new Date(
      temporaryPasswordIssuedAt.getTime() + PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS * 1_000,
    );
    const temporaryPasswordDetails = email
      ? createTemporaryPassword(temporaryPasswordIssuedAt.getTime())
      : null;
    const temporaryPassword = temporaryPasswordDetails?.password ?? null;
    const temporaryPasswordExpiresAt = temporaryPasswordDetails?.expiresAt ?? null;
    const temporaryPasswordProof = temporaryPassword ? createTemporaryPasswordProof(temporaryPassword) : null;
    const temporaryPasswordExpiresAtSeconds = temporaryPasswordExpiresAt
      ? temporaryPasswordExpiryEpochSeconds(temporaryPasswordExpiresAt)
      : null;
    if (email && !temporaryPasswordExpiresAtSeconds) throw new Error("Unable to create a temporary password expiry.");
    const pendingExpiresAt = new Date(temporaryPasswordIssuedAt.getTime() + (
      email ? PARENT_TEMPORARY_PASSWORD_TTL_SECONDS : PHONE_SIGNUP_PENDING_TTL_SECONDS
    ) * 1_000);
    const pendingExpirySeconds = Math.floor(pendingExpiresAt.getTime() / 1_000);

    // Keep the approved enrollment only in this short-lived, HttpOnly cookie
    // until the recipient proves they received the emailed password. This
    // prevents an address typo from creating a blocked or unusable parent row.
    const token = await new SignJWT({
      role: "pending-parent-signup",
      pendingParentId: matchedParent?.id ?? null,
      email,
      studentId: student.student_id,
      parentName,
      studentName: `${student.first_name} ${student.last_name}`.trim(),
      grade: student.grade,
      section: student.section,
      firstName,
      middleName,
      lastName,
      suffix: suffix || currentFamilyMember.suffix || "",
      contactNumber,
      relationship,
      guardianRelationship,
      verificationMethod,
      otpChallengeId,
      pendingExpiresAt: pendingExpiresAt.toISOString(),
      temporaryPasswordProof,
      temporaryPasswordProofEntries: temporaryPasswordProof && temporaryPasswordExpiresAt ? [{
        proof: temporaryPasswordProof,
        expiresAt: temporaryPasswordExpiresAt.toISOString(),
      }] : [],
      temporaryPasswordExpiresAt: temporaryPasswordExpiresAt?.toISOString() ?? "",
      temporaryPasswordIssuedAt: email ? temporaryPasswordIssuedAt.toISOString() : "",
      temporaryPasswordResendAvailableAt: email ? temporaryPasswordResendAvailableAt.toISOString() : "",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(temporaryPasswordIssuedAt.getTime() / 1_000))
      .setExpirationTime(pendingExpirySeconds)
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("parent_signup_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: email ? PARENT_TEMPORARY_PASSWORD_TTL_SECONDS : PHONE_SIGNUP_PENDING_TTL_SECONDS,
      path: "/",
    });

    // A verified enrollment that reached this point is successful. Clear any
    // prior guard state so an earlier typo cannot affect the new account.
    await clearEnrollmentFailures(req);

    if (!email) {
      return NextResponse.json({
        success: true,
        verificationMethod: "sms",
        redirectTo: PUBLIC_ROUTE_ALIASES.parentRecovery.signupOtp,
        message: "Your enrollment details are ready. Send a verification code to your contact number to continue.",
      });
    }

    try {
      await sendTempPasswordEmail({
        parentEmail: email,
        parentName,
        studentName: `${student.first_name} ${student.last_name}`.trim(),
        tempPassword: temporaryPassword!,
      });
    } catch {
      // The signed cookie has no account record or raw password. Preserve it
      // when a provider cannot confirm delivery so the guardian can retry from
      // the verification page instead of having to repeat the whole signup.
      return NextResponse.json({
        success: true,
        deliveryPending: true,
        redirectTo: PUBLIC_ROUTE_ALIASES.parentRecovery.verifyTemporaryPassword,
        expiresAt: temporaryPasswordExpiresAt!.toISOString(),
        resendAvailableAt: temporaryPasswordResendAvailableAt.toISOString(),
        message: "We could not confirm email delivery. Please check your inbox and spam folder, then request a new temporary password when it becomes available.",
      }, { status: 202 });
    }

    return NextResponse.json({
      success: true,
      redirectTo: PUBLIC_ROUTE_ALIASES.parentRecovery.verifyTemporaryPassword,
      expiresAt: temporaryPasswordExpiresAt!.toISOString(),
      resendAvailableAt: temporaryPasswordResendAvailableAt.toISOString(),
      message: PARENT_SIGNUP_CONFIRMATION_MESSAGE,
    });
  } catch (error) {
    console.error("POST /api/parents/signup error:", error instanceof Error ? error.name : "Unknown error");
    return genericEnrollmentError(503);
  }
}
