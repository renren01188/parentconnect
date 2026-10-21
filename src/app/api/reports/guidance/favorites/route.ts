import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "../../parent-adviser/_lib";

function validReportId(value: unknown) {
  const reportId = Number(value);
  return Number.isSafeInteger(reportId) && reportId > 0 ? reportId : null;
}

/**
 * Favorites are personal, while escalated reports are visible to every active
 * Guidance account. This check therefore validates only role-wide report
 * access; it never turns a personal favorite into shared report state.
 */
async function ensureGuidanceCanAccessReport(reportId: number) {
  const { data: report, error } = await supabase
    .from("parent_adviser_reports")
    .select("id")
    .eq("id", reportId)
    .eq("escalated_to_guidance", true)
    .maybeSingle();
  if (error) throw error;
  if (!report) return { ok: false as const, status: 404, message: "Escalated report not found." };

  return { ok: true as const };
}

export async function GET() {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("guidance_report_favorites")
      .select("report_id")
      .eq("guidance_id", guidance.id);
    if (error) throw error;

    const reportIds = (data ?? [])
      .map((favorite) => Number(favorite.report_id))
      .filter((reportId) => Number.isSafeInteger(reportId) && reportId > 0);
    return NextResponse.json({ success: true, reportIds });
  } catch (error) {
    console.error("GET /api/reports/guidance/favorites error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to load report favorites." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as { reportId?: unknown; favorite?: unknown } | null;
    const reportId = validReportId(body?.reportId);
    if (!reportId || typeof body?.favorite !== "boolean") {
      return NextResponse.json({ success: false, message: "A report and favorite state are required." }, { status: 400 });
    }

    const authorization = await ensureGuidanceCanAccessReport(reportId);
    if (!authorization.ok) {
      return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
    }

    if (body.favorite) {
      const { error } = await supabase
        .from("guidance_report_favorites")
        .upsert(
          { guidance_id: guidance.id, report_id: reportId },
          { onConflict: "guidance_id,report_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("guidance_report_favorites")
        .delete()
        .eq("guidance_id", guidance.id)
        .eq("report_id", reportId);
      if (error) throw error;
    }

    // This is intentionally not a report status/read update and does not send
    // a report invalidation: it changes only this counselor's saved ordering.
    return NextResponse.json({ success: true, reportId, favorite: body.favorite });
  } catch (error) {
    console.error("PATCH /api/reports/guidance/favorites error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to save report favorite." },
      { status: 500 },
    );
  }
}
