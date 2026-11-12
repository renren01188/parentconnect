import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";
import { logAudit } from "@/lib/audit";
import { publishAttendanceRealtimeInvalidation, publishRealtimeInvalidation, type RealtimeRecipient } from "@/lib/realtimeInvalidation";

type DecisionResult = {
  request_id: number;
  request_status: "Approved" | "Rejected";
  student_db_id: number;
  student_id: string;
  attendance_date: string;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { id } = await params;
    const requestId = Number(id);
    const body = await request.json().catch(() => null);
    const status = body?.status;
    const rejectionReason = typeof body?.rejectionReason === "string" ? body.rejectionReason.trim() : "";
    if (!Number.isSafeInteger(requestId) || requestId <= 0 || !["Approved", "Rejected"].includes(status)) {
      return NextResponse.json({ success: false, message: "Invalid Early Out decision." }, { status: 400 });
    }
    if (status === "Rejected" && !rejectionReason) {
      return NextResponse.json({ success: false, message: "A rejection reason is required." }, { status: 400 });
    }

    const { data: requestRow, error: requestError } = await supabase
      .from("early_out_requests")
      .select("id, student_name, adviser_name, reason, message")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) return NextResponse.json({ success: false, message: "Early Out request not found." }, { status: 404 });

    const { data, error: decisionError } = await supabase.rpc("decide_early_out_request", {
      p_request_id: requestId,
      p_guidance_id: guidance.id,
      p_status: status,
      p_rejection_reason: status === "Rejected" ? rejectionReason : null,
    });
    if (decisionError) {
      const message = decisionError.message || "Unable to review the Early Out request.";
      const statusCode = /already been reviewed/i.test(message) ? 409 : /not found/i.test(message) ? 404 : 500;
      return NextResponse.json({ success: false, message }, { status: statusCode });
    }
    const decision = (data?.[0] ?? null) as DecisionResult | null;
    if (!decision) return NextResponse.json({ success: false, message: "Unable to review the Early Out request." }, { status: 500 });

    // The database function owns the decision timestamp. Read that committed
    // value back rather than deriving it in the browser or from a realtime
    // delivery time, which may occur later.
    const { data: decidedRequest, error: decidedRequestError } = await supabase
      .from("early_out_requests")
      .select("reviewed_at")
      .eq("id", requestId)
      .maybeSingle();
    if (decidedRequestError) throw decidedRequestError;

    const { data: notificationRows, error: notificationError } = await supabase
      .from("early_out_notifications")
      .select("recipient_role, recipient_id")
      .eq("early_out_request_id", requestId);
    if (notificationError) throw notificationError;
    const recipients: RealtimeRecipient[] = [];
    for (const row of notificationRows ?? []) {
      const id = Number(row.recipient_id);
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      if (row.recipient_role === "Parent") recipients.push({ role: "parent", id });
      if (row.recipient_role === "Adviser") recipients.push({ role: "adviser", id });
    }

    try {
      await logAudit({
        action: `Early Out ${decision.request_status}`,
        performedById: guidance.id,
        performedBy: guidance.name,
        performedByRole: "Guidance Counselor",
        targetUser: requestRow.student_name,
        targetRole: "Student",
        targetType: "Early Out Request",
        targetId: requestId,
        relatedStudentId: decision.student_id,
        newStatus: decision.request_status,
        module: "Attendance",
        details: `${decision.request_status} Early Out request #${requestId} for ${requestRow.student_name} on ${decision.attendance_date}.${decision.request_status === "Rejected" ? ` Reason: ${rejectionReason}` : ""}`,
      });
    } catch (auditError) {
      console.error("Unable to audit Early Out decision:", auditError);
    }

    // The database decision is committed before either data-free refresh is
    // published. Failed Broadcast delivery can never duplicate a decision.
    void publishAttendanceRealtimeInvalidation({ studentDbId: decision.student_db_id });
    void publishRealtimeInvalidation(recipients, "notifications");

    return NextResponse.json({
      success: true,
      status: decision.request_status,
      attendanceDate: decision.attendance_date,
      reviewedAt: decidedRequest?.reviewed_at ?? null,
    });
  } catch (error) {
    console.error("PATCH /api/guidance/early-out-requests/[id] error:", error);
    return NextResponse.json({ success: false, message: "Unable to review the Early Out request." }, { status: 500 });
  }
}
