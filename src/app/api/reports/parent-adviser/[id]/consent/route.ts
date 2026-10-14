import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { getParentSession, getReportForParent } from "../../_lib";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parent = await getParentSession();
    if (!parent) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const reportId = Number((await params).id);
    const { termsAccepted } = await req.json();
    if (!Number.isFinite(reportId) || termsAccepted !== true) {
      return NextResponse.json({ success: false, message: "Confirm the conversation visibility statement before starting this conversation." }, { status: 400 });
    }

    const report = await getReportForParent(reportId, parent.id);
    if (!report) return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    if (!report.subject.startsWith("[Student Concern] ")) {
      return NextResponse.json({ success: false, message: "Consent is only required for Student Concerns." }, { status: 400 });
    }

    const { error } = await supabase
      .from("parent_adviser_reports")
      // The agreement authorizes Principal monitoring for this Student Concern.
      .update({ allow_history_access: true, updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("parent_id", parent.id);
    if (error) throw error;

    // Publish only an opaque report invalidation after the agreement commits.
    // The Principal page and its sidebar refetch their own authorized data.
    await publishReportRealtimeInvalidation({
      parentId: parent.id,
      adviserId: report.adviser_id,
      reportId,
      kind: "status",
    });

    return NextResponse.json({ success: true, allowHistoryAccess: true });
  } catch (error) {
    console.error("PATCH /api/reports/parent-adviser/[id]/consent error:", error);
    return NextResponse.json({ success: false, message: "Unable to save your agreement." }, { status: 500 });
  }
}
