import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalSession, listMessages, toPrincipalReport } from "../../../parent-adviser/_lib";

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
    const normalized = requested === "resolved" ? "resolved" : requested === "read" ? undefined : "ongoing";
    const now = new Date().toISOString();

    const { data: existing, error: existingError } = await supabase
      .from("parent_adviser_reports")
      .select("*")
      .eq("id", reportId)
      .eq("escalated_to_principal", true)
      .limit(1)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ success: false, message: "Principal-escalated report not found." }, { status: 404 });
    }

    if (normalized) {
      const { error: updateError } = await supabase
        .from("parent_adviser_reports")
        .update({
          status: normalized,
          updated_at: now,
          status_updated_at: now,
          last_message_at: now,
        })
        .eq("id", reportId)
        .eq("escalated_to_principal", true);

      if (updateError) throw updateError;
    }

    const messages = await listMessages([reportId]);
    const principalUnreadParentIds = (messages.get(reportId) ?? [])
      .filter((msg) => msg.sender_role === "parent" && msg.thread_type === "principal" && !msg.read_by_adviser)
      .map((msg) => msg.id);

    if (principalUnreadParentIds.length > 0) {
      const { error: readError } = await supabase
        .from("parent_adviser_report_messages")
        .update({ read_by_adviser: true })
        .in("id", principalUnreadParentIds);
      if (readError) throw readError;
    }

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

    return NextResponse.json({
      success: true,
      report: toPrincipalReport(report, refreshedMessages.get(reportId) ?? []),
    });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/principal/[id]/status error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
