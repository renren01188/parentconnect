import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserSession } from "../../parent-adviser/_lib";

function validReportId(value: unknown) {
  const reportId = Number(value);
  return Number.isSafeInteger(reportId) && reportId > 0 ? reportId : null;
}

/** Favorites are personal. This verifies only that the signed-in Adviser owns
 * the report; it never changes report status, escalation, or read state. */
async function ensureAdviserCanAccessReport(reportId: number, adviserId: number) {
  const { data: report, error } = await supabase
    .from("parent_adviser_reports")
    .select("id")
    .eq("id", reportId)
    .eq("adviser_id", adviserId)
    .maybeSingle();
  if (error) throw error;
  if (!report) return { ok: false as const, status: 404, message: "Report not found." };

  return { ok: true as const };
}

export async function GET() {
  try {
    const adviser = await getAdviserSession();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("adviser_report_favorites")
      .select("report_id")
      .eq("adviser_id", adviser.id);
    if (error) throw error;

    const reportIds = (data ?? [])
      .map((favorite) => Number(favorite.report_id))
      .filter((reportId) => Number.isSafeInteger(reportId) && reportId > 0);
    return NextResponse.json({ success: true, reportIds });
  } catch (error) {
    console.error("GET /api/reports/adviser/favorites error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to load report favorites." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adviser = await getAdviserSession();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as { reportId?: unknown; favorite?: unknown } | null;
    const reportId = validReportId(body?.reportId);
    if (!reportId || typeof body?.favorite !== "boolean") {
      return NextResponse.json({ success: false, message: "A report and favorite state are required." }, { status: 400 });
    }

    const authorization = await ensureAdviserCanAccessReport(reportId, adviser.id);
    if (!authorization.ok) {
      return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
    }

    if (body.favorite) {
      const { error } = await supabase
        .from("adviser_report_favorites")
        .upsert(
          { adviser_id: adviser.id, report_id: reportId },
          { onConflict: "adviser_id,report_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("adviser_report_favorites")
        .delete()
        .eq("adviser_id", adviser.id)
        .eq("report_id", reportId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, reportId, favorite: body.favorite });
  } catch (error) {
    console.error("PATCH /api/reports/adviser/favorites error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to save report favorite." },
      { status: 500 },
    );
  }
}
