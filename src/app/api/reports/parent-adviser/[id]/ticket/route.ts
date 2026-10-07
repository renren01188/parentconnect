import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendNewGuidanceTicketEmail } from "@/lib/mailer";
import { getParentSession, getReportForParent } from "../../_lib";
import { logAudit } from "@/lib/audit";

type Attachment = { name: string; type: string; size: number; dataUrl: string };

function cleanAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const dataUrl = typeof value.dataUrl === "string" ? value.dataUrl : "";
    const size = typeof value.size === "number" ? value.size : 0;
    if (!name || !dataUrl || size > 10 * 1024 * 1024) return [];
    return [{ name, dataUrl, size, type: typeof value.type === "string" ? value.type : "application/octet-stream" }];
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const parent = await getParentSession();
    if (!parent) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { id } = await params;
    const reportId = Number(id);
    const { concern, message, attachments } = await req.json();
    const cleanConcern = String(concern ?? "").trim();
    const cleanMessage = String(message ?? "").trim();
    const cleanFiles = cleanAttachments(attachments);
    if (!Number.isSafeInteger(reportId) || reportId <= 0 || !cleanConcern || (!cleanMessage && cleanFiles.length === 0)) {
      return NextResponse.json({ success: false, message: "Concern and a message or attachment are required." }, { status: 400 });
    }

    const report = await getReportForParent(reportId, parent.id);
    if (!report) return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    if (report.status === "resolved") return NextResponse.json({ success: false, message: "Resolved reports cannot be submitted to Guidance." }, { status: 403 });

    const { data: existing, error: existingError } = await supabase
      .from("parent_report_guidance_tickets")
      .select("id, status")
      .eq("report_id", reportId)
      .maybeSingle();
    if (existingError) throw existingError;

    const now = new Date().toISOString();
    // A ticket is permanent for its report. Rejected tickets retain their
    // reason and history; all repeat submits simply return that same ticket.
    if (existing) {
      return NextResponse.json({ success: true, duplicate: true, ticketId: existing.id, status: existing.status });
    }

    const { data, error } = await supabase
      .from("parent_report_guidance_tickets")
      .insert({ report_id: reportId, parent_id: report.parent_id ?? parent.id, student_id: report.student_id, adviser_id: report.adviser_id, concern: cleanConcern, message: cleanMessage, attachments: cleanFiles, status: "pending", created_at: now, updated_at: now })
      .select("id, status")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: ticket } = await supabase.from("parent_report_guidance_tickets").select("id, status").eq("report_id", reportId).maybeSingle();
        return NextResponse.json({ success: true, duplicate: true, ticketId: ticket?.id, status: ticket?.status });
      }
      throw error;
    }

    // Tickets are intentionally server-only (RLS denies browser access), but
    // Guidance already receives report-table realtime events. Touching the
    // parent-owned report prompts that existing subscription to refresh its
    // server-derived ticket notification and sidebar counts immediately.
    const { error: reportRefreshError } = await supabase
      .from("parent_adviser_reports")
      .update({ updated_at: now })
      .eq("id", reportId)
      .eq("parent_id", parent.id);
    if (reportRefreshError) {
      // The ticket, notification polling fallback, and email are all still
      // valid if the optional realtime nudge is unavailable.
      console.error("Unable to trigger Guidance ticket realtime refresh:", reportRefreshError);
    }

    // A counselor is assigned only when the ticket is accepted, so a new
    // pending ticket is sent to every active Guidance counselor. Delivery is
    // non-blocking: SMTP failure never rolls back a created ticket.
    const { data: counselors, error: counselorsError } = await supabase
      .from("guidance_counselors")
      .select("email, first_name, middle_name, last_name, suffix")
      .eq("status", "active")
      .not("email", "is", null);
    if (counselorsError) {
      console.error("Unable to load Guidance ticket email recipients:", counselorsError);
    } else if (counselors?.length) {
      const emailResults = await Promise.allSettled(counselors.map((counselor) =>
        sendNewGuidanceTicketEmail({
          guidanceEmail: counselor.email,
          guidanceName: [counselor.first_name, counselor.middle_name, counselor.last_name, counselor.suffix].filter(Boolean).join(" "),
          parentName: report.parent_name || parent.name || "Parent",
          studentName: report.student_name || report.student_id || "Student",
          subject: report.subject || "Parent report",
          concern: cleanConcern,
          message: cleanMessage,
          hasAttachments: cleanFiles.length > 0,
        }),
      ));
      emailResults.forEach((result) => {
        if (result.status === "rejected") console.error("Unable to send new Guidance ticket email:", result.reason);
      });
    }
    await logAudit({ action: "Ticket Submitted", performedById: parent.id, performedBy: parent.name, performedByRole: "Parent/Guardian", targetUser: `Ticket #${data.id}`, targetRole: "Guidance Ticket", targetType: "Guidance Ticket", targetId: data.id, relatedTicketId: data.id, relatedReportId: reportId, relatedStudentId: report.student_id, newStatus: data.status, module: "Guidance Tickets", details: `Submitted Guidance ticket #${data.id} for report #${reportId}.`, metadata: { attachmentCount: cleanFiles.length } });
    return NextResponse.json({ success: true, ticketId: data.id, status: data.status }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reports/parent-adviser/[id]/ticket error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to submit ticket." }, { status: 500 });
  }
}
