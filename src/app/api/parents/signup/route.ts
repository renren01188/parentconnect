import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cleanNamePart, sameFamilyName } from "@/lib/familyName";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";

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
    const firstName = titleCase(cleanNamePart(body.firstName) ?? "");
    const middleName = titleCase(cleanNamePart(body.middleName) ?? "");
    const lastName = titleCase(cleanNamePart(body.lastName) ?? "");
    const suffix = (body.suffix || "").trim();
    const contactNumber = (body.contactNumber || "").replace(/\D/g, "");
    const email = (body.email || "").trim().toLowerCase();
    const studentLrn = (body.studentLrn || "").replace(/\D/g, "");
    const relationship = ["Father", "Mother", "Guardian"].includes(body.relationship) ? body.relationship : "Guardian";
    const termsAccepted = !!body.termsAccepted;

    if (!firstName || !lastName || !contactNumber || !email || !studentLrn) {
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
      .select("id, student_id, first_name, last_name, grade, section")
      .eq("student_id", studentLrn)
      .limit(1);

    if (studentError) throw studentError;

    if (!students || students.length === 0) {
      return NextResponse.json(
        { success: false, message: "The entered Student LRN does not exist." },
        { status: 404 }
      );
    }
    const student = students[0];
    const { data: familyMembers, error: familyError } = await supabase
      .from("student_family_members")
      .select("role, first_name, middle_name, last_name")
      .eq("student_db_id", student.id);
    if (familyError) throw familyError;
    const family = familyMembers ?? [];
    const hasParent = family.some(member =>
      (member.role === "Father" || member.role === "Mother")
      && !!cleanNamePart(member.first_name)
      && !!cleanNamePart(member.last_name)
    );
    const eligibleMembers = family.filter(member =>
      member.role === relationship && (relationship !== "Guardian" || !hasParent)
    );
    const nameMatches = eligibleMembers.some(member => sameFamilyName(
      { firstName, middleName, lastName },
      { firstName: member.first_name, middleName: member.middle_name, lastName: member.last_name }
    ));
    if (!nameMatches) {
      return NextResponse.json({ success: false, message: "The parent or guardian name does not match the SF1 registration record for this Student LRN." }, { status: 409 });
    }

    const { data: emailRows, error: emailError } = await supabase
      .from("parents")
      .select("id, student_id, password, temp_password, password_set, email")
      .eq("email", email)
      .order("password_set", { ascending: false });

    if (emailError) throw emailError;

    const registeredEmail = emailRows?.find((row) => row.password_set === 1);
    if (registeredEmail) {
      const { error: linkError } = await supabase.from("parent_student_links").upsert({ parent_id: registeredEmail.id, student_id: studentLrn, relationship }, { onConflict: "parent_id,student_id" });
      if (linkError) throw linkError;
      await reconcileParentStudentLinks({ parentId: registeredEmail.id });
      return NextResponse.json({ success: true, redirectTo: "/login/guardian", message: "Your existing account is now linked to this student. Please log in." });
    }

    // A student can have more than one registered adult.  Do not use a
    // parent row's legacy `student_id` as a uniqueness check: it was the
    // reason only the first (usually Father) account could complete signup.
    // The authoritative relationship/name check is the SF1 family record
    // above, and the link table records every approved parent/student pair.
    let existingLrn = emailRows?.[0];
    if (!existingLrn) {
      const placeholderHash = await bcrypt.hash(crypto.randomUUID(), 10);
      const { data: pendingParent, error: pendingError } = await supabase.from("parents").insert({
        student_id: studentLrn, parent_first_name: firstName, parent_middle_name: middleName || null, parent_last_name: lastName,
        parent_suffix: suffix || null, relationship, contact_number: contactNumber, email, address: null,
        password: placeholderHash, temp_password: null, password_set: 0, status: "approved",
      }).select("id, student_id, email, password, temp_password, password_set").single();
      if (pendingError) throw pendingError;
      existingLrn = pendingParent;
      const { error: linkError } = await supabase.from("parent_student_links").upsert({ parent_id: pendingParent.id, student_id: studentLrn, relationship }, { onConflict: "parent_id,student_id" });
      if (linkError) throw linkError;
    }

    if (existingLrn?.password_set === 1) {
      return NextResponse.json(
        { success: false, message: "This email already has a registered parent account. Please log in instead." },
        { status: 409 }
      );
    }

    const accountHash = existingLrn.password || existingLrn.temp_password;

    const commonParentData = {
      parent_first_name: firstName,
      parent_middle_name: middleName || null,
      parent_last_name: lastName,
      parent_suffix: suffix || null,
      relationship,
      contact_number: contactNumber,
      email,
      address: null,
      temp_password: null,
      password: accountHash,
      password_set: 0,
      status: "approved",
    };

    let parentId = existingLrn?.id;

    const { data, error } = await supabase
      .from("parents")
      .update({ ...commonParentData, email })
      .eq("id", existingLrn.id)
      .select("id")
      .single();
    if (error) throw error;
    parentId = data.id;

    // The parent has now been verified against one SF1 record. Link every
    // other exact Father/Mother/Guardian match, including children in other
    // grades or sections.
    await reconcileParentStudentLinks({ parentId });

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
