import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function errorMessage(error: unknown) {
  const text = error instanceof Error
    ? `${error.name} ${error.message} ${error.cause instanceof Error ? `${error.cause.name} ${error.cause.message}` : ""}`
    : JSON.stringify(error ?? "");
  if (/fetch failed|abort|connect timeout|UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(text)) {
    return "The school database is temporarily unavailable. Please check your connection and try again.";
  }
  return "Unable to load grade levels. Please try again.";
}

export async function GET() {
  try {
    // The sections table is the school's source of truth for available classes.
    // Deriving these from enrolled students hides any configured grade that has
    // no student record yet.
    const { data, error } = await supabase
      .from("sections")
      .select("grade, name")
      .not("grade", "is", null)
      .not("name", "is", null);

    if (error) throw error;

    const gradeSections: Record<string, string[]> = {};
    for (const row of data ?? []) {
      if (!row.grade || !row.name) continue;
      gradeSections[row.grade] = Array.from(new Set([...(gradeSections[row.grade] ?? []), row.name])).sort();
    }

    return NextResponse.json({
      success: true,
      gradeSections,
      grades: Object.keys(gradeSections).sort(),
    });
  } catch (error: unknown) {
    console.warn("GET /api/student-reports/options:", errorMessage(error));
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 503 }
    );
  }
}
