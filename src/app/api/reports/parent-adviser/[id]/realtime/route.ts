import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
  getAdviserSession,
  getGuidanceSession,
  getParentSession,
  getPrincipalSession,
  getReportForAdviser,
  getReportForParent,
} from "../../_lib";

const ACTOR_KEY = /^[a-zA-Z0-9-]{16,128}$/;

type ReportRealtimeRole = "parent" | "adviser" | "guidance" | "principal";

/**
 * Authorization gate for ephemeral report presence. Browser clients can only
 * publish through this route; it verifies the current session before sending
 * an opaque, data-free Broadcast to the report's authorized accounts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const reportId = Number(id);
    const body = await request.json().catch(() => null);
    const role: ReportRealtimeRole | null = ["parent", "adviser", "guidance", "principal"].includes(body?.role)
      ? body.role
      : null;
    const active = body?.active;
    const actorKey = typeof body?.actorKey === "string" ? body.actorKey : "";

    if (!Number.isSafeInteger(reportId) || reportId <= 0 || !role || typeof active !== "boolean" || !ACTOR_KEY.test(actorKey)) {
      return NextResponse.json({ success: false, message: "Invalid Realtime event." }, { status: 400 });
    }

    let report: { id: number; parent_id: number | null; adviser_id: number | null; status?: string | null; escalated_to_guidance?: boolean | null } | null = null;

    if (role === "parent") {
      const parent = await getParentSession();
      if (!parent) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      report = await getReportForParent(reportId, parent.id);
    } else if (role === "adviser") {
      const adviser = await getAdviserSession();
      if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      report = await getReportForAdviser(reportId, adviser.id);
    } else if (role === "guidance") {
      const guidance = await getGuidanceSession();
      if (!guidance) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      const { data, error } = await supabase
        .from("parent_adviser_reports")
        .select("id, parent_id, adviser_id, status, escalated_to_guidance")
        .eq("id", reportId)
        .eq("escalated_to_guidance", true)
        .maybeSingle();
      if (error) throw error;
      report = data;
    } else {
      const principal = await getPrincipalSession();
      if (!principal) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      const { data, error } = await supabase
        .from("parent_adviser_reports")
        .select("id, parent_id, adviser_id, status, escalated_to_guidance")
        .eq("id", reportId)
        .eq("escalated_to_principal", true)
        .maybeSingle();
      if (error) throw error;
      report = data;
    }

    if (!report) return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    if (String(report.status ?? "").toLowerCase() === "cancelled") {
      return NextResponse.json({ success: false, message: "This report has been cancelled by the Parent." }, { status: 409 });
    }

    await publishReportRealtimeInvalidation({
      parentId: report.parent_id,
      adviserId: report.adviser_id,
      includeGuidance: Boolean(report.escalated_to_guidance),
      reportId,
      kind: "typing",
      actorKey,
      active,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/reports/parent-adviser/[id]/realtime error:", error);
    return NextResponse.json({ success: false, message: "Unable to send typing state." }, { status: 500 });
  }
}
