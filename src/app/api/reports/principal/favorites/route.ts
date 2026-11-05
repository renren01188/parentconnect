import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalSession, isPrincipalVisibleReport } from "../../parent-adviser/_lib";

function validReportId(value: unknown) {
  const reportId = Number(value);
  return Number.isSafeInteger(reportId) && reportId > 0 ? reportId : null;
}

/** Favorites are personal. Principal visibility rules remain authoritative,
 * including the parent-agreement boundary for student-concern reports. */
async function ensurePrincipalCanAccessReport(reportId: number) {
  const { data: report, error } = await supabase
    .from("parent_adviser_reports")
    .select("id, subject, allow_history_access")
    .eq("id", reportId)
    .maybeSingle();
  if (error) throw error;
  if (!report || !isPrincipalVisibleReport(report)) {
    return { ok: false as const, status: 404, message: "Report not found." };
  }

  return { ok: true as const };
}

export async function GET() {
  try {
    const principal = await getPrincipalSession();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("principal_report_favorites")
      .select("report_id")
      .eq("principal_id", principal.id);
    if (error) throw error;

    const reportIds = (data ?? [])
      .map((favorite) => Number(favorite.report_id))
      .filter((reportId) => Number.isSafeInteger(reportId) && reportId > 0);
    return NextResponse.json({ success: true, reportIds });
  } catch (error) {
    console.error("GET /api/reports/principal/favorites error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to load report favorites." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const principal = await getPrincipalSession();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as { reportId?: unknown; favorite?: unknown } | null;
    const reportId = validReportId(body?.reportId);
    if (!reportId || typeof body?.favorite !== "boolean") {
      return NextResponse.json({ success: false, message: "A report and favorite state are required." }, { status: 400 });
    }

    const authorization = await ensurePrincipalCanAccessReport(reportId);
    if (!authorization.ok) {
      return NextResponse.json({ success: false, message: authorization.message }, { status: authorization.status });
    }

    if (body.favorite) {
      const { error } = await supabase
        .from("principal_report_favorites")
        .upsert(
          { principal_id: principal.id, report_id: reportId },
          { onConflict: "principal_id,report_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("principal_report_favorites")
        .delete()
        .eq("principal_id", principal.id)
        .eq("report_id", reportId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, reportId, favorite: body.favorite });
  } catch (error) {
    console.error("PATCH /api/reports/principal/favorites error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to save report favorite." },
      { status: 500 },
    );
  }
}
