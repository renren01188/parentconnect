import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { toDbStatus } from "../../_lib";
import { logAudit } from "@/lib/audit";
import { publishStudentReportsRealtimeInvalidation } from "@/lib/realtimeInvalidation";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { id } = await params;
    const { status } = await req.json();
    const reportId = Number(id);

    const { data: existing, error: lookupError } = await supabase.from("student_reports").select("id, student_id, student_name, status, notified_parent").eq("id", reportId).eq("adviser_id", adviser.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    const nextStatus = toDbStatus(status);
    if (existing.notified_parent && nextStatus === "resolved") {
      return NextResponse.json(
        { success: false, message: "This student report cannot be resolved after the parent has been notified." },
        { status: 409 },
      );
    }
    const { error } = await supabase
      .from("student_reports")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("adviser_id", adviser.id);

    if (error) throw error;
    await logAudit({ action: nextStatus === "resolved" ? "Report Resolved" : "Report Status Updated", performedById: adviser.id, performedBy: `${adviser.first_name} ${adviser.last_name}`, performedByRole: "Adviser", targetUser: existing.student_name ?? "Student", targetRole: "Student", targetType: "Student Report", targetId: reportId, relatedReportId: reportId, relatedStudentId: existing.student_id ?? undefined, previousStatus: existing.status, newStatus: nextStatus, module: "Student Reports", details: `Changed student report #${reportId} from ${existing.status} to ${nextStatus}.` });
    await publishStudentReportsRealtimeInvalidation(adviser.id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PATCH /api/student-reports/[id]/status error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
