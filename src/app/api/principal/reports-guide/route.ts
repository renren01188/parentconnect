import { NextResponse } from "next/server";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { supabase } from "@/lib/supabase";

const COMPLETION_COLUMN = "principal_reports_guide_completed_at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function GET() {
  try {
    const principal = await getPrincipalFromToken();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("principals")
      .select(`id, ${COMPLETION_COLUMN}`)
      .eq("id", principal.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ success: false, message: "Principal account not found." }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, completed: Boolean(data[COMPLETION_COLUMN as keyof typeof data]) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("GET /api/principal/reports-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const principal = await getPrincipalFromToken();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("principals")
      .update({ [COMPLETION_COLUMN]: new Date().toISOString() })
      .eq("id", principal.id)
      .is(COMPLETION_COLUMN, null)
      .select(COMPLETION_COLUMN)
      .maybeSingle();

    if (error) throw error;

    // Do not replace an existing completion timestamp on a retried request.
    if (!data) {
      const { data: current, error: currentError } = await supabase
        .from("principals")
        .select(COMPLETION_COLUMN)
        .eq("id", principal.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current?.[COMPLETION_COLUMN as keyof typeof current]) {
        return NextResponse.json({ success: false, message: "Principal account not found." }, { status: 404 });
      }
    }

    return NextResponse.json(
      { success: true, completed: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: unknown) {
    console.error("PATCH /api/principal/reports-guide error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
