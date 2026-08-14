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

    const hashed = await bcrypt.hash(newPassword, 10);

    const { error } = await supabase
      .from("guidance_counselors")
      .update({
        password_hash: hashed,
        password_set: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.id);

    if (error) throw error;

    const newToken = await new SignJWT({ ...payload, passwordSet: true })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    cookieStore.set("guidance_token", newToken, {
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
    console.error("POST /api/auth/guidance/set-password error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
