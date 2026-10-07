// app/api/students/standby/route.ts
// Process 2 — New Adviser fetches the list of students waiting on standby
// for a given grade + section so they can be claimed and given an RFID.
//
// GET /api/students/standby?grade=Grade 1&section=Rosal&search=
//
// Returns students where transfer_status = 'standby' AND
// target_grade = grade AND target_section = section.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const grade   = searchParams.get("grade")?.trim()   || "";
    const section = searchParams.get("section")?.trim() || "";
    const search  = searchParams.get("search")?.trim()  || "";

    if (!grade || !section) {
      return NextResponse.json(
        { success: false, message: "grade and section query params are required." },
        { status: 400 }
      );
    }

    const adviserSections: string[] = adviser.sections?.length
      ? adviser.sections
      : adviser.section ? [adviser.section] : [];
    if (grade !== adviser.grade || !adviserSections.includes(section)) {
      return NextResponse.json(
        { success: false, message: "You can only view transfers assigned to your own grade and section." },
        { status: 403 }
      );
    }

    // ── Fetch standby students for the requested grade + section ─────────────

    let query = supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section, gender, rfid_card")
      .eq("transfer_status", "standby")
      .eq("archive_status", "active")
      .eq("target_grade",    grade)
      .eq("target_section",  section)
      .order("last_name", { ascending: true });

    // Optional search across name or student_id
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_id.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const students = (data ?? []).map((s) => ({
      id:         s.id,
      student_id: s.student_id,
      full_name:  `${s.first_name} ${s.last_name}`,
      grade:      s.grade,
      section:    s.section,
      gender:     s.gender,
      rfid_card:  s.rfid_card,
    }));

    return NextResponse.json({
      success: true,
      data:    students,
      total:   students.length,
    });

  } catch (error: unknown) {
    console.error("GET /api/students/standby error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json() as { grade?: string; section?: string; studentIds?: unknown };
    const grade = body.grade?.trim() ?? "";
    const section = body.section?.trim() ?? "";
    const studentIds = Array.isArray(body.studentIds)
      ? [...new Set(body.studentIds.filter((id): id is number => Number.isInteger(id) && id > 0))]
      : [];
    const adviserSections: string[] = adviser.sections?.length
      ? adviser.sections
      : adviser.section ? [adviser.section] : [];

    if (!grade || !section || studentIds.length === 0) {
      return NextResponse.json({ success: false, message: "Grade, section, and at least one student are required." }, { status: 400 });
    }
    if (grade !== adviser.grade || !adviserSections.includes(section)) {
      return NextResponse.json({ success: false, message: "You can only reject transfers assigned to your own grade and section." }, { status: 403 });
    }

    const { data: standbyStudents, error: standbyError } = await supabase
      .from("students")
      .select("id")
      .in("id", studentIds)
      .eq("transfer_status", "standby")
      .eq("archive_status", "active")
      .eq("target_grade", grade)
      .eq("target_section", section);
    if (standbyError) throw standbyError;
    if ((standbyStudents?.length ?? 0) !== studentIds.length) {
      return NextResponse.json({ success: false, message: "One or more students are no longer available on standby. Refresh the list and try again." }, { status: 409 });
    }

    const { data: rejected, error: rejectError } = await supabase
      .from("students")
      .update({ transfer_status: null, target_grade: null, target_section: null })
      .in("id", studentIds)
      .eq("transfer_status", "standby")
      .eq("archive_status", "active")
      .eq("target_grade", grade)
      .eq("target_section", section)
      .select("id");
    if (rejectError) throw rejectError;
    if ((rejected?.length ?? 0) !== studentIds.length) {
      return NextResponse.json({ success: false, message: "A transfer changed while it was being rejected. Refresh the list and try again." }, { status: 409 });
    }

    return NextResponse.json({ success: true, rejected: rejected?.map(student => student.id) ?? [] });
  } catch (error: unknown) {
    console.error("DELETE /api/students/standby error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
