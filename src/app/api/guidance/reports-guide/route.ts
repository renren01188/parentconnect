import { NextResponse } from "next/server";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import { supabase } from "@/lib/supabase";

const COMPLETION_COLUMN = "guidance_reports_guide_completed_at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function GET() {
  try {
    const guidance = await getGuidanceFromToken();
    if (!guidance) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("guidance_counselors")
      .select(`id, ${COMPLETION_COLUMN}`)
      .eq("id", guidance.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ success: false, message: "Guidance account not found." }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, completed: Boolean(data[COMPLETION_COLUMN as keyof typeof data]) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("GET /api/guidance/reports-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const guidance = await getGuidanceFromToken();
    if (!guidance) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("guidance_counselors")
      .update({ [COMPLETION_COLUMN]: new Date().toISOString() })
      .eq("id", guidance.id)
      .is(COMPLETION_COLUMN, null)
      .select(COMPLETION_COLUMN)
      .maybeSingle();

    if (error) throw error;

    // Do not replace an existing completion timestamp on a retried request.
    if (!data) {
      const { data: current, error: currentError } = await supabase
        .from("guidance_counselors")
        .select(COMPLETION_COLUMN)
        .eq("id", guidance.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current?.[COMPLETION_COLUMN as keyof typeof current]) {
        return NextResponse.json({ success: false, message: "Guidance account not found." }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: true, completed: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("PATCH /api/guidance/reports-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
