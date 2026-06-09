// app/api/students/all/route.ts
// Used by the Transfer New Level page (transfer-level/page.tsx)
// Returns ALL students belonging to this adviser regardless of today's attendance status.
//
// GET /api/students/all?page=1&limit=10&search=

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

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
    const search = searchParams.get("search")?.trim() || "";
    const requestedSection = searchParams.get("section")?.trim() || "";
    const page   = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit  = Math.max(1, parseInt(searchParams.get("limit") || "10"));
    const offset = (page - 1) * limit;

    // Build the full list of sections this adviser owns
    const adviserSections: string[] = adviser.sections?.length
      ? adviser.sections
      : adviser.section
      ? [adviser.section]
      : [];

    if (!adviser.grade || adviserSections.length === 0) {
      return NextResponse.json({
        success:    true,
        data:       [],
        pagination: { total: 0, page, limit, totalPages: 1 },
        sections:   [],
        activeSection: "",
      });
    }

    const activeSection = requestedSection && adviserSections.includes(requestedSection)
      ? requestedSection
      : adviserSections[0];

    // ── Count query ───────────────────────────────────────────────────────────

    let countQuery = supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("grade", adviser.grade)
      .eq("section", activeSection)
      // Only show students that are NOT already on standby
      .is("transfer_status", null);

    if (search) {
      countQuery = countQuery.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_id.ilike.%${search}%`
      );
    }

    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    const total = count ?? 0;

    // ── Data query ────────────────────────────────────────────────────────────

    let dataQuery = supabase
      .from("students")
      .select("id, student_id, first_name, last_name, gender, grade, section, rfid_card")
      .eq("grade", adviser.grade)
      .eq("section", activeSection)
      .is("transfer_status", null)
      .order("last_name",  { ascending: true })
      .order("first_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      dataQuery = dataQuery.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_id.ilike.%${search}%`
      );
    }

    const { data, error: dataErr } = await dataQuery;
    if (dataErr) throw dataErr;

    // Map to the shape the frontend expects
    const students = (data ?? []).map((s) => ({
      id:           s.id,
      student_id:   s.student_id,
      full_name:    `${s.first_name} ${s.last_name}`,
      first_name:   s.first_name,
      last_name:    s.last_name,
      gender:       s.gender,
      grade:        s.grade,
      section:      s.section,
      rfid_card:    s.rfid_card ?? null,
      // Transfer-level page only needs these columns — no attendance data needed
      today_status:    "Absent" as const,
      attendance_rate: 0,
    }));

    return NextResponse.json({
      success: true,
      data:    students,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      sections: adviserSections,
      activeSection,
      grade: adviser.grade,
    });

  } catch (error: unknown) {
    console.error("GET /api/students/all error:", error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
