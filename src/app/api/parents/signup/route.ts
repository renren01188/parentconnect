import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = titleCase(body.firstName || "");
    const middleName = titleCase(body.middleName || "");
    const lastName = titleCase(body.lastName || "");
    const suffix = (body.suffix || "").trim();
    const address = titleCase(body.address || "");
    const contactNumber = (body.contactNumber || "").replace(/\D/g, "");
    const email = (body.email || "").trim().toLowerCase();
    const studentLrn = (body.studentLrn || "").replace(/\D/g, "");
    const password = body.password || "";
    const termsAccepted = !!body.termsAccepted;

    if (!firstName || !lastName || !address || !contactNumber || !email || !studentLrn || !password) {
      return NextResponse.json(
        { success: false, message: "Please complete all required fields." },
        { status: 400 }
      );
    }

    if (!termsAccepted) {
      return NextResponse.json(
        { success: false, message: "Please accept the Terms and Agreement before signing up." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, message: "Enter a valid active email address." },
        { status: 400 }
      );
    }

    if (contactNumber.length !== 11) {
      return NextResponse.json(
        { success: false, message: "Active mobile number must be exactly 11 digits." },
        { status: 400 }
      );
    }

    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("student_id, first_name, last_name, grade, section")
      .eq("student_id", studentLrn)
      .limit(1);

    if (studentError) throw studentError;

    if (!students || students.length === 0) {
      return NextResponse.json(
        { success: false, message: "The entered Student LRN does not exist." },
        { status: 404 }
      );
    }

    const { data: emailRows, error: emailError } = await supabase
      .from("parents")
      .select("id, student_id, password, temp_password, password_set, email")
      .eq("email", email)
      .order("password_set", { ascending: false });

    if (emailError) throw emailError;

    const registeredEmail = emailRows?.find((row) => row.password_set === 1);
    if (registeredEmail) {
      return NextResponse.json(
        { success: false, message: "This email already has a registered parent account. Please log in instead." },
        { status: 409 }
      );
    }

    const { data: lrnRows, error: lrnError } = await supabase
      .from("parents")
      .select("id, email, password, temp_password, password_set")
      .eq("student_id", studentLrn)
      .limit(1);

    if (lrnError) throw lrnError;

    const existingLrn = lrnRows?.[0];
    if (!existingLrn) {
      return NextResponse.json(
        { success: false, message: "This LRN is not linked to a parent account yet. Please contact the adviser." },
        { status: 404 }
      );
    }

    if (existingLrn.email.toLowerCase() !== email) {
      return NextResponse.json(
        { success: false, message: "The active email does not match the parent account registered for this LRN." },
        { status: 409 }
      );
    }

    if (existingLrn?.password_set === 1) {
      return NextResponse.json(
        { success: false, message: "This Student LRN already has a registered parent account." },
        { status: 409 }
      );
    }

    const tempHash = existingLrn.temp_password || existingLrn.password;
    const tempPasswordMatches = tempHash ? await bcrypt.compare(password, tempHash) : false;
    if (!tempPasswordMatches) {
      return NextResponse.json(
        { success: false, message: "The temporary password does not match the active email and Student LRN." },
        { status: 401 }
      );
    }

    const commonParentData = {
      parent_first_name: firstName,
      parent_middle_name: middleName || null,
      parent_last_name: lastName,
      parent_suffix: suffix || null,
      relationship: "Guardian",
      contact_number: contactNumber,
      email,
      address,
      temp_password: tempHash,
      password: tempHash,
      password_set: 0,
      status: "approved",
    };

    const student = students[0];
    let parentId = existingLrn?.id;

    if (emailRows && emailRows.length > 0) {
      const { error } = await supabase
        .from("parents")
        .update(commonParentData)
        .eq("email", email);
      if (error) throw error;
    }

    const { data, error } = await supabase
      .from("parents")
      .update({ ...commonParentData, email })
      .eq("id", existingLrn.id)
      .select("id")
      .single();
    if (error) throw error;
    parentId = data.id;

    const token = await new SignJWT({
      id: parentId,
      email,
      studentId: studentLrn,
      parentName: `${firstName} ${lastName}`,
      studentName: `${student.first_name} ${student.last_name}`,
      grade: student.grade,
      section: student.section,
      passwordSet: false,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(SECRET);

    const cookieStore = await cookies();
    cookieStore.set("parent_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      redirectTo: "/login/guardian/set-password",
      message: "Sign up successful. Please create your new password.",
    });
  } catch (error: unknown) {
    console.error("POST /api/parents/signup error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
