import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "../../../parent-adviser/_lib";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const { id } = await params;
    const ticketId = Number(id);
    const { status, rejectionReason } = await req.json();
    const nextStatus = String(status ?? "").toLowerCase();
    const reason = String(rejectionReason ?? "").trim();
    if (!Number.isSafeInteger(ticketId) || !["accepted", "rejected"].includes(nextStatus)) return NextResponse.json({ success: false, message: "Choose Accepted or Rejected." }, { status: 400 });
    if (nextStatus === "rejected" && !reason) return NextResponse.json({ success: false, message: "A rejection reason is required." }, { status: 400 });

    const { data: ticket, error: ticketError } = await supabase.from("parent_report_guidance_tickets").select("id, report_id, status").eq("id", ticketId).maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) return NextResponse.json({ success: false, message: "Ticket not found." }, { status: 404 });
    if (ticket.status !== "pending") return NextResponse.json({ success: false, message: "This ticket has already been decided." }, { status: 409 });
    const { data: report, error: reportLookupError } = await supabase
      .from("parent_adviser_reports")
      .select("id, status")
      .eq("id", ticket.report_id)
      .maybeSingle();
    if (reportLookupError) throw reportLookupError;
    if (!report || String(report.status ?? "").toLowerCase() === "resolved") {
      return NextResponse.json({ success: false, message: "Resolved or missing reports cannot be routed through a Guidance ticket." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const { data: decidedTicket, error: updateTicketError } = await supabase
      .from("parent_report_guidance_tickets")
      .update({ status: nextStatus, rejection_reason: nextStatus === "rejected" ? reason : null, assigned_guidance_id: nextStatus === "accepted" ? guidance.id : null, decided_at: now, updated_at: now })
      .eq("id", ticketId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (updateTicketError) throw updateTicketError;
    if (!decidedTicket) return NextResponse.json({ success: false, message: "This ticket has already been decided." }, { status: 409 });

    if (nextStatus === "accepted") {
      const { error: reportError } = await supabase
        .from("parent_adviser_reports")
        .update({ escalated_to_guidance: true, status_updated_at: now, updated_at: now, last_message_at: now })
        .eq("id", ticket.report_id)
        .neq("status", "resolved");
      if (reportError) throw reportError;
    } else {
      // Tickets are not published to the browser realtime publication. Nudge
      // the existing report subscription so Guidance removes this ticket from
      // its pending sidebar count as soon as it is rejected.
      const { error: reportRefreshError } = await supabase
        .from("parent_adviser_reports")
        .update({ updated_at: now })
        .eq("id", ticket.report_id);
      if (reportRefreshError) throw reportRefreshError;
    }
    await logAudit({ action: nextStatus === "accepted" ? "Ticket Accepted" : "Ticket Rejected", performedById: guidance.id, performedBy: guidance.name, performedByRole: "Guidance Counselor", targetUser: `Ticket #${ticketId}`, targetRole: "Guidance Ticket", targetType: "Guidance Ticket", targetId: ticketId, relatedTicketId: ticketId, relatedReportId: ticket.report_id, previousStatus: ticket.status, newStatus: nextStatus, module: "Guidance Tickets", details: nextStatus === "rejected" ? `Rejected ticket #${ticketId}: ${reason}` : `Accepted ticket #${ticketId} for report #${ticket.report_id}.` });
    return NextResponse.json({ success: true, ticketId, reportId: ticket.report_id, status: nextStatus });
  } catch (error) {
    console.error("PATCH /api/reports/guidance/tickets/[id] error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to update ticket." }, { status: 500 });
  }
}
