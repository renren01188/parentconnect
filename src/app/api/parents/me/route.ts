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
    const parentEmail = typeof verified.payload.email === "string" ? verified.payload.email : "";

    if (!parentId || !parentEmail) {
      return NextResponse.json(
        { success: false, message: "Invalid session." },
        { status: 401 }
      );
    }

    const { data: parentRows, error } = await supabase
      .from("parents")
      .select("id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, contact_number, address, profile_picture, student_id")
      .eq("email", parentEmail)
      .order("id", { ascending: true });

    if (error) throw error;

    if (!parentRows || parentRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Parent account not found." },
        { status: 404 }
      );
    }

    const primaryParent = parentRows.find((row) => row.id === parentId) ?? parentRows[0];

    const { data: linkRows, error: linkError } = await supabase
      .from("parent_student_links")
      .select(`
        student_id,
        students!inner (
          id, student_id, first_name, middle_name, last_name, suffix, grade, section
        )
      `)
      .eq("parent_id", primaryParent.id)
      .order("created_at", { ascending: true });

    if (linkError) throw linkError;

    let linkedRows = linkRows ?? [];

    if (linkedRows.length === 0 && primaryParent.student_id) {
      const { data: legacyStudentRows, error: legacyStudentError } = await supabase
        .from("students")
        .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section")
        .eq("student_id", primaryParent.student_id)
        .limit(1);

      if (legacyStudentError) throw legacyStudentError;
      linkedRows = (legacyStudentRows ?? []).map((student) => ({
        student_id: student.student_id,
        students: student as any
      }));
    }

    const students = linkedRows.map((link) => {
      const student = link.students as unknown as {
        id: number;
        student_id: string;
        first_name: string;
        middle_name?: string | null;
        last_name: string;
        suffix?: string | null;
        grade: string;
        section: string;
      };

      return {
        id: student.id,
        lrn: student.student_id,
        name: fullName(student),
        grade: student.grade,
        section: student.section,
      };
    });

    return NextResponse.json({
      success: true,
      parent: {
        id: primaryParent.id,
        email: primaryParent.email,
        firstName: primaryParent.parent_first_name ?? "",
        middleName: primaryParent.parent_middle_name ?? "",
        lastName: primaryParent.parent_last_name ?? "",
        suffix: primaryParent.parent_suffix ?? "",
        phone: primaryParent.contact_number ?? "",
        address: primaryParent.address ?? "",
        profilePicture: primaryParent.profile_picture ?? "",
        name: [
          primaryParent.parent_first_name,
          primaryParent.parent_middle_name,
          primaryParent.parent_last_name,
          primaryParent.parent_suffix,
        ].filter(Boolean).join(" "),
      },
      student: students[0],
      students,
    });
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
    const currentEmail = typeof verified.payload.email === "string" ? verified.payload.email : "";

    if (!parentId || !currentEmail) {
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
      profilePicture,
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

    if (profilePicture && (typeof profilePicture !== "string" || !/^data:image\/(png|jpe?g|webp);base64,/.test(profilePicture) || profilePicture.length > 14_000_000)) {
      return NextResponse.json({ success: false, message: "Use a PNG, JPG, or WebP image up to 10 MB." }, { status: 400 });
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

    const passwordMatch = await bcrypt.compare(currentPassword, currentRows[0].password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== currentEmail.toLowerCase()) {
      const { data: existingEmail, error: existingError } = await supabase
        .from("parents")
        .select("id")
        .eq("email", normalizedEmail)
        .neq("email", currentEmail)
        .limit(1);

      if (existingError) throw existingError;
      if (existingEmail && existingEmail.length > 0) {
        return NextResponse.json(
          { success: false, message: "This email address is already in use." },
          { status: 409 }
        );
      }
    }

    // A parent can have one row for each linked child. Keep every one of those
    // rows aligned so staff views which join through a student never see a
    // different version of the parent's details.
    const { data: linkedParentRows, error: linkedParentsError } = await supabase
      .from("parents")
      .select("id")
      .eq("email", currentEmail);

    if (linkedParentsError) throw linkedParentsError;

    const linkedParentIds = (linkedParentRows ?? [])
      .map((row) => Number(row.id))
      .filter(Number.isFinite);

    const updatePayload = {
      parent_first_name: firstName.trim(),
      parent_middle_name: middleName?.trim() || null,
      parent_last_name: lastName.trim(),
      parent_suffix: suffix?.trim() || null,
      email: normalizedEmail,
      contact_number: phone?.trim() || "",
      address: address?.trim() || null,
      profile_picture: typeof profilePicture === "string" ? profilePicture : undefined,
    };

    const { error: updateError } = await supabase
      .from("parents")
      .update(updatePayload)
      .eq("email", currentEmail);

    if (updateError) throw updateError;

    // Reports intentionally store parent contact details as a snapshot so they
    // can be rendered without extra joins. Refresh that snapshot after a
    // profile edit; otherwise Adviser, Guidance, and Principal dashboards keep
    // showing the old parent name/email. The email condition also covers legacy
    // reports created before parent_id was consistently stored.
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

    const reportMatch = [
      linkedParentIds.length > 0 ? `parent_id.in.(${linkedParentIds.join(",")})` : "",
      `parent_email.eq.${currentEmail}`,
    ].filter(Boolean).join(",");

    const { data: linkedReports, error: reportsError } = await supabase
      .from("parent_adviser_reports")
      .update({ parent_name: updatedParentName, parent_email: normalizedEmail, parent_profile_picture: updatePayload.profile_picture })
      .or(reportMatch)
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
        profilePicture: updatePayload.profile_picture ?? "",
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
    const parentEmail = typeof verified.payload.email === "string" ? verified.payload.email : "";
    const { currentPassword, newPassword } = await req.json();

    if (!parentId || !parentEmail) {
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
      .eq("email", parentEmail);

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
