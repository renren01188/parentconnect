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
    const { data: rows, error } = await supabase
      .from("ict_admins")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, password_hash, status, archive_status, password_set")
      .or(`email.eq.${cleanedIdentifier.toLowerCase()},employee_id.eq.${cleanedIdentifier}`)
      .limit(1);

    if (error) throw error;
    const ict = rows?.[0];
    const guardSubject = ict ? `account:${ict.id}` : `identifier:${cleanedIdentifier}`;
    await rememberLoginGuard("ict", guardSubject);
    const protection = await checkLoginProtection("ict", guardSubject, req, captchaToken);
    if (!protection.allowed) {
      return NextResponse.json(
        { success: false, message: protection.message, captchaRequired: protection.captchaRequired, lockedUntil: protection.lockedUntil },
        { status: protection.status },
      );
    }
    if (!ict) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "ICT Admin", reason: "account not found" });
      const failed = await failedLoginResult("ict", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }
    const passwordSet = ict.password_set == null
      ? true
      : ict.password_set === true || ict.password_set === 1;
    const mayCompleteActivation = ict.status === "pending_activation" && !passwordSet;

    if (ict.archive_status === "archived" || (ict.status !== "active" && !mayCompleteActivation)) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "ICT Admin", reason: "inactive account" });
      const failed = await failedLoginResult("ict", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordMatch = await bcrypt.compare(password, ict.password_hash);
    if (!passwordMatch) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "ICT Admin", reason: "invalid password" });
      const failed = await failedLoginResult("ict", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    await clearLoginFailures("ict", guardSubject, req);

    const fullName = [ict.first_name, ict.middle_name, ict.last_name, ict.suffix]
      .filter(Boolean).join(" ");

    const token = await new SignJWT({
      id: ict.id,
      employee_id: ict.employee_id,
      first_name: ict.first_name,
      middle_name: ict.middle_name,
      last_name: ict.last_name,
      suffix: ict.suffix,
      email: ict.email,
      phone: ict.phone,
      role: "ict",
      passwordSet,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("ict_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    // ── Audit log ──
    await logAudit({
      action:          "Login",
      performedBy:     fullName,
      performedByRole: "ICT Admin",
      details:         `ICT Admin "${fullName}" logged in.`,
      module:          "Auth",
    });

    return NextResponse.json({
      success: true,
      passwordSet,
      message: "Login successful.",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/ict/login error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
