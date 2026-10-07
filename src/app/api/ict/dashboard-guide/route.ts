import { NextResponse } from "next/server";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { supabase } from "@/lib/supabase";

const COMPLETION_COLUMN = "ict_dashboard_guide_completed_at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function GET() {
  try {
    const ict = await getIctFromToken();
    if (!ict) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("ict_admins")
      .select(`id, ${COMPLETION_COLUMN}`)
      .eq("id", ict.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ success: false, message: "ICT account not found." }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, completed: Boolean(data[COMPLETION_COLUMN as keyof typeof data]) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("GET /api/ict/dashboard-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const ict = await getIctFromToken();
    if (!ict) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("ict_admins")
      .update({ [COMPLETION_COLUMN]: new Date().toISOString() })
      .eq("id", ict.id)
      .is(COMPLETION_COLUMN, null)
      .select(COMPLETION_COLUMN)
      .maybeSingle();

    if (error) throw error;

    // Do not replace an existing completion timestamp on a retried request.
    if (!data) {
      const { data: current, error: currentError } = await supabase
        .from("ict_admins")
        .select(COMPLETION_COLUMN)
        .eq("id", ict.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current?.[COMPLETION_COLUMN as keyof typeof current]) {
        return NextResponse.json({ success: false, message: "ICT account not found." }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: true, completed: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("PATCH /api/ict/dashboard-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
