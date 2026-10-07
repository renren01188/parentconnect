import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "../../parent-adviser/_lib";

export async function GET() {
  try {
    if (!await getGuidanceSession()) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const { data: tickets, error } = await supabase
      .from("parent_report_guidance_tickets")
      .select("id, report_id, parent_id, student_id, adviser_id, concern, message, attachments, status, rejection_reason, created_at, decided_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const reportIds = (tickets ?? []).map((ticket) => ticket.report_id);
    const { data: reports, error: reportsError } = reportIds.length
      ? await supabase.from("parent_adviser_reports").select("id, parent_id, parent_name, student_id, student_name, adviser_id, adviser_name, subject").in("id", reportIds)
      : { data: [], error: null };
    if (reportsError) throw reportsError;
    const reportById = new Map((reports ?? []).map((report) => [report.id, report]));
    return NextResponse.json({ success: true, tickets: (tickets ?? []).map((ticket) => ({ ...ticket, report: reportById.get(ticket.report_id) ?? null })) });
  } catch (error) {
    console.error("GET /api/reports/guidance/tickets error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to load tickets." }, { status: 500 });
  }
}
