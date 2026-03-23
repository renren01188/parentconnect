import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

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

    const { data: advisers, error } = await supabase
      .from("advisers")
      .select("id, employee_id, first_name, last_name, email, password_hash, grade, section, phone, status")
      .or(`email.eq.${identifier.trim()},employee_id.eq.${identifier.trim()}`)
      .limit(1);

    if (error) throw error;

    if (!advisers || advisers.length === 0) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
      );
    }

    const adviser = advisers[0];

    if (adviser.status !== "active") {
      return NextResponse.json(
        { success: false, message: "Your account has been deactivated. Contact the administrator." },
        { status: 403 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, adviser.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
      );
    }

    const payload = {
      id:          adviser.id,
      employee_id: adviser.employee_id,
      first_name:  adviser.first_name,
      last_name:   adviser.last_name,
      email:       adviser.email,
      grade:       adviser.grade,
      section:     adviser.section,
      role:        "adviser",
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("adviser_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 8,
      path:     "/",
    });

    return NextResponse.json({ success: true, message: "Login successful." });

  } catch (error: any) {
    console.error("POST /api/auth/adviser/login error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}