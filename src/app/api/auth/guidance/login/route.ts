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

    const cleanedIdentifier = identifier.trim();
    const { data: rows, error } = await supabase
      .from("guidance_counselors")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, password_hash, status, password_set")
      .or(`email.eq.${cleanedIdentifier.toLowerCase()},employee_id.eq.${cleanedIdentifier}`)
      .limit(1);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
      );
    }

    const guidance = rows[0];
    if (guidance.status !== "active") {
      return NextResponse.json(
        { success: false, message: "Your account has been deactivated. Contact the administrator." },
        { status: 403 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, guidance.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials." },
        { status: 401 }
      );
    }

    const passwordSet = guidance.password_set == null
      ? true
      : guidance.password_set === true || guidance.password_set === 1;

    const payload = {
      id: guidance.id,
      employee_id: guidance.employee_id,
      first_name: guidance.first_name,
      middle_name: guidance.middle_name,
      last_name: guidance.last_name,
      suffix: guidance.suffix,
      email: guidance.email,
      phone: guidance.phone,
      role: "guidance",
      passwordSet,
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("guidance_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      passwordSet,
      guidance: {
        firstName: guidance.first_name,
        middleName: guidance.middle_name || "",
        lastName: guidance.last_name,
        suffix: guidance.suffix || "",
        email: guidance.email,
        contactNumber: guidance.phone || "",
        employeeId: guidance.employee_id,
        school: "Santiago Elementary",
        role: "Guidance Counselor",
        status: "Active",
      },
      message: "Login successful.",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/guidance/login error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
