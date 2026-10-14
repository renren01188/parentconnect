import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { acceptedGuidanceRecipientForReport, publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";
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
type RealtimeReport = {
  id: number;
  parent_id: number | null;
  adviser_id: number | null;
  status?: string | null;
  escalated_to_guidance?: boolean | null;
  escalated_to_principal?: boolean | null;
};

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

    let report: RealtimeReport | null = null;

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
        .select("id, parent_id, adviser_id, status, escalated_to_guidance, escalated_to_principal")
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
        .select("id, parent_id, adviser_id, status, escalated_to_guidance, escalated_to_principal")
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

    // Keep typing presence aligned with the same report handoff rules as the
    // durable message route. This prevents an earlier participant from
    // leaving a misleading typing indicator after Guidance hands the report
    // to the Principal.
    if (role === "adviser" && report.escalated_to_guidance) {
      return NextResponse.json({ success: false, message: "This report is no longer assigned to the Adviser." }, { status: 403 });
    }
    if (role === "guidance" && report.escalated_to_principal) {
      return NextResponse.json({ success: false, message: "This report is now assigned to the Principal." }, { status: 403 });
    }

    const principalConversation = Boolean(report.escalated_to_principal);
    const guidanceConversation = !principalConversation && Boolean(report.escalated_to_guidance);
    const guidanceId = guidanceConversation
      ? await acceptedGuidanceRecipientForReport(reportId)
      : null;
    await publishReportRealtimeInvalidation({
      parentId: report.parent_id,
      adviserId: principalConversation || guidanceConversation ? null : report.adviser_id,
      includeAdviser: !principalConversation && !guidanceConversation,
      includeGuidance: guidanceConversation,
      guidanceId,
      includePrincipals: principalConversation,
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
