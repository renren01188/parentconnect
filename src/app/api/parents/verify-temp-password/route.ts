import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/authSecret";
import { sameParentEnrollmentName } from "@/lib/familyName";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { sameGuardianRelationship } from "@/lib/guardianRelationship";
import {
  legacyTemporaryPasswordExpiryEpochSeconds,
  matchesTemporaryPasswordProof,
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  temporaryPasswordExpiryEpochSeconds,
} from "@/lib/parentTemporaryPassword";

const SECRET = getJwtSecret();
const INCORRECT_PASSWORD_MESSAGE = "Please check the correct temporary password or check your email address if it is correct.";
const SIGNUP_RETRY_MESSAGE = "This signup could not be completed. Return to sign up and try again.";

type FamilyMember = {
  role: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  relationship: string | null;
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
};

const parentColumns = "id, email, contact_number, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, password, temp_password, temporary_password_expires_at, password_set, status, archive_status";

function isPasswordSet(value: ParentRow["password_set"]) {
  return value === true || value === 1;
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
    || !signup.temporaryPasswordProof
    || !signup.temporaryPasswordExpiresAt
  ) return null;
  return signup;
}

async function finalizePendingSignup(signup: PendingSignup, password: string) {
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
    .select("role, first_name, middle_name, last_name, suffix, relationship")
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

  const [{ data: emailRows, error: emailError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.from("parents").select(parentColumns).ilike("email", signup.email),
    supabase.from("parents").select(parentColumns).eq("relationship", signup.relationship),
  ]);
  if (emailError) throw emailError;
  if (roleError) throw roleError;
  const conflictingEmail = ((emailRows ?? []) as ParentRow[]).some((parent) => parent.id !== existingParent?.id);
  const conflictingIdentity = ((roleRows ?? []) as ParentRow[]).some((parent) => parent.id !== existingParent?.id && sameParentEnrollmentName(
    {
      firstName: parent.parent_first_name,
      middleName: parent.parent_middle_name,
      lastName: parent.parent_last_name,
    },
    {
      firstName: familyMember.first_name,
      middleName: familyMember.middle_name,
      lastName: familyMember.last_name,
    },
  ));
  if (conflictingEmail || conflictingIdentity) throw new Error(SIGNUP_RETRY_MESSAGE);

  const expirySeconds = temporaryPasswordExpiryEpochSeconds(signup.temporaryPasswordExpiresAt);
  if (!expirySeconds || expirySeconds * 1_000 <= Date.now()) throw new Error(SIGNUP_RETRY_MESSAGE);
  const temporaryPasswordHash = await bcrypt.hash(password, 12);
  const patch = {
    parent_first_name: signup.firstName,
    parent_middle_name: signup.middleName || null,
    parent_last_name: signup.lastName,
    parent_suffix: signup.suffix || familyMember.suffix || null,
    relationship: signup.relationship,
    email: signup.email,
    contact_number: signup.contactNumber,
    password: temporaryPasswordHash,
    temp_password: null,
    temporary_password_expires_at: signup.temporaryPasswordExpiresAt,
    password_set: 0,
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
    if (error?.code === "23505") throw new Error(SIGNUP_RETRY_MESSAGE);
    if (error) throw error;
    parent = data as ParentRow;
    createdParentId = parent.id;
  }

  try {
    await reconcileParentStudentLinks({ parentId: parent.id });
  } catch (error) {
    if (createdParentId) {
      await supabase.from("parents").delete().eq("id", createdParentId).eq("password", temporaryPasswordHash);
    }
    throw error;
  }

  return { parent, student, expiresAt: signup.temporaryPasswordExpiresAt };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const password = body?.password;
    if (!password || typeof password !== "string") {
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
      const expirySeconds = temporaryPasswordExpiryEpochSeconds(signup?.temporaryPasswordExpiresAt);
      if (!signup || !expirySeconds || expirySeconds * 1_000 <= Date.now()) return temporaryPasswordExpired();
      if (!matchesTemporaryPasswordProof(password, signup.temporaryPasswordProof)) {
        return NextResponse.json({ success: false, message: INCORRECT_PASSWORD_MESSAGE }, { status: 401 });
      }

      let completed: Awaited<ReturnType<typeof finalizePendingSignup>>;
      try {
        completed = await finalizePendingSignup(signup, password);
      } catch (error) {
        console.error("Pending parent signup finalization failed:", error instanceof Error ? error.name : "Unknown error");
        return NextResponse.json({ success: false, message: SIGNUP_RETRY_MESSAGE }, { status: 409 });
      }

      const parentName = [
        completed.parent.parent_first_name,
        completed.parent.parent_middle_name,
        completed.parent.parent_last_name,
        completed.parent.parent_suffix,
      ].filter(Boolean).join(" ") || "Parent / Guardian";
      const verifiedToken = await new SignJWT({
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
      })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime(expirySeconds)
        .sign(SECRET);

      cookieStore.set("parent_token", verifiedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: Math.max(1, expirySeconds - Math.floor(Date.now() / 1_000)),
        path: "/",
      });
      cookieStore.delete("parent_signup_token");
      return NextResponse.json({ success: true, expiresAt: completed.expiresAt, redirectTo: "/login/guardian/set-password" });
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

    const verifiedToken = await new SignJWT({ ...payload, temporaryPasswordVerified: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(tokenExpirySeconds)
      .sign(SECRET);
    cookieStore.set("parent_token", verifiedToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.max(1, tokenExpirySeconds - Math.floor(Date.now() / 1_000)),
      path: "/",
    });

    return NextResponse.json({
      success: true,
      expiresAt: new Date(tokenExpirySeconds * 1_000).toISOString(),
      redirectTo: "/login/guardian/set-password",
    });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to verify the temporary password. Please try again." }, { status: 500 });
  }
}
