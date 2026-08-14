import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || error.message?.toLowerCase().includes("does not exist") || error.message?.toLowerCase().includes("schema cache")));
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("sections")
      .select("grade")
      .order("grade", { ascending: true });

    if (error && isMissingSchemaError(error)) return NextResponse.json({ success: true, grades: [] });
    if (error) throw error;

    const uniqueGrades = [...new Set((data ?? []).map(r => r.grade))].filter(Boolean);

    return NextResponse.json({ success: true, grades: uniqueGrades });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
