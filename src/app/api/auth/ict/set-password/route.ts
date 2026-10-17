import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
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
    const token = cookieStore.get("ict_token")?.value;
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

    if (payload.role !== "ict") {
      return NextResponse.json(
        { success: false, message: "Invalid ICT session." },
        { status: 403 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const { data, error } = await supabase
      .from("ict_admins")
      .update({
        password_hash: passwordHash,
        password_set: true,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.id)
      .select("id, password_hash")
      .single();

    if (error) throw error;
    if (!await bcrypt.compare(newPassword, data.password_hash)) {
      throw new Error("The ICT password update could not be verified.");
    }

    const { token: newToken } = await issueDashboardIdleSession({ ...payload, passwordSet: true });

    cookieStore.set("ict_token", newToken, dashboardSessionCookieOptions);

    return NextResponse.json({
      success: true,
      message: "Password created successfully. Welcome to your dashboard!",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/ict/set-password error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
