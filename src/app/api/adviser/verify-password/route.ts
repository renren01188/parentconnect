import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const password: string | undefined = body?.password;

    if (!password || typeof password !== "string" || !password.trim()) {
      return NextResponse.json(
        { success: false, message: "Password is required." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("adviser_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in again." },
        { status: 401 }
      );
    }

    let adviserId: number;
    try {
      const { payload } = await jwtVerify(token, SECRET);
      adviserId = payload.id as number;
    } catch {
      return NextResponse.json(
        { success: false, message: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    const { data: rows, error } = await supabase
      .from("advisers")
      .select("password_hash")
      .eq("id", adviserId)
      .limit(1);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Adviser account not found." },
        { status: 404 }
      );
    }

    const match = await bcrypt.compare(password, rows[0].password_hash);

    if (!match) {
      return NextResponse.json(
        { success: false, message: "Incorrect password. Please try again." },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[POST /api/adviser/verify-password]", error);
    return NextResponse.json(
      { success: false, message: "Server error. Please try again." },
      { status: 500 }
    );
  }
}