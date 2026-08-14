import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { logAudit, logSecurityAlert } from "@/lib/audit";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, message: "Email/Employee ID and password are required." },
        { status: 400 }
      );
    }

    const cleanedIdentifier = identifier.trim();
    const { data: rows, error } = await supabase
      .from("principals")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, password_hash, password_set, status, is_active, auth_version")
      .eq("is_active", true)
      .or(`email.eq.${cleanedIdentifier.toLowerCase()},employee_id.eq.${cleanedIdentifier}`)
      .limit(1);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Principal", reason: "account not found" });
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
      );
    }

    const principal = rows[0];
    if (principal.status !== "active") {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Principal", reason: "inactive account" });
      return NextResponse.json(
        { success: false, message: "This principal account is inactive." },
        { status: 403 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, principal.password_hash);
    if (!passwordMatch) {
      await logSecurityAlert({ request: req, identifier: cleanedIdentifier, role: "Principal", reason: "invalid password" });
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
      );
    }

    const passwordSet = principal.password_set == null
      ? true
      : principal.password_set === true || principal.password_set === 1;

    const fullName = [principal.first_name, principal.middle_name, principal.last_name, principal.suffix]
      .filter(Boolean).join(" ");

    const token = await new SignJWT({
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
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("principal_token", token, {
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
