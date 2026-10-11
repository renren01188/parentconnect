import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getAdviserSession,
  getReportForAdviser,
  listMessages,
  statusFromAdviser,
  toAdviserReport,
} from "../../_lib";
import { logAudit } from "@/lib/audit";
import { publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adviser = await getAdviserSession();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { id } = await params;
    const reportId = Number(id);
    const { status } = await req.json();

    const report = await getReportForAdviser(reportId, adviser.id);
    if (!report) {
      return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    }

    const normalized = statusFromAdviser(status);
    if (normalized === "resolved" && String(report.status ?? "").toLowerCase() === "resolved") {
      return NextResponse.json({ success: false, message: "This report has already been resolved." }, { status: 409 });
    }
    if (normalized === "resolved" && report.escalated_to_guidance) {
      return NextResponse.json({ success: false, message: "Guidance owns this escalated report and must resolve it." }, { status: 403 });
    }
    const now = new Date().toISOString();
    const updatePayload: Record<string, string | boolean> = {
      status: normalized,
      escalated_to_guidance: normalized === "escalated" ? true : report.escalated_to_guidance,
      status_updated_at: now,
      updated_at: now,
    };
    let { error } = await supabase
      .from("parent_adviser_reports")
      .update(updatePayload)
      .eq("id", reportId)
      .eq("adviser_id", adviser.id);

    if (error && error.message.includes("status_updated_at")) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.status_updated_at;
      const fallback = await supabase
        .from("parent_adviser_reports")
        .update(fallbackPayload)
        .eq("id", reportId)
        .eq("adviser_id", adviser.id);
      error = fallback.error;
    }

    if (error) throw error;

    const { error: readError } = await supabase
      .from("parent_adviser_report_messages")
      .update({ read_by_adviser: true })
      .eq("report_id", reportId)
      .in("sender_role", ["parent", "subject_teacher"]);

    if (readError) throw readError;

    await logAudit({ action: normalized === "resolved" ? "Report Resolved" : normalized === "escalated" ? "Escalated to Guidance" : "Report Status Updated", performedById: adviser.id, performedBy: [adviser.first_name, adviser.last_name].filter(Boolean).join(" ") || "Adviser", performedByRole: "Adviser", targetUser: `Report #${reportId}`, targetRole: "Report", targetType: "Parent Report", targetId: reportId, relatedReportId: reportId, relatedStudentId: report.student_id, previousStatus: report.status, newStatus: normalized, module: "Reports", details: normalized === "escalated" ? `Escalated report #${reportId} from Adviser to Guidance.` : `Changed report #${reportId} from ${report.status} to ${normalized}.` });

    await publishReportRealtimeInvalidation({
      parentId: report.parent_id,
      adviserId: adviser.id,
      includeGuidance: normalized === "escalated" || Boolean(report.escalated_to_guidance),
    });

    const updatedReport = await getReportForAdviser(reportId, adviser.id);
    const messages = await listMessages([reportId]);

    return NextResponse.json({
      success: true,
      report: toAdviserReport(updatedReport ?? {
        ...report,
        status: normalized,
        escalated_to_guidance: normalized === "escalated" ? true : report.escalated_to_guidance,
        status_updated_at: now,
        updated_at: now,
      }, messages.get(reportId) ?? []),
    });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/parent-adviser/[id]/status error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
