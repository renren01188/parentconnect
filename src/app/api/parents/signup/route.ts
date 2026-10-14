import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
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
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
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

const SECRET = getJwtSecret();
const ENROLLMENT_ERROR = "We could not verify this enrollment request. Please contact the school office for assistance.";
const CAPTCHA_ERROR = "Security verification is missing, expired, or incorrect. Please complete the CAPTCHA again.";

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
};

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
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
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || contactNumber.length !== 11
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
      .select("role, first_name, middle_name, last_name, suffix, relationship")
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

    // Ownership is established exclusively from the current SF1 family name,
    // role, and one child LRN. Email and phone are contact details supplied by
    // the parent; they are never compared with imported school contact fields.
    // They are still used as an account identifier so a second account cannot
    // be created for the same parent.
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
    const [{ data: emailRows, error: emailError }, { data: roleRows, error: roleError }] = await Promise.all([
      supabase.from("parents").select(parentColumns).ilike("email", email),
      supabase.from("parents").select(parentColumns).eq("relationship", relationship),
    ]);
    if (emailError) throw emailError;
    if (roleError) throw roleError;

    const parentsByEmail = (emailRows ?? []) as MatchedParent[];
    const parentsByIdentity = ((roleRows ?? []) as MatchedParent[]).filter((parent) => sameParentEnrollmentName(
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
    ));

    // Multiple rows for an email or identity are a legacy data conflict. Do
    // not guess which account belongs to this person.
    if (parentsByEmail.length > 1 || parentsByIdentity.length > 1) return enrollmentFailure(req, 409);

    const emailParent = parentsByEmail[0];
    const identityParent = parentsByIdentity[0];
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
    const hasCurrentStudentLink = (parent: MatchedParent) => linkedParents.some((linked) => linked.id === parent.id);

    let matchedParent: MatchedParent | null = null;
    if (emailParent) {
      // An email can be reused only by its matching account identity, or by
      // the one pending legacy account already attached to this exact LRN.
      if (!parentAccountCanAccess(emailParent)) return enrollmentFailure(req, 403);
      if (identityParent && identityParent.id !== emailParent.id) return enrollmentFailure(req, 409);
      const emailIdentityMatches = identityParent?.id === emailParent.id;
      if (!emailIdentityMatches && !hasCurrentStudentLink(emailParent)) return enrollmentFailure(req, 403);
      matchedParent = emailParent;
    } else if (identityParent) {
      if (!parentAccountCanAccess(identityParent)) return enrollmentFailure(req, 403);
      const existingEmail = identityParent.email?.trim().toLowerCase() ?? "";
      // A fully registered account must never have its contact address
      // replaced through sign-up. An incomplete account, however, may be a
      // previous typo: keep it untouched for now and allow the parent to
      // prove the corrected address before the verification step updates it.
      if (isPasswordSet(identityParent.password_set) && existingEmail && existingEmail !== email) {
        return enrollmentFailure(req, 409);
      }
      matchedParent = identityParent;
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

    // A parent who already completed registration can submit another child's
    // LRN without creating a second account. The same role/name rule is
    // rechecked before reconciliation; no password or contact detail changes
    // are made in this path.
    if (matchedParent && isPasswordSet(matchedParent.password_set)) {
      const accountStillMatchesFamily = matchedParent.relationship === relationship && sameParentEnrollmentName(
        {
          firstName: matchedParent.parent_first_name,
          middleName: matchedParent.parent_middle_name,
          lastName: matchedParent.parent_last_name,
        },
        {
          firstName: currentFamilyMember.first_name,
          middleName: currentFamilyMember.middle_name,
          lastName: currentFamilyMember.last_name,
        },
      );
      if (!accountStillMatchesFamily) return enrollmentFailure(req, 403);
      await reconcileParentStudentLinks({ parentId: matchedParent.id });
      await clearEnrollmentFailures(req);
      return NextResponse.json({
        success: true,
        redirectTo: "/login/guardian",
        message: "This student is linked to your existing parent account. Please log in.",
      });
    }

    const parentName = [
      firstName,
      middleName,
      lastName,
      suffix || currentFamilyMember.suffix,
    ].filter(Boolean).join(" ") || "Parent / Guardian";
    const temporaryPasswordIssuedAt = new Date();
    const temporaryPasswordResendAvailableAt = new Date(
      temporaryPasswordIssuedAt.getTime() + PARENT_TEMPORARY_PASSWORD_RESEND_DELAY_SECONDS * 1_000,
    );
    const { password: temporaryPassword, expiresAt: temporaryPasswordExpiresAt } = createTemporaryPassword(
      temporaryPasswordIssuedAt.getTime(),
    );
    const temporaryPasswordProof = createTemporaryPasswordProof(temporaryPassword);
    const temporaryPasswordExpiresAtSeconds = temporaryPasswordExpiryEpochSeconds(temporaryPasswordExpiresAt);
    if (!temporaryPasswordExpiresAtSeconds) throw new Error("Unable to create a temporary password expiry.");

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
      temporaryPasswordProof,
      temporaryPasswordProofEntries: [{
        proof: temporaryPasswordProof,
        expiresAt: temporaryPasswordExpiresAt.toISOString(),
      }],
      temporaryPasswordExpiresAt: temporaryPasswordExpiresAt.toISOString(),
      temporaryPasswordIssuedAt: temporaryPasswordIssuedAt.toISOString(),
      temporaryPasswordResendAvailableAt: temporaryPasswordResendAvailableAt.toISOString(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(temporaryPasswordIssuedAt.getTime() / 1_000))
      .setExpirationTime(temporaryPasswordExpiresAtSeconds)
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("parent_signup_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: PARENT_TEMPORARY_PASSWORD_TTL_SECONDS,
      path: "/",
    });

    // A verified enrollment that reached this point is successful. Clear any
    // prior guard state so an earlier typo cannot affect the new account.
    await clearEnrollmentFailures(req);

    try {
      await sendTempPasswordEmail({
        parentEmail: email,
        parentName,
        studentName: `${student.first_name} ${student.last_name}`.trim(),
        tempPassword: temporaryPassword,
      });
    } catch {
      // The signed cookie has no account record or raw password. Preserve it
      // when a provider cannot confirm delivery so the guardian can retry from
      // the verification page instead of having to repeat the whole signup.
      return NextResponse.json({
        success: true,
        deliveryPending: true,
        redirectTo: "/login/guardian/verify-temp-password",
        expiresAt: temporaryPasswordExpiresAt.toISOString(),
        resendAvailableAt: temporaryPasswordResendAvailableAt.toISOString(),
        message: "We could not confirm email delivery. Please check your inbox and spam folder, then request a new temporary password when it becomes available.",
      }, { status: 202 });
    }

    return NextResponse.json({
      success: true,
      redirectTo: "/login/guardian/verify-temp-password",
      expiresAt: temporaryPasswordExpiresAt.toISOString(),
      resendAvailableAt: temporaryPasswordResendAvailableAt.toISOString(),
      message: PARENT_SIGNUP_CONFIRMATION_MESSAGE,
    });
  } catch (error) {
    console.error("POST /api/parents/signup error:", error instanceof Error ? error.name : "Unknown error");
    return genericEnrollmentError(503);
  }
}
