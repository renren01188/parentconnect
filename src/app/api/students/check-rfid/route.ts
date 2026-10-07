import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveAdviser, getActiveIct } from "@/lib/apiAuthorization";
import { normalizeRfidCard } from "@/lib/rfid";

export async function GET(req: NextRequest) {
  try {
    const [adviser, ict] = await Promise.all([getActiveAdviser(), getActiveIct()]);
    if (!adviser && !ict) {
      return NextResponse.json({ success: false, message: "Staff access is required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const rfid = normalizeRfidCard(searchParams.get("rfid"));
    const excludeStudentDbId = Number(searchParams.get("excludeStudentDbId"));

    if (!rfid) {
      return NextResponse.json(
        { success: false, message: "rfid query param is required." },
        { status: 400 }
      );
    }

    // Use ilike for case-insensitive match so "a1b2" and "A1B2" are treated as the same card.
    // This ensures the check works across ALL advisers, grade levels, and sections.
    let query = supabase
      .from("students")
      .select("id")
      .ilike("rfid_card", rfid)
      .limit(1);

    if (Number.isInteger(excludeStudentDbId) && excludeStudentDbId > 0) {
      query = query.neq("id", excludeStudentDbId);
    }

    const { data: found, error } = await query;

    if (error) throw error;

    if (!found || found.length === 0) {
      return NextResponse.json({ success: true, taken: false });
    }

    // RFID values are identifiers, not proof of permission to view a child.
    // Keep this public validation response deliberately non-identifying.
    return NextResponse.json({ success: true, taken: true });

  } catch (error) {
    console.error("GET /api/students/check-rfid error:", error);
    return NextResponse.json(
      { success: false, message: "Server error." },
      { status: 500 }
    );
  }
}
