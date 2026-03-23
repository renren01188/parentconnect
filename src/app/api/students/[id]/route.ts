import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// ── GET /api/students/[id] ────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: student, error } = await supabase
      .from("students")
      .select(`
        id, student_id, first_name, middle_name, last_name,
        suffix, gender, grade, section, rfid_card, created_at,
        parents (
          parent_first_name, parent_middle_name, parent_last_name,
          parent_suffix, relationship, contact_number,
          email, address, password_set, status
        )
      `)
      .eq("id", id)
      .single();

    if (error || !student) {
      return NextResponse.json(
        { success: false, message: "Student not found." },
        { status: 404 }
      );
    }

    const parent = (student as any).parents?.[0] ?? {};

    const data = {
      id:                 student.id,
      student_id:         student.student_id,
      first_name:         student.first_name,
      middle_name:        student.middle_name,
      last_name:          student.last_name,
      suffix:             student.suffix,
      gender:             student.gender,
      grade:              student.grade,
      section:            student.section,
      rfid_card:          student.rfid_card,
      created_at:         student.created_at,
      full_name: [
        student.first_name,
        student.middle_name || null,
        student.last_name,
        student.suffix || null,
      ].filter(Boolean).join(" "),
      parent_first_name:  parent.parent_first_name,
      parent_middle_name: parent.parent_middle_name,
      parent_last_name:   parent.parent_last_name,
      parent_suffix:      parent.parent_suffix,
      relationship:       parent.relationship,
      contact_number:     parent.contact_number,
      parent_email:       parent.email,
      parent_address:     parent.address ?? "",   // ← new
      password_set:       parent.password_set,
      parent_status:      parent.status,
    };

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error("GET /api/students/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

// ── PATCH /api/students/[id] ──────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body    = await req.json();

    const {
      firstName, middleName, lastName, suffix, gender, studentId,
      grade, section,
      parentFirstName, parentMiddleName, parentLastName, parentSuffix,
      relationship, contactNumber, email,
      address, // ← new
    } = body;

    const { data: existing, error: fetchError } = await supabase
      .from("students").select("id, student_id").eq("id", id).single();

    if (fetchError || !existing)
      return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });

    const currentStudentId = existing.student_id;

    if (studentId && studentId !== currentStudentId) {
      const { data: idCheck } = await supabase
        .from("students").select("id").eq("student_id", studentId).neq("id", id).limit(1);
      if (idCheck && idCheck.length > 0)
        return NextResponse.json({ success: false, message: "This Student ID is already used by another student." }, { status: 409 });
    }

    if (email) {
      const { data: emailCheck } = await supabase
        .from("parents").select("id").eq("email", email).neq("student_id", currentStudentId).limit(1);
      if (emailCheck && emailCheck.length > 0)
        return NextResponse.json({ success: false, message: "This email is already registered to another student." }, { status: 409 });
    }

    const { error: studentUpdateError } = await supabase
      .from("students")
      .update({
        first_name:  firstName   || undefined,
        middle_name: middleName  ?? null,
        last_name:   lastName    || undefined,
        suffix:      suffix      ?? null,
        gender:      gender      || undefined,
        student_id:  studentId   || undefined,
        grade:       grade       || undefined,
        section:     section     || undefined,
      })
      .eq("id", id);
    if (studentUpdateError) throw studentUpdateError;

    const newStudentId = studentId || currentStudentId;

    if (newStudentId !== currentStudentId) {
      const { error: fkError } = await supabase
        .from("parents").update({ student_id: newStudentId }).eq("student_id", currentStudentId);
      if (fkError) throw fkError;
    }

    const { error: parentUpdateError } = await supabase
      .from("parents")
      .update({
        parent_first_name:  parentFirstName  || undefined,
        parent_middle_name: parentMiddleName ?? null,
        parent_last_name:   parentLastName   || undefined,
        parent_suffix:      parentSuffix     ?? null,
        relationship:       relationship     || undefined,
        contact_number:     contactNumber    || undefined,
        email:              email            || undefined,
        address:            address          ?? null,    // ← new
      })
      .eq("student_id", newStudentId);
    if (parentUpdateError) throw parentUpdateError;

    return NextResponse.json({ success: true, message: "Student updated successfully." });

  } catch (error: any) {
    console.error("PATCH /api/students/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}