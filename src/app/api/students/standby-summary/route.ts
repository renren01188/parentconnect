// Authenticated ready-transfer counts for the receiving adviser's sections.
// This intentionally mirrors GET /api/students/standby's eligibility filter.

import { NextResponse } from "next/server";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const grade = adviser.grade?.trim() ?? "";
    const sections = [...new Set(
      (adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [])
        .map(section => section.trim())
        .filter(Boolean)
    )];

    if (!grade || sections.length === 0) {
      return NextResponse.json({ success: true, total: 0, grade: grade || null, sections: [] });
    }

    const { data, error } = await supabase
      .from("students")
      .select("target_section")
      .eq("transfer_status", "standby")
      .eq("target_grade", grade)
      .in("target_section", sections);
    if (error) throw error;

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      if (row.target_section) {
        counts.set(row.target_section, (counts.get(row.target_section) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      success: true,
      total: data?.length ?? 0,
      grade,
      sections: sections.map(section => ({ section, count: counts.get(section) ?? 0 })),
    });
  } catch (error: unknown) {
    console.error("GET /api/students/standby-summary error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
