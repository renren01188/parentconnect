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

    // ── Fetch standby students for the requested grade + section ─────────────

    let query = supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section, gender")
      .eq("transfer_status", "standby")
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
    }));

    return NextResponse.json({
      success: true,
      data:    students,
      total:   students.length,
    });

  } catch (error: any) {
    console.error("GET /api/students/standby error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}