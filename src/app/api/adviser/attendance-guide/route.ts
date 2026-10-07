import { NextResponse } from "next/server";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { supabase } from "@/lib/supabase";

const COMPLETION_COLUMN = "adviser_attendance_guide_completed_at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("advisers")
      .select(`id, ${COMPLETION_COLUMN}`)
      .eq("id", adviser.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ success: false, message: "Adviser account not found." }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, completed: Boolean(data[COMPLETION_COLUMN as keyof typeof data]) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("GET /api/adviser/attendance-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("advisers")
      .update({ [COMPLETION_COLUMN]: new Date().toISOString() })
      .eq("id", adviser.id)
      .is(COMPLETION_COLUMN, null)
      .select(COMPLETION_COLUMN)
      .maybeSingle();

    if (error) throw error;

    // Do not replace an existing completion timestamp on a retried request.
    if (!data) {
      const { data: current, error: currentError } = await supabase
        .from("advisers")
        .select(COMPLETION_COLUMN)
        .eq("id", adviser.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current?.[COMPLETION_COLUMN as keyof typeof current]) {
        return NextResponse.json({ success: false, message: "Adviser account not found." }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: true, completed: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("PATCH /api/adviser/attendance-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
