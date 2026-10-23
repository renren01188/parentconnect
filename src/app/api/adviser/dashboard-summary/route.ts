import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import {
  listGuidanceTickets,
  listMessageSummaries,
  toAdviserReportSummary,
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
 * One server-authorized snapshot for the Adviser's non-feed sidebar badges.
 * The notifications feed deliberately remains separate: its retention and
 * per-notification read state must stay identical to its full list endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data: reportData, error: reportError } = await supabase
      .from("parent_adviser_reports")
      .select(REPORT_SUMMARY_SELECT)
      .eq("adviser_id", adviser.id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (reportError) throw reportError;

    const reportRows = (reportData ?? []) as unknown as ReportRow[];
    const reportIds = reportRows.map((report) => report.id);
    const seenAfter = Date.parse(request.nextUrl.searchParams.get("ictSeenAfter") ?? "");
    const adviserSections = [...new Set(
      (adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [])
        .map((section) => section.trim())
        .filter(Boolean),
    )];

    let unreadStaffQuery = supabase
      .from("staff_messages")
      .select("id, source_message_id, sender_type")
      .eq("recipient_type", "adviser")
      .eq("recipient_id", adviser.id)
      .eq("status", "unread");
    if (Number.isFinite(seenAfter)) {
      unreadStaffQuery = unreadStaffQuery.gt("created_at", new Date(seenAfter).toISOString());
    }

    const [messageMap, ticketMap, studentReportsResult, principalMessagesResult, unreadStaffResult, transfersResult] = await Promise.all([
      listMessageSummaries(reportIds),
      listGuidanceTickets(reportIds, false),
      supabase
        .from("student_reports")
        .select("id")
        .eq("adviser_id", adviser.id)
        .eq("status", "New"),
      supabase
        .from("principal_staff_messages")
        .select("id, status, source_adviser_message_id")
        .eq("recipient_type", "adviser")
        .or(adviser.email?.trim()
          ? `recipient_id.eq.${adviser.id},recipient_email.eq.${adviser.email.trim()}`
          : `recipient_id.eq.${adviser.id}`),
      unreadStaffQuery,
      adviser.grade && adviserSections.length > 0
        ? supabase
          .from("students")
          .select("id")
          .eq("transfer_status", "standby")
          .eq("target_grade", adviser.grade)
          .in("target_section", adviserSections)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const queryError = [studentReportsResult, principalMessagesResult, transfersResult]
      .find((result) => result.error)?.error;
    if (queryError) throw queryError;
    if (unreadStaffResult.error && !isMissingTableError(unreadStaffResult.error)) throw unreadStaffResult.error;

    const actionableParentReports = reportRows
      .map((report) => toAdviserReportSummary(report, messageMap.get(report.id) ?? [], ticketMap.get(report.id)))
      .filter((report) => {
        const status = String(report.status ?? "").trim().toLowerCase();
        const isStillAssignedToAdviser =
          status !== "resolved" &&
          status !== "escalated" &&
          !report.escalatedToGuidance &&
          !report.escalatedToPrincipal;
        return Boolean(report.hasUnreadForAdviser) && isStillAssignedToAdviser;
      }).length;

    const actionableStudentReports = studentReportsResult.data?.length ?? 0;
    const actionablePrincipalMessages = (principalMessagesResult.data ?? []).filter((message) =>
      !Number(message.source_adviser_message_id) &&
      message.status !== "read" &&
      message.status !== "replied",
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
      reportsUnreadCount: actionableParentReports + actionableStudentReports + actionablePrincipalMessages + directStaffConversations.size,
      ictUnreadCount: ictConversations.size,
      transferUnreadCount: transfersResult.data?.length ?? 0,
    });
  } catch (error) {
    console.error("GET /api/adviser/dashboard-summary error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
