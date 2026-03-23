import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "";

    let studentQuery = supabase
      .from("students")
      .select("section");
    if (grade) studentQuery = studentQuery.eq("grade", grade);

    let adviserQuery = supabase
      .from("advisers")
      .select("section")
      .not("section", "is", null)
      .neq("section", "");
    if (grade) adviserQuery = adviserQuery.eq("grade", grade);

    const [{ data: studentSections }, { data: adviserSections }] = await Promise.all([
      studentQuery,
      adviserQuery,
    ]);

    const allSections = new Set<string>();
    for (const row of studentSections ?? []) if (row.section) allSections.add(row.section);
    for (const row of adviserSections ?? []) if (row.section) allSections.add(row.section);

    return NextResponse.json({
      success:  true,
      sections: Array.from(allSections).sort(),
    });

  } catch (error: any) {
    console.error("GET /api/sections error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}