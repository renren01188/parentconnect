import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  getGuidanceSession,
  listGuidanceTickets,
  listMessageSummaries,
  toGuidanceReportSummary,
  type ReportRow,
} from "../../reports/parent-adviser/_lib";

const REPORT_SUMMARY_SELECT = [
  "id", "parent_id", "parent_email", "parent_name", "adviser_id", "adviser_name",
  "student_id", "student_name", "grade", "section", "subject", "categories",
  "concern_level", "allow_history_access", "status", "escalated_to_guidance",
  "escalated_to_principal", "cancelled_at", "cancelled_by_parent_id", "guidance_seen_at",
  "parent_seen_at", "status_updated_at", "created_at", "updated_at", "last_message_at",
].join(", ");

function isMissingTableError(error: unknown) {
  const record = error as { code?: string; message?: string } | null;
  return Boolean(
    record && (
      record.code === "PGRST205" ||
      record.message?.toLowerCase().includes("could not find the table") ||
      record.message?.toLowerCase().includes("schema cache")
    )
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load dashboard notification counts.";
}

/**
 * One server-authorized snapshot for the Guidance report, ticket, and ICT
 * badges. The persisted notifications feed remains a dedicated endpoint so
 * its retention and read-acknowledgement rules stay unchanged.
 */
export async function GET(request: NextRequest) {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data: reportData, error: reportError } = await supabase
      .from("parent_adviser_reports")
      .select(REPORT_SUMMARY_SELECT)
      .eq("escalated_to_guidance", true)
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (reportError) throw reportError;

    const reportRows = (reportData ?? []) as unknown as ReportRow[];
    const reportIds = reportRows.map((report) => report.id);
    const seenAfter = Date.parse(request.nextUrl.searchParams.get("ictSeenAfter") ?? "");

    let unreadStaffQuery = supabase
      .from("staff_messages")
      .select("id, source_message_id, sender_type")
      .eq("recipient_type", "guidance")
      .eq("recipient_id", guidance.id)
      .eq("status", "unread");
    if (Number.isFinite(seenAfter)) {
      unreadStaffQuery = unreadStaffQuery.gt("created_at", new Date(seenAfter).toISOString());
    }

    const [messageMap, ticketMap, ticketReadsResult, unreadStaffResult] = await Promise.all([
      listMessageSummaries(reportIds),
      listGuidanceTickets(reportIds, false),
      supabase
        .from("guidance_ticket_reads")
        .select("ticket_id")
        .eq("guidance_id", guidance.id),
      unreadStaffQuery,
    ]);
    if (ticketReadsResult.error) throw ticketReadsResult.error;
    if (unreadStaffResult.error && !isMissingTableError(unreadStaffResult.error)) throw unreadStaffResult.error;

    const tickets = [...ticketMap.values()];
    const readTicketIds = new Set((ticketReadsResult.data ?? [])
      .map((read) => Number(read.ticket_id))
      .filter((ticketId) => Number.isSafeInteger(ticketId) && ticketId > 0));
    const pendingTicketCount = tickets.filter((ticket) => ticket.status === "pending").length;
    const unreadAcceptedTicketReportIds = new Set(tickets
      .filter((ticket) => ticket.status === "accepted" && Number(ticket.assigned_guidance_id) === Number(guidance.id) && !readTicketIds.has(Number(ticket.id)))
      .map((ticket) => Number(ticket.report_id))
      .filter((reportId) => Number.isSafeInteger(reportId) && reportId > 0));

    const reports = reportRows.map((report) => toGuidanceReportSummary(
      report,
      messageMap.get(report.id) ?? [],
      ticketMap.get(report.id),
    ));
    const reportCount = reports.filter((report) => Boolean(
      report.hasUnreadForGuidance ||
      (report.status === "Escalated" && !report.guidanceSeen) ||
      (report.ticketStatus === "accepted" && unreadAcceptedTicketReportIds.has(Number(report.id))),
    )).length;
    const activeGuidanceConcernCount = reportRows.filter((report) =>
      report.escalated_to_guidance === true &&
      report.escalated_to_principal !== true &&
      !["resolved", "cancelled"].includes(String(report.status ?? "").toLowerCase()),
    ).length;

    const directStaffConversations = new Set<number>();
    const ictConversations = new Set<number>();
    for (const message of unreadStaffResult.data ?? []) {
      const conversationId = Number(message.source_message_id) || Number(message.id);
      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) continue;
      if (String(message.sender_type) === "ict") ictConversations.add(conversationId);
      else directStaffConversations.add(conversationId);
    }

    return NextResponse.json({
      success: true,
      reportsUnreadCount: reportCount + directStaffConversations.size + pendingTicketCount,
      escalatedCount: activeGuidanceConcernCount + pendingTicketCount,
      ictUnreadCount: ictConversations.size,
    });
  } catch (error) {
    console.error("GET /api/guidance/dashboard-summary error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
