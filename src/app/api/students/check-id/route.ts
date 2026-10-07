import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveAdviser, getActiveIct } from "@/lib/apiAuthorization";

export async function GET(req: NextRequest) {
  try {
    const [adviser, ict] = await Promise.all([getActiveAdviser(), getActiveIct()]);
    if (!adviser && !ict) {
      return NextResponse.json({ success: false, message: "Staff access is required." }, { status: 403 });
    }

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
      .select("id")
      .eq("student_id", id)
      .limit(1);

    if (error) throw error;

    if (!found || found.length === 0) {
      return NextResponse.json({ success: true, taken: false });
    }

    // Do not turn an identifier check into a directory of children or their
    // class assignments.  Callers only need the availability result.
    return NextResponse.json({ success: true, taken: true });
  } catch (error) {
    console.error("GET /api/students/check-id error:", error);
    return NextResponse.json(
      { success: false, message: "Server error." },
      { status: 500 }
    );
  }
}
