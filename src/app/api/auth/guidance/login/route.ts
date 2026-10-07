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
      .from("guidance_counselors")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, password_hash, status, archive_status, password_set")
      .or(`email.eq.${cleanedIdentifier.toLowerCase()},employee_id.eq.${cleanedIdentifier}`)
      .limit(1);

    if (error) throw error;

    const guidance = rows?.[0];
    const guardSubject = guidance ? `account:${guidance.id}` : `identifier:${cleanedIdentifier}`;
    await rememberLoginGuard("guidance", guardSubject);
    const protection = await checkLoginProtection("guidance", guardSubject, req, captchaToken);
    if (!protection.allowed) {
      return NextResponse.json(
        { success: false, message: protection.message, captchaRequired: protection.captchaRequired, lockedUntil: protection.lockedUntil },
        { status: protection.status },
      );
    }

    if (!guidance) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Guidance Counselor", reason: "account not found" });
      const failed = await failedLoginResult("guidance", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }
    if (guidance.archive_status === "archived" || guidance.status !== "active") {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Guidance Counselor", reason: "inactive account" });
      const failed = await failedLoginResult("guidance", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordMatch = await bcrypt.compare(password, guidance.password_hash);
    if (!passwordMatch) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Guidance Counselor", reason: "invalid password" });
      const failed = await failedLoginResult("guidance", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    await clearLoginFailures("guidance", guardSubject, req);

    const passwordSet = guidance.password_set == null
      ? true
      : guidance.password_set === true || guidance.password_set === 1;

    const payload = {
      id: guidance.id,
      employee_id: guidance.employee_id,
      first_name: guidance.first_name,
      middle_name: guidance.middle_name,
      last_name: guidance.last_name,
      suffix: guidance.suffix,
      email: guidance.email,
      phone: guidance.phone,
      role: "guidance",
      passwordSet,
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("guidance_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    const fullName = [guidance.first_name, guidance.middle_name, guidance.last_name, guidance.suffix].filter(Boolean).join(" ") || "Guidance Counselor";
    await logAudit({ action: "Login", performedBy: fullName, performedByRole: "Guidance Counselor", performedByEmail: guidance.email, module: "Auth", details: `Guidance Counselor "${fullName}" logged in.` });

    return NextResponse.json({
      success: true,
      passwordSet,
      guidance: {
        firstName: guidance.first_name,
        middleName: guidance.middle_name || "",
        lastName: guidance.last_name,
        suffix: guidance.suffix || "",
        email: guidance.email,
        contactNumber: guidance.phone || "",
        employeeId: guidance.employee_id,
        school: "Santiago Elementary",
        role: "Guidance Counselor",
        status: "Active",
      },
      message: "Login successful.",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/guidance/login error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
