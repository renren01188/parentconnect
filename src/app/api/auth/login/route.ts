import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { logAudit } from "@/lib/audit";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

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
        id, email, password, temp_password, password_set, status, student_id, contact_number,
        parent_first_name, parent_last_name,
        students!inner ( first_name, last_name, grade, section )
      `)
      .eq("email", email.toLowerCase().trim())
      .order("password_set", { ascending: false });

    if (error) throw error;

    if (!parents || parents.length === 0) {
      return NextResponse.json(
        { success: false, message: "This Account is not registered yet!" },
        { status: 401 }
      );
    }

    const parent = parents.find((row) =>
      !(row.parent_first_name === "Parent" && row.parent_last_name === "Guardian" && !row.contact_number)
    );

    if (!parent) {
      return NextResponse.json(
        { success: false, message: "This Account is not registered yet!" },
        { status: 401 }
      );
    }

    const student = parent.students as unknown as {
      first_name: string;
      last_name: string;
      grade: string;
      section: string;
    };

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

    const parentName = `${parent.parent_first_name} ${parent.parent_last_name}`;

    const payload = {
      id:          parent.id,
      email:       parent.email,
      studentId:   parent.student_id,
      parentName,
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

    // ── Audit log ──
    await logAudit({
      action:           "Login",
      performedBy:      parentName,
      performedByRole:  "Parent",
      performedByEmail: parent.email,
      details:          `Parent "${parentName}" logged in.`,
      module:           "Auth",
    });

    return NextResponse.json({
      success:     true,
      passwordSet: parent.password_set === 1,
      message:     parent.password_set === 1
        ? "Login successful."
        : "Login successful. Please set your new password.",
    });

  } catch (error: unknown) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
