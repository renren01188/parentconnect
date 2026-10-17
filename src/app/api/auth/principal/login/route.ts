import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { logAudit, logSecurityAlert } from "@/lib/audit";
import { checkLoginProtection, clearLoginFailures, failedLoginResult, rememberLoginGuard } from "@/lib/loginProtection";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";

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
      .from("principals")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, password_hash, password_set, status, archive_status, is_active, auth_version")
      .or(`email.eq.${cleanedIdentifier.toLowerCase()},employee_id.eq.${cleanedIdentifier}`)
      .limit(1);

    if (error) throw error;
    const principal = rows?.[0];
    const guardSubject = principal ? `account:${principal.id}` : `identifier:${cleanedIdentifier}`;
    await rememberLoginGuard("principal", guardSubject);
    const protection = await checkLoginProtection("principal", guardSubject, req, captchaToken);
    if (!protection.allowed) {
      return NextResponse.json(
        { success: false, message: protection.message, captchaRequired: protection.captchaRequired, lockedUntil: protection.lockedUntil },
        { status: protection.status },
      );
    }
    if (!principal) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Principal", reason: "account not found" });
      const failed = await failedLoginResult("principal", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }
    if (principal.archive_status === "archived" || principal.status !== "active" || !principal.is_active) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Principal", reason: "inactive account" });
      const failed = await failedLoginResult("principal", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordMatch = await bcrypt.compare(password, principal.password_hash);
    if (!passwordMatch) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Principal", reason: "invalid password" });
      const failed = await failedLoginResult("principal", guardSubject, req);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    await clearLoginFailures("principal", guardSubject, req);

    const passwordSet = principal.password_set == null
      ? true
      : principal.password_set === true || principal.password_set === 1;

    const fullName = [principal.first_name, principal.middle_name, principal.last_name, principal.suffix]
      .filter(Boolean).join(" ");

    const { token } = await issueDashboardIdleSession({
      id: principal.id,
      employee_id: principal.employee_id,
      first_name: principal.first_name,
      middle_name: principal.middle_name,
      last_name: principal.last_name,
      suffix: principal.suffix,
      email: principal.email,
      phone: principal.phone,
      role: "principal",
      passwordSet,
      authVersion: principal.auth_version,
    });

    const cookieStore = await cookies();
    cookieStore.set("principal_token", token, dashboardSessionCookieOptions);

    // ── Audit log ──
    await logAudit({
      action:          "Login",
      performedBy:     fullName,
      performedByRole: "Principal",
      details:         `Principal "${fullName}" logged in.`,
      module:          "Auth",
    });

    return NextResponse.json({
      success: true,
      passwordSet,
      message: "Login successful.",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/principal/login error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
