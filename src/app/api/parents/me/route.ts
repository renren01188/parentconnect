import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { logAudit } from "@/lib/audit";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

function fullName(row: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
}) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

type LinkedStudentRow = {
  id: number;
  student_id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  grade: string;
  section: string;
  house_street_sitio_purok?: string | null;
  barangay?: string | null;
  municipality_city?: string | null;
  province?: string | null;
};

type ParentStudentLink = {
  student_id: string;
  students: LinkedStudentRow | LinkedStudentRow[] | null;
};

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("parent_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const verified = await jwtVerify(token, SECRET);
    const parentId = Number(verified.payload.id);

    if (!parentId || verified.payload.role !== "parent") {
      return NextResponse.json(
        { success: false, message: "Invalid session." },
        { status: 401 }
      );
    }

    const { data: primaryParent, error } = await supabase
      .from("parents")
      .select("id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, contact_number, address, student_id")
      .eq("id", parentId)
      .maybeSingle();

    if (error) throw error;

    if (!primaryParent) {
      return NextResponse.json(
        { success: false, message: "Parent account not found." },
        { status: 404 }
      );
    }

    const { data: linkRows, error: linkError } = await supabase
      .from("parent_student_links")
      .select(`
        student_id,
        students!inner (
          id, student_id, first_name, middle_name, last_name, suffix, grade, section,
          house_street_sitio_purok, barangay, municipality_city, province
        )
      `)
      .eq("parent_id", primaryParent.id)
      .order("created_at", { ascending: true });

    if (linkError) throw linkError;

    let linkedRows = (linkRows ?? []) as unknown as ParentStudentLink[];

    if (linkedRows.length === 0 && primaryParent.student_id) {
      const { data: legacyStudentRows, error: legacyStudentError } = await supabase
        .from("students")
        .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, house_street_sitio_purok, barangay, municipality_city, province")
        .eq("student_id", primaryParent.student_id)
        .limit(1);

      if (legacyStudentError) throw legacyStudentError;
      linkedRows = (legacyStudentRows ?? []).map((student) => ({
        student_id: student.student_id,
        students: student as LinkedStudentRow
      }));
    }

    const students = linkedRows.flatMap((link) => {
      const student = Array.isArray(link.students) ? link.students[0] : link.students;
      if (!student) return [];

      return [{
        id: student.id,
        lrn: student.student_id,
        name: fullName(student),
        grade: student.grade,
        section: student.section,
        address: [student.house_street_sitio_purok, student.barangay, student.municipality_city, student.province]
          .filter(Boolean)
          .join(", "),
      }];
    });

    return NextResponse.json(
      {
        success: true,
        parent: {
          id: primaryParent.id,
          email: primaryParent.email,
          firstName: primaryParent.parent_first_name ?? "",
          middleName: primaryParent.parent_middle_name ?? "",
          lastName: primaryParent.parent_last_name ?? "",
          suffix: primaryParent.parent_suffix ?? "",
          phone: primaryParent.contact_number ?? "",
          // Student registration is the single source of truth for the
          // household address displayed to a parent.
          address: students[0]?.address || primaryParent.address || "",
          name: [
            primaryParent.parent_first_name,
            primaryParent.parent_middle_name,
            primaryParent.parent_last_name,
            primaryParent.parent_suffix,
          ].filter(Boolean).join(" "),
        },
        student: students[0],
        students,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("GET /api/parents/me error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("parent_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const verified = await jwtVerify(token, SECRET);
    const parentId = Number(verified.payload.id);

    if (!parentId || verified.payload.role !== "parent") {
      return NextResponse.json(
        { success: false, message: "Invalid session." },
        { status: 401 }
      );
    }

    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      phone,
      address,
      currentPassword,
    } = await req.json();

    if (!firstName || !lastName || !email || !currentPassword) {
      return NextResponse.json(
        { success: false, message: "First name, last name, email, and current password are required." },
        { status: 400 }
      );
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { success: false, message: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const { data: currentRows, error: currentError } = await supabase
      .from("parents")
      .select("id, email, password")
      .eq("id", parentId)
      .limit(1);

    if (currentError) throw currentError;
    if (!currentRows || currentRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Parent account not found." },
        { status: 404 }
      );
    }
    const currentEmail = currentRows[0].email?.trim().toLowerCase() ?? "";

    const passwordMatch = await bcrypt.compare(currentPassword, currentRows[0].password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== currentEmail) {
      const { data: existingEmail, error: existingError } = await supabase
        .from("parents")
        .select("id")
        .eq("email", normalizedEmail)
        .neq("id", parentId)
        .limit(1);

      if (existingError) throw existingError;
      if (existingEmail && existingEmail.length > 0) {
        return NextResponse.json(
          { success: false, message: "This email address is already in use." },
          { status: 409 }
        );
      }
    }

    const updatePayload = {
      parent_first_name: firstName.trim(),
      parent_middle_name: middleName?.trim() || null,
      parent_last_name: lastName.trim(),
      parent_suffix: suffix?.trim() || null,
      email: normalizedEmail,
      contact_number: phone?.trim() || "",
      address: address?.trim() || null,
    };

    const { error: updateError } = await supabase
      .from("parents")
      .update(updatePayload)
      .eq("id", parentId);

    if (updateError) throw updateError;

    // Reports store a snapshot for staff rendering. Update only rows owned by
    // this account; never use a shared email address as an ownership key.
    const updatedParentName = [
      updatePayload.parent_first_name,
      updatePayload.parent_middle_name,
      updatePayload.parent_last_name,
      updatePayload.parent_suffix,
    ].filter(Boolean).join(" ");

    await logAudit({
      action: "Update",
      performedBy: updatedParentName || "Parent",
      performedByRole: "Parent",
      performedByEmail: normalizedEmail,
      targetUser: updatedParentName || "Parent",
      targetRole: "Parent",
      targetEmail: normalizedEmail,
      module: "Profile",
      details: "Updated their profile.",
    });

    const { data: linkedReports, error: reportsError } = await supabase
      .from("parent_adviser_reports")
      .update({ parent_name: updatedParentName, parent_email: normalizedEmail })
      .eq("parent_id", parentId)
      .select("id");

    if (reportsError) throw reportsError;

    // Conversation rows can also expose the sender's name in staff views.
    // Keep those labels consistent with the parent profile as well.
    const reportIds = (linkedReports ?? []).map((report) => report.id);
    if (reportIds.length > 0) {
      const { error: messageUpdateError } = await supabase
        .from("parent_adviser_report_messages")
        .update({ sender_name: updatedParentName })
        .eq("sender_role", "parent")
        .in("report_id", reportIds);

      if (messageUpdateError) throw messageUpdateError;
    }

    const newPayload = {
      ...verified.payload,
      email: normalizedEmail,
      parentName: updatedParentName,
    };

    const newToken = await new SignJWT(newPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("24h")
      .sign(SECRET);

    cookieStore.set("parent_token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return NextResponse.json({
      success: true,
      parent: {
        firstName: updatePayload.parent_first_name,
        middleName: updatePayload.parent_middle_name ?? "",
        lastName: updatePayload.parent_last_name,
        suffix: updatePayload.parent_suffix ?? "",
        email: normalizedEmail,
        phone: updatePayload.contact_number,
        address: updatePayload.address ?? "",
      },
      message: "Profile updated successfully.",
    });
  } catch (error: unknown) {
    console.error("PATCH /api/parents/me error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("parent_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const verified = await jwtVerify(token, SECRET);
    const parentId = Number(verified.payload.id);
    const { currentPassword, newPassword } = await req.json();

    if (!parentId || verified.payload.role !== "parent") {
      return NextResponse.json(
        { success: false, message: "Invalid session." },
        { status: 401 }
      );
    }

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: "Current and new password are required." },
        { status: 400 }
      );
    }

    const { data: currentRows, error: currentError } = await supabase
      .from("parents")
      .select("password")
      .eq("id", parentId)
      .limit(1);

    if (currentError) throw currentError;
    if (!currentRows || currentRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Parent account not found." },
        { status: 404 }
      );
    }

    const passwordMatch = await bcrypt.compare(currentPassword, currentRows[0].password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const password = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabase
      .from("parents")
      .update({ password, password_set: 1, temp_password: null })
      .eq("id", parentId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error: unknown) {
    console.error("PUT /api/parents/me error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
