// app/api/auth/adviser/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { logAudit, logSecurityAlert } from "@/lib/audit";
import { checkLoginProtection, clearLoginFailures, failedLoginResult, rememberLoginGuard } from "@/lib/loginProtection";
import { getJwtSecret } from "@/lib/authSecret";

const SECRET = getJwtSecret();

export async function POST(req: NextRequest) {
  try {
    const { identifier, password, captchaToken } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "Email/Employee ID and password are required." },
        { status: 400 }
      );
    }

    const cleanedIdentifier = identifier.trim();
    const { data: advisers, error } = await supabase
      .from("advisers")
      .select(
        "id, employee_id, first_name, last_name, email, password_hash, grade, section, sections, phone, status, archive_status, password_set"
      )
      .or(`email.eq.${cleanedIdentifier.toLowerCase()},employee_id.eq.${cleanedIdentifier}`)
      .limit(1);

    if (error) throw error;

    const adviser = advisers?.[0];
    const guardSubject = adviser ? `account:${adviser.id}` : `identifier:${cleanedIdentifier}`;
    await rememberLoginGuard("adviser", guardSubject);
    const protection = await checkLoginProtection("adviser", guardSubject, req, captchaToken);
    if (!protection.allowed) {
      return NextResponse.json(
        { success: false, message: protection.message, captchaRequired: protection.captchaRequired, lockedUntil: protection.lockedUntil },
        { status: protection.status },
      );
    }

    if (!adviser) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Adviser", reason: "account not found" });
      const failed = await failedLoginResult("adviser", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    if (adviser.archive_status === "archived" || adviser.status !== "active") {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Adviser", reason: "inactive account" });
      const failed = await failedLoginResult("adviser", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordMatch = await bcrypt.compare(password, adviser.password_hash);
    if (!passwordMatch) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Adviser", reason: "invalid password" });
      const failed = await failedLoginResult("adviser", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    await clearLoginFailures("adviser", guardSubject, req);

    const sectionsArray: string[] =
      Array.isArray(adviser.sections) && adviser.sections.length > 0
        ? adviser.sections
        : adviser.section
        ? [adviser.section]
        : [];

    const fullName = `${adviser.first_name} ${adviser.last_name}`;

    const payload = {
      id:          adviser.id,
      employee_id: adviser.employee_id,
      first_name:  adviser.first_name,
      last_name:   adviser.last_name,
      email:       adviser.email,
      grade:       adviser.grade,
      section:     adviser.section,
      sections:    sectionsArray,
      role:        "adviser",
      passwordSet: adviser.password_set == null ? true : (adviser.password_set === true || adviser.password_set === 1),
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("adviser_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 8,
      path:     "/",
    });

    // ── Audit log ──
    await logAudit({
      action:          "Login",
      performedBy:     fullName,
      performedByRole: "Adviser",
      details:         `Adviser "${fullName}" logged in.`,
      module:          "Auth",
    });

    return NextResponse.json({
      success:     true,
      passwordSet: adviser.password_set === true || adviser.password_set === 1,
      message:     "Login successful.",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/adviser/login error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
