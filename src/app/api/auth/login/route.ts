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
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    const { data: parents, error } = await supabase
      .from("parents")
      .select(`
        id, email, password, temp_password, password_set, status, student_id,
        parent_first_name, parent_last_name,
        students!inner ( first_name, last_name, grade, section )
      `)
      .eq("email", email.toLowerCase().trim())
      .limit(1);

    if (error) throw error;

    if (!parents || parents.length === 0) {
      return NextResponse.json(
        { success: false, message: "No account found with this email address." },
        { status: 401 }
      );
    }

    const parent = parents[0];
    const student = (parent as any).students;

    if (parent.status !== "approved") {
      return NextResponse.json(
        { success: false, message: "Your account is pending approval. Please contact the school adviser." },
        { status: 403 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, parent.password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Incorrect password. Please try again." },
        { status: 401 }
      );
    }

    const payload = {
      id:          parent.id,
      email:       parent.email,
      studentId:   parent.student_id,
      parentName:  `${parent.parent_first_name} ${parent.parent_last_name}`,
      studentName: `${student.first_name} ${student.last_name}`,
      grade:       student.grade,
      section:     student.section,
      passwordSet: parent.password_set === 1,
    };

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("parent_token", token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge:   60 * 60 * 24,
      path:     "/",
    });

    return NextResponse.json({
      success:     true,
      passwordSet: parent.password_set === 1,
      message:     parent.password_set === 1
        ? "Login successful."
        : "Login successful. Please set your new password.",
    });

  } catch (error: any) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}