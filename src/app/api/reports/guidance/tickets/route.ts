import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession, withCurrentStudentNames } from "../../parent-adviser/_lib";

export async function GET() {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const [ticketsResult, readsResult] = await Promise.all([
      supabase
        .from("parent_report_guidance_tickets")
        .select("id, report_id, parent_id, student_id, adviser_id, concern, message, attachments, status, rejection_reason, assigned_guidance_id, created_at, decided_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("guidance_ticket_reads")
        .select("ticket_id")
        .eq("guidance_id", guidance.id),
    ]);
    const { data: tickets, error } = ticketsResult;
    if (error) throw error;
    if (readsResult.error) throw readsResult.error;
    const readTicketIds = new Set(
      (readsResult.data ?? [])
        .map((read) => Number(read.ticket_id))
        .filter((ticketId) => Number.isSafeInteger(ticketId) && ticketId > 0),
    );
    const reportIds = (tickets ?? []).map((ticket) => ticket.report_id);
    const { data: reports, error: reportsError } = reportIds.length
      ? await supabase.from("parent_adviser_reports").select("id, parent_id, parent_name, student_id, student_name, adviser_id, adviser_name, subject").in("id", reportIds)
      : { data: [], error: null };
    if (reportsError) throw reportsError;
    const currentStudentReports = await withCurrentStudentNames(reports ?? []);
    const reportById = new Map(currentStudentReports.map((report) => [report.id, report]));
    return NextResponse.json({
      success: true,
      tickets: (tickets ?? []).map((ticket) => ({
        ...ticket,
        isAssignedToCurrentGuidance: Number(ticket.assigned_guidance_id) === Number(guidance.id),
        isReadByCurrentGuidance: Number(ticket.assigned_guidance_id) === Number(guidance.id)
          && readTicketIds.has(Number(ticket.id)),
        report: reportById.get(ticket.report_id) ?? null,
      })),
    });
  } catch (error) {
    console.error("GET /api/reports/guidance/tickets error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to load tickets." }, { status: 500 });
  }
}
