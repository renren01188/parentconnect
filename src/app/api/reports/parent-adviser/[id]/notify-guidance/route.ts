import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendGuidanceEscalationEmail } from "@/lib/mailer";
import { getAdviserSession, getReportForAdviser, listMessages } from "../../_lib";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adviser = await getAdviserSession();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const reportId = Number((await params).id);
    const report = await getReportForAdviser(reportId, adviser.id);
    if (!report || !report.escalated_to_guidance) {
      return NextResponse.json({ success: false, message: "Escalated report not found." }, { status: 404 });
    }

    const { data: guidanceRows, error: guidanceError } = await supabase
      .from("guidance_counselors")
      .select("email, first_name, middle_name, last_name, suffix")
      .eq("status", "active")
      .limit(1);
    if (guidanceError) throw guidanceError;

    const guidance = guidanceRows?.[0];
    if (!guidance?.email) {
      return NextResponse.json({ success: false, message: "No active Guidance Office email address found." }, { status: 503 });
    }

    const messages = await listMessages([reportId]);
    const firstParentMessage = (messages.get(reportId) ?? []).find((message) => message.sender_role === "parent");
    try {
      await sendGuidanceEscalationEmail({
        guidanceEmail: String(guidance.email),
        guidanceName: [guidance.first_name, guidance.middle_name, guidance.last_name, guidance.suffix].filter(Boolean).join(" "),
        adviserName: report.adviser_name,
        parentName: report.parent_name,
        studentName: report.student_name,
        subject: report.subject,
        concern: firstParentMessage?.body,
      });
      return NextResponse.json({ success: true, emailSent: true });
    } catch (emailError) {
      // The report is already visible to Guidance through its escalated
      // database status. SMTP failure must not turn that successful handoff
      // into a failed action for the adviser.
      console.warn("Guidance escalation email could not be sent:", emailError);
      return NextResponse.json({ success: true, emailSent: false });
    }
  } catch (error) {
    console.error("Guidance escalation notification error:", error);
    return NextResponse.json({ success: false, message: "Unable to prepare the Guidance email notification." }, { status: 500 });
  }
}
