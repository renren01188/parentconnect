import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

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
    const token = cookieStore.get("principal_token")?.value;
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

    if (payload.role !== "principal") {
      return NextResponse.json(
        { success: false, message: "Invalid principal session." },
        { status: 403 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const authVersion = crypto.randomUUID();

    const { data: updatedPrincipal, error } = await supabase
      .from("principals")
      .update({
        password_hash: passwordHash,
        password_set: true,
        auth_version: authVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.id)
      .eq("is_active", true)
      .eq("auth_version", typeof payload.authVersion === "string" ? payload.authVersion : "")
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!updatedPrincipal) {
      return NextResponse.json(
        { success: false, message: "This Principal session is no longer active. Please log in again." },
        { status: 401 },
      );
    }

    const newToken = await new SignJWT({ ...payload, passwordSet: true, authVersion })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    cookieStore.set("principal_token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      message: "Password created successfully. Welcome to your dashboard!",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/principal/set-password error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
