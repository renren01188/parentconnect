import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { getParentSession, getReportForParent } from "../../_lib";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parent = await getParentSession();
    if (!parent) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { id } = await params;
    const reportId = Number(id);
    if (!Number.isSafeInteger(reportId) || reportId <= 0) {
      return NextResponse.json({ success: false, message: "Invalid report." }, { status: 400 });
    }

    // Load only to resolve the authorized recipients for the post-cancellation
    // Realtime nudge. The database function below repeats ownership and source
    // checks under one transaction with the cooldown update.
    const report = await getReportForParent(reportId, parent.id);
    if (!report) return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });

    const { data, error } = await supabase.rpc("cancel_parent_report_with_cooldown", {
      p_report_id: reportId,
      p_parent_id: parent.id,
    });
    if (error) {
      const message = error.message || "Unable to cancel this report.";
      const status = /not found/i.test(message) ? 404 : /already|resolved|only reports/i.test(message) ? 409 : 500;
      return NextResponse.json({ success: false, message }, { status });
    }

    const cancellation = Array.isArray(data) ? data[0] : null;
    const cooldownUntil = typeof cancellation?.cooldown_until === "string"
      ? cancellation.cooldown_until
      : null;

    await logAudit({
      action: "Report Cancelled",
      performedById: parent.id,
      performedBy: parent.name,
      performedByRole: "Parent/Guardian",
      targetUser: `Report #${reportId}`,
      targetRole: "Report",
      targetType: "Parent Report",
      targetId: reportId,
      relatedReportId: reportId,
      relatedStudentId: report.student_id,
      previousStatus: report.status,
      newStatus: "cancelled",
      module: "Reports",
      details: `Parent cancelled report #${reportId}; report submission is available again after five minutes.`,
      metadata: { cooldownUntil },
    });

    await publishReportRealtimeInvalidation({
      parentId: parent.id,
      adviserId: report.adviser_id,
      includeGuidance: Boolean(report.escalated_to_guidance),
      reportId,
      kind: "status",
    });

    return NextResponse.json({ success: true, reportId, reportSubmissionCooldownUntil: cooldownUntil });
  } catch (error) {
    console.error("PATCH /api/reports/parent-adviser/[id]/cancel error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to cancel this report." }, { status: 500 });
  }
}
