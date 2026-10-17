import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { isPasswordSessionRevoked } from "@/lib/passwordSessionRevocationStore";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export async function POST(req: NextRequest) {
  try {
    const { newPassword, confirmPassword } = await req.json();

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Both password fields are required." },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match." },
        { status: 400 }
      );
    }
    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("adviser_token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated. Please log in again." },
        { status: 401 }
      );
    }

    let payload: any;
    try {
      const verified = await jwtVerify(token, SECRET);
      payload = verified.payload;
    } catch {
      return NextResponse.json(
        { success: false, message: "Session expired. Please log in again." },
        { status: 401 }
      );
    }
    const adviserId = Number(payload.id);
    if (payload.role !== "adviser" || (await isPasswordSessionRevoked({ role: "adviser", accountId: adviserId, payload }))) {
      cookieStore.delete("adviser_token");
      return NextResponse.json(
        { success: false, message: "Your password was changed. Please log in again." },
        { status: 401 },
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    const { error } = await supabase
      .from("advisers")
      .update({ password_hash: hashed, password_set: true, status: "active" })
      .eq("id", adviserId);

    if (error) throw error;

    // Re-issue token with passwordSet: true
    const newPayload = { ...payload, passwordSet: true, sessionIssuedAt: Date.now() };
    const { token: newToken } = await issueDashboardIdleSession(newPayload);

    cookieStore.set("adviser_token", newToken, dashboardSessionCookieOptions);

    return NextResponse.json({
      success: true,
      message: "Password created successfully. Welcome to your dashboard!",
    });

  } catch (error: any) {
    console.error("POST /api/auth/adviser/set-password error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}
