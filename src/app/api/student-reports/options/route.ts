import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("students")
      .select("grade, section")
      .not("grade", "is", null)
      .not("section", "is", null);

    if (error) throw error;

    const gradeSections: Record<string, string[]> = {};
    for (const row of data ?? []) {
      if (!row.grade || !row.section) continue;
      gradeSections[row.grade] = Array.from(new Set([...(gradeSections[row.grade] ?? []), row.section])).sort();
    }

    return NextResponse.json({
      success: true,
      gradeSections,
      grades: Object.keys(gradeSections).sort(),
    });
  } catch (error: unknown) {
    console.error("GET /api/student-reports/options error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
