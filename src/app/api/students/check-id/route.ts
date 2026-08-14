import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json(
        { success: false, message: "id query param is required." },
        { status: 400 }
      );
    }

    const { data: found, error } = await supabase
      .from("students")
      .select("student_id, first_name, last_name, grade, section")
      .eq("student_id", id)
      .limit(1);

    if (error) throw error;

    if (!found || found.length === 0) {
      return NextResponse.json({ success: true, taken: false });
    }

    const owner = found[0];
    return NextResponse.json({
      success: true,
      taken: true,
      owner: {
        full_name: `${owner.first_name} ${owner.last_name}`,
        grade: owner.grade,
        section: owner.section,
      },
    });
  } catch (error) {
    console.error("GET /api/students/check-id error:", error);
    return NextResponse.json(
      { success: false, message: "Server error." },
      { status: 500 }
    );
  }
}
