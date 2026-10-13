import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "../../../parent-adviser/_lib";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

/**
 * Viewing the Guidance Reports screen acknowledges only accepted tickets that
 * belong to the current counselor. This is a receipt, not a ticket decision:
 * acceptance/escalation fields are never changed here.
 */
export async function PATCH() {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { data: tickets, error: ticketsError } = await supabase
      .from("parent_report_guidance_tickets")
      .select("id")
      .eq("status", "accepted")
      .eq("assigned_guidance_id", guidance.id);
    if (ticketsError) throw ticketsError;

    const ticketIds = (tickets ?? [])
      .map((ticket) => Number(ticket.id))
      .filter((ticketId) => Number.isSafeInteger(ticketId) && ticketId > 0);
    if (ticketIds.length === 0) return NextResponse.json({ success: true, ticketIds: [] });

    const { error: readError } = await supabase
      .from("guidance_ticket_reads")
      .upsert(
        ticketIds.map((ticketId) => ({ guidance_id: guidance.id, ticket_id: ticketId })),
        { onConflict: "guidance_id,ticket_id" },
      );
    if (readError) throw readError;

    await publishRealtimeInvalidation([{ role: "guidance", id: guidance.id }], "reports");
    return NextResponse.json({ success: true, ticketIds });
  } catch (error) {
    console.error("PATCH /api/reports/guidance/tickets/read error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to mark Guidance tickets as viewed." }, { status: 500 });
  }
}
