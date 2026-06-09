import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const password = body?.password;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { success: false, message: "Password is required." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("ict_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in again." },
        { status: 401 }
      );
    }

    let ictId: number;
    try {
      const { payload } = await jwtVerify(token, SECRET);
      if (payload.role !== "ict") throw new Error("Invalid role.");
      ictId = Number(payload.id);
    } catch {
      return NextResponse.json(
        { success: false, message: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("ict_admins")
      .select("password_hash")
      .eq("id", ictId)
      .limit(1)
      .single();

    if (error) throw error;
    if (!data?.password_hash) {
      return NextResponse.json(
        { success: false, message: "ICT admin account not found." },
        { status: 404 }
      );
    }

    const match = await bcrypt.compare(password, data.password_hash);
    if (!match) {
      return NextResponse.json(
        { success: false, message: "Incorrect password. Please try again." },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("POST /api/ict/verify-password error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
