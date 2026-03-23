import { sendTempPasswordEmail, sendDeletionEmail } from "@/lib/mailer";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < 8; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

// ── POST /api/students ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const body    = await req.json();

    const {
      firstName, middleName, lastName, suffix,
      studentId, gender, grade, section, rfidCard,
      parentFirstName, parentMiddleName, parentLastName, parentSuffix,
      relationship, contactNumber, email,
      address, // ← new
    } = body;

    const resolvedGrade   = grade   || adviser?.grade   || null;
    const resolvedSection = section || adviser?.section || null;

    if (
      !firstName || !lastName || !studentId || !gender ||
      !resolvedGrade || !resolvedSection ||
      !parentFirstName || !parentLastName ||
      !relationship || !contactNumber || !email
    ) {
      return NextResponse.json(
        { success: false, message: "All required fields must be filled in." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("students").select("id").eq("student_id", studentId).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: "A student with this ID already exists." },
        { status: 409 }
      );
    }

    const { data: emailCheck } = await supabase
      .from("parents").select("id").eq("email", email).limit(1);
    if (emailCheck && emailCheck.length > 0) {
      return NextResponse.json(
        { success: false, message: "This email is already registered to another student." },
        { status: 409 }
      );
    }

    const { error: studentError } = await supabase.from("students").insert({
      student_id:  studentId,
      first_name:  firstName,
      middle_name: middleName  || null,
      last_name:   lastName,
      suffix:      suffix      || null,
      gender,
      grade:       resolvedGrade,
      section:     resolvedSection,
      rfid_card:   rfidCard    || null,
    });
    if (studentError) throw studentError;

    const tempPassword = generateTempPassword();
    const hashedTemp   = await bcrypt.hash(tempPassword, 10);

    const { error: parentError } = await supabase.from("parents").insert({
      student_id:          studentId,
      parent_first_name:   parentFirstName,
      parent_middle_name:  parentMiddleName  || null,
      parent_last_name:    parentLastName,
      parent_suffix:       parentSuffix      || null,
      relationship,
      contact_number:      contactNumber,
      email,
      address:             address           || null, // ← new
      temp_password:       hashedTemp,
      password:            hashedTemp,
      password_set:        0,
      status:              "approved",
    });
    if (parentError) throw parentError;

    try {
      await sendTempPasswordEmail({
        parentEmail: email,
        parentName:  `${parentFirstName} ${parentLastName}`,
        studentName: `${firstName} ${lastName}`,
        tempPassword,
      });
    } catch (mailErr) {
      console.error("Email send failed:", mailErr);
    }

    return NextResponse.json({
      success:     true,
      message:     `Student ${firstName} ${lastName} registered successfully.`,
      tempPassword,
    });

  } catch (error: any) {
    console.error("POST /api/students error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

// ── GET /api/students ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "All";
    const page   = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit  = Math.max(1, parseInt(searchParams.get("limit") || "5"));
    const offset = (page - 1) * limit;

    const { data: rows, error } = await supabase.rpc("get_students_with_attendance", {
      p_grade:   adviser?.grade   ?? "",
      p_section: adviser?.section ?? "",
      p_search:  search,
      p_filter:  filter,
      p_limit:   limit,
      p_offset:  offset,
    });
    if (error) throw error;

    const total = rows?.[0]?.total_count ?? 0;

    return NextResponse.json({
      success: true,
      data:    rows ?? [],
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
      adviser: adviser
        ? { section: adviser.section, grade: adviser.grade, full_name: `${adviser.first_name} ${adviser.last_name}` }
        : null,
    });

  } catch (error: any) {
    console.error("GET /api/students error:", error.message);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

// ── DELETE /api/students?id=<student_db_id> ───────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "Student ID is required." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const { password, reason } = body as { password?: string; reason?: string };

    if (!password?.trim())
      return NextResponse.json({ success: false, message: "Password is required to authorize this action." }, { status: 400 });
    if (!reason || reason.trim().length < 10)
      return NextResponse.json({ success: false, message: "A reason of at least 10 characters is required." }, { status: 400 });

    const { data: adviserRow, error: adviserFetchErr } = await supabase
      .from("advisers").select("password_hash").eq("id", adviser.id).single();
    if (adviserFetchErr || !adviserRow)
      return NextResponse.json({ success: false, message: "Could not verify adviser credentials." }, { status: 500 });

    const passwordMatch = await bcrypt.compare(password.trim(), adviserRow.password_hash);
    if (!passwordMatch)
      return NextResponse.json({ success: false, message: "Incorrect password. Please try again." }, { status: 401 });

    const { data: studentRows, error: studentFetchErr } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section")
      .eq("id", id).eq("section", adviser.section).eq("grade", adviser.grade).limit(1);
    if (studentFetchErr) throw studentFetchErr;
    if (!studentRows || studentRows.length === 0)
      return NextResponse.json({ success: false, message: "Student not found or not in your section." }, { status: 404 });

    const student   = studentRows[0];
    const studentId = student.student_id;

    const { data: parentRows } = await supabase
      .from("parents").select("parent_first_name, parent_last_name, email").eq("student_id", studentId).limit(1);
    const parent = parentRows?.[0] ?? null;

    await supabase.from("parents").delete().eq("student_id", studentId);
    await supabase.from("attendance_logs").delete().eq("student_db_id", id);
    await supabase.from("students").delete().eq("id", id);

    if (parent?.email) {
      const deletedAt = new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila", year: "numeric", month: "long",
        day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      });
      try {
        await sendDeletionEmail({
          parentEmail: parent.email,
          parentName:  `${parent.parent_first_name} ${parent.parent_last_name}`.trim(),
          studentName: `${student.first_name} ${student.last_name}`.trim(),
          grade: student.grade, section: student.section, studentId,
          reason: reason.trim(),
          adviserName: `${adviser.first_name} ${adviser.last_name}`.trim(),
          deletedAt,
        });
      } catch (mailErr) { console.error("Deletion email failed:", mailErr); }
    }

    return NextResponse.json({ success: true, message: "Student deleted successfully. The parent has been notified via email." });

  } catch (error: any) {
    console.error("DELETE /api/students error:", error);
    return NextResponse.json({ success: false, message: error.message || "Server error." }, { status: 500 });
  }
}