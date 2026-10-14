import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getParentSession, getReportForParent } from "../../_lib";
import { logAudit } from "@/lib/audit";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parent = await getParentSession();
    if (!parent) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { id } = await params;
    const reportId = Number(id);
    if (!reportId) {
      return NextResponse.json({ success: false, message: "Invalid report." }, { status: 400 });
    }

    const report = await getReportForParent(reportId, parent.id);
    if (!report) {
      return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    }

    const now = new Date().toISOString();

    const { error: messageError } = await supabase
      .from("parent_adviser_report_messages")
      .update({ read_by_parent: true })
      .eq("report_id", reportId)
      .in("sender_role", ["adviser", "principal", "guidance", "subject_teacher"]);

    if (messageError) throw messageError;

    const { error: reportError } = await supabase
      .from("parent_adviser_reports")
      .update({ parent_seen_at: now })
      .eq("id", reportId);

    if (reportError) throw reportError;

    // The Parent layout owns the sidebar count even when Reports is not the
    // active page. Broadcast only this authenticated Parent's durable read
    // change so every open Parent view clears the same report badge in place.
    await publishRealtimeInvalidation([{ role: "parent", id: parent.id }], "reports");

    await logAudit({ action: "Report Viewed", performedById: parent.id, performedBy: parent.name, performedByRole: "Parent/Guardian", targetUser: `Report #${reportId}`, targetRole: "Report", targetType: "Parent Report", targetId: reportId, relatedReportId: reportId, module: "Reports", details: `Opened report #${reportId}.` });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/parent-adviser/[id]/read error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
