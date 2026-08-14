import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getParentSession, getReportForParent } from "../../_lib";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parent = await getParentSession();
    if (!parent) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const reportId = Number((await params).id);
    const { allowHistoryAccess } = await req.json();
    if (!Number.isFinite(reportId) || typeof allowHistoryAccess !== "boolean") {
      return NextResponse.json({ success: false, message: "A consent choice is required." }, { status: 400 });
    }

    const report = await getReportForParent(reportId, parent.email);
    if (!report) return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    if (!report.subject.startsWith("[Student Concern] ")) {
      return NextResponse.json({ success: false, message: "Consent is only required for Student Concerns." }, { status: 400 });
    }

    const { error } = await supabase
      .from("parent_adviser_reports")
      .update({ allow_history_access: allowHistoryAccess, updated_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("parent_email", parent.email);
    if (error) throw error;

    return NextResponse.json({ success: true, allowHistoryAccess });
  } catch (error) {
    console.error("PATCH /api/reports/parent-adviser/[id]/consent error:", error);
    return NextResponse.json({ success: false, message: "Unable to save your consent choice." }, { status: 500 });
  }
}
