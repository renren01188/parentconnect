import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { logAudit, logSecurityAlert } from "@/lib/audit";
import {
  checkLoginProtection,
  clearLoginFailures,
  failedLoginResult,
  PARENT_LOGIN_GUARD_SCOPE,
  rememberLoginGuard,
} from "@/lib/loginProtection";
import { parentAccountAccessIssue } from "@/lib/parentAccountAccess";
import { getJwtSecret } from "@/lib/authSecret";
import {
  isTemporaryPasswordExpired,
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  temporaryPasswordExpiryEpochSeconds,
} from "@/lib/parentTemporaryPassword";

const SECRET = getJwtSecret();

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, captchaToken } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    const { data: parents, error } = await supabase
      .from("parents")
      .select(`
        id, email, password, temp_password, password_set, status, archive_status, student_id, contact_number,
        parent_first_name, parent_last_name,
        students!inner ( first_name, last_name, grade, section )
      `)
      .eq("email", email.toLowerCase().trim())
      .order("password_set", { ascending: false });

    if (error) throw error;

    const parent = parents?.find((row) =>
      !(row.parent_first_name === "Parent" && row.parent_last_name === "Guardian" && !row.contact_number)
    );

    const guardSubject = parent ? `account:${parent.id}` : `identifier:${String(email).trim()}`;
    await rememberLoginGuard("parent", guardSubject);
    const protection = await checkLoginProtection("parent", guardSubject, req, captchaToken, PARENT_LOGIN_GUARD_SCOPE);
    if (!protection.allowed) {
      return NextResponse.json(
        { success: false, message: protection.message, captchaRequired: protection.captchaRequired, lockedUntil: protection.lockedUntil },
        { status: protection.status },
      );
    }

    if (!parent) {
      await logSecurityAlert({ request: req, identifier: String(email).trim(), role: "Parent", reason: "account not found" });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const student = parent.students as unknown as {
      first_name: string;
      last_name: string;
      grade: string;
      section: string;
    };

    const accessIssue = parentAccountAccessIssue(parent);
    if (accessIssue === "archived") {
      await logSecurityAlert({ request: req, identifier: String(email).trim(), role: "Parent", reason: "archived account" });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status },
      );
    }
    if (accessIssue) {
      await logSecurityAlert({ request: req, identifier: String(email).trim(), role: "Parent", reason: `account is temporarily unavailable: ${accessIssue}` });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordMatch = await bcrypt.compare(password, parent.password);
    if (!passwordMatch) {
      await logSecurityAlert({ request: req, identifier: String(email).trim(), role: "Parent", reason: "invalid password" });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordSet = parent.password_set === true || parent.password_set === 1;
    const temporaryPasswordExpirySeconds = passwordSet
      ? null
      : temporaryPasswordExpiryEpochSeconds(password);
    if (!passwordSet && (!temporaryPasswordExpirySeconds || isTemporaryPasswordExpired(password))) {
      return NextResponse.json({
        success: false,
        temporaryPasswordExpired: true,
        redirectTo: "/login/guardian?signup=1&tempPasswordExpired=1",
        message: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
      }, { status: 401 });
    }

    await clearLoginFailures("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);

    // A successful password check proves control of this pre-verified parent
    // record. Promote only this account from a legacy approval label to the
    // normal active state; protected states were rejected above.
    if (String(parent.status ?? "").trim().toLowerCase() !== "active") {
      const { error: activationError } = await supabase
        .from("parents")
        .update({ status: "active" })
        .eq("id", parent.id);
      if (activationError) throw activationError;
    }

    const parentName = `${parent.parent_first_name} ${parent.parent_last_name}`;

    const payload = {
      id:          parent.id,
      email:       parent.email,
      studentId:   parent.student_id,
      parentName,
      studentName: `${student.first_name} ${student.last_name}`,
      grade:       student.grade,
      section:     student.section,
      role:        "parent",
      passwordSet,
      temporaryPasswordVerified: passwordSet,
      ...(temporaryPasswordExpirySeconds ? {
        temporaryPasswordExpiresAt: new Date(temporaryPasswordExpirySeconds * 1_000).toISOString(),
      } : {}),
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(temporaryPasswordExpirySeconds ?? "24h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("parent_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: temporaryPasswordExpirySeconds
        ? Math.max(1, temporaryPasswordExpirySeconds - Math.floor(Date.now() / 1_000))
        : 60 * 60 * 24,
      path:     "/",
    });

    // ── Audit log ──
    await logAudit({
      action:           "Login",
      performedBy:      parentName,
      performedByRole:  "Parent",
      performedByEmail: parent.email,
      details:          `Parent "${parentName}" logged in.`,
      module:           "Auth",
    });

    return NextResponse.json({
      success:     true,
      passwordSet,
      expiresAt: temporaryPasswordExpirySeconds
        ? new Date(temporaryPasswordExpirySeconds * 1_000).toISOString()
        : undefined,
      message: passwordSet
        ? "Login successful."
        : "Login successful. Please set your new password.",
    });

  } catch (error: unknown) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
