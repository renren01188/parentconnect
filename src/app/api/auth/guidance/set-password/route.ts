import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { isPasswordSessionRevoked } from "@/lib/passwordSessionRevocationStore";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import { logAudit } from "@/lib/audit";

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
    const token = cookieStore.get("guidance_token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated. Please log in again." },
        { status: 401 }
      );
    }

    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      const verified = await jwtVerify(token, SECRET);
      payload = verified.payload;
    } catch {
      return NextResponse.json(
        { success: false, message: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    if (payload.role !== "guidance") {
      return NextResponse.json(
        { success: false, message: "Invalid guidance session." },
        { status: 403 }
      );
    }
    const guidanceId = Number(payload.id);
    if (await isPasswordSessionRevoked({ role: "guidance", accountId: guidanceId, payload })) {
      cookieStore.delete("guidance_token");
      return NextResponse.json(
        { success: false, message: "Your password was changed. Please log in again." },
        { status: 401 },
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    const { data, error } = await supabase
      .from("guidance_counselors")
      .update({
        password_hash: hashed,
        password_set: true,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", guidanceId)
      .select("id, password_hash")
      .single();

    if (error) throw error;
    if (!await bcrypt.compare(newPassword, data.password_hash)) {
      throw new Error("The Guidance password update could not be verified.");
    }

    const { token: newToken } = await issueDashboardIdleSession({ ...payload, passwordSet: true, sessionIssuedAt: Date.now() });

    cookieStore.set("guidance_token", newToken, dashboardSessionCookieOptions);

    const name = [payload.first_name, payload.middle_name, payload.last_name, payload.suffix]
      .filter((part): part is string => typeof part === "string" && Boolean(part))
      .join(" ") || "Guidance Counselor";
    await logAudit({
      action: "Password Activated",
      performedById: data.id,
      performedBy: name,
      performedByRole: "Guidance Counselor",
      performedByEmail: typeof payload.email === "string" ? payload.email : undefined,
      targetUser: name,
      targetRole: "Guidance Counselor",
      targetEmail: typeof payload.email === "string" ? payload.email : undefined,
      targetType: "user",
      targetId: data.id,
      module: "Auth",
      newStatus: "Active",
      details: "Activated their Guidance account and set a permanent password.",
    });

    return NextResponse.json({
      success: true,
      message: "Password created successfully. Welcome to your dashboard!",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/guidance/set-password error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
