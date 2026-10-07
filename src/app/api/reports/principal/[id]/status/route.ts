import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalSession, listGuidanceTickets, listMessages, toPrincipalReport } from "../../../parent-adviser/_lib";
import { logAudit } from "@/lib/audit";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await getPrincipalSession();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { id } = await params;
    const reportId = Number(id);
    const { status } = await req.json();
    const requested = String(status ?? "").toLowerCase();
    if (!Number.isSafeInteger(reportId) || !["read", "ongoing", "resolved"].includes(requested)) {
      return NextResponse.json({ success: false, message: "Invalid report status." }, { status: 400 });
    }
    const normalized = requested as "read" | "ongoing" | "resolved";
    const now = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from("parent_adviser_reports")
      .select("*")
      .eq("id", reportId)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    }
    if (normalized === "resolved" && String(existing.status ?? "").toLowerCase() === "resolved") {
      return NextResponse.json({ success: false, message: "This report has already been resolved." }, { status: 409 });
    }
    if (normalized !== "read" && !existing.escalated_to_principal) {
      return NextResponse.json({ success: false, message: "Guidance must escalate this report to the Principal before it can be changed." }, { status: 403 });
    }

    // A monitoring read is Principal-specific. Never overwrite the shared
    // Adviser/Guidance workflow status when the Principal opens a report.
    // principal_notification_reads below is the durable read receipt.
    if (normalized !== "read") {
      const { error: updateError } = await supabase
        .from("parent_adviser_reports")
        .update({
          status: normalized,
          updated_at: now,
          status_updated_at: now,
        })
        .eq("id", reportId);

      if (updateError) throw updateError;
    }

    const tickets = await listGuidanceTickets([reportId]);
    const ticket = tickets.get(reportId);
    const readKeys = [
      `principal-report-read-${reportId}`,
      `parent-report-submitted-${reportId}`,
      ...(existing.escalated_to_principal ? [`guidance-escalated-${reportId}`] : []),
      ...(ticket?.status === "accepted" ? [`guidance-ticket-accepted-${ticket.id}`] : []),
    ];

    const { error: readError } = await supabase
      .from("principal_notification_reads")
      .upsert(
        readKeys.map((notif_key) => ({ principal_id: principal.id, notif_key })),
        { onConflict: "principal_id,notif_key" },
      );
    if (readError) throw readError;

    const { data: report, error: reportError } = await supabase
      .from("parent_adviser_reports")
      .select("*")
      .eq("id", reportId)
      .limit(1)
      .maybeSingle();

    if (reportError) throw reportError;
    if (!report) {
      return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    }
    const refreshedMessages = await listMessages([reportId]);
    await logAudit({ action: normalized === "resolved" ? "Report Resolved" : normalized === "read" ? "Report Viewed" : "Report Status Updated", performedById: principal.id, performedBy: principal.name, performedByRole: "Principal", targetUser: `Report #${reportId}`, targetRole: "Report", targetType: "Parent Report", targetId: reportId, relatedReportId: reportId, previousStatus: existing.status, newStatus: normalized === "read" ? existing.status : normalized, module: "Reports", details: normalized === "read" ? `Opened report #${reportId}.` : `Changed report #${reportId} from ${existing.status} to ${normalized}.` });

    return NextResponse.json({
      success: true,
      report: toPrincipalReport(report, refreshedMessages.get(reportId) ?? [], ticket, true),
    });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/principal/[id]/status error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
