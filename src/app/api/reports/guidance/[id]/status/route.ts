import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendGuidancePrincipalEscalationEmail } from "@/lib/mailer";
import { getGuidanceSession, listMessages, toGuidanceReport, unreadGuidanceMessageIds } from "../../../parent-adviser/_lib";
import { logAudit } from "@/lib/audit";
import { publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function fullName(parts: unknown[]) {
  return parts.map((part) => String(part ?? "").trim()).filter(Boolean).join(" ");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guidance = await getGuidanceSession();
    if (!guidance) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { id } = await params;
    const reportId = Number(id);
    const { status } = await req.json();
    const requested = String(status ?? "").toLowerCase();
    const now = new Date().toISOString();

    const { data: currentReport, error: currentReportError } = await supabase
      .from("parent_adviser_reports")
      .select("id, status, escalated_to_guidance, escalated_to_principal")
      .eq("id", reportId)
      .eq("escalated_to_guidance", true)
      .limit(1)
      .maybeSingle();
    if (currentReportError) throw currentReportError;
    if (!currentReport) return NextResponse.json({ success: false, message: "Escalated report not found." }, { status: 404 });
    if (String(currentReport.status ?? "").toLowerCase() === "cancelled") {
      return NextResponse.json({ success: false, message: "This report has been cancelled by the Parent." }, { status: 409 });
    }
    if (requested === "resolved" && String(currentReport.status ?? "").toLowerCase() === "resolved") {
      return NextResponse.json({ success: false, message: "This report has already been resolved." }, { status: 409 });
    }
    if (requested === "resolved" && currentReport.escalated_to_principal) {
      return NextResponse.json({ success: false, message: "The Principal owns this escalated report and must resolve it." }, { status: 403 });
    }

    if (requested === "seen") {
      const { error } = await supabase
        .from("parent_adviser_reports")
        .update({
          // Opening the concern starts Guidance's review. Keep this in the
          // same write as guidance_seen_at so realtime reloads cannot observe
          // a transient Escalated state and put it back in the UI.
          status: "ongoing",
          escalated_to_guidance: true,
          guidance_seen_at: now,
          updated_at: now,
        })
        .eq("id", reportId)
        .eq("escalated_to_guidance", true)
        .neq("status", "resolved")
        .neq("status", "cancelled");

      if (error) throw error;

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

      const messages = await listMessages([reportId]);
      const unreadMessageIds = unreadGuidanceMessageIds(report, messages.get(reportId) ?? []);
      if (unreadMessageIds.length > 0) {
        const { error: readError } = await supabase
          .from("parent_adviser_report_messages")
          .update({ read_by_adviser: true })
          .in("id", unreadMessageIds);
        if (readError) throw readError;
      }

      const refreshedMessages = unreadMessageIds.length > 0 ? await listMessages([reportId]) : messages;
      await logAudit({ action: "Report Viewed", performedById: guidance.id, performedBy: guidance.name, performedByRole: "Guidance Counselor", targetUser: `Report #${reportId}`, targetRole: "Report", targetType: "Parent Report", targetId: reportId, relatedReportId: reportId, previousStatus: currentReport.status, newStatus: "ongoing", module: "Reports", details: `Opened escalated report #${reportId} for review.` });
      await publishReportRealtimeInvalidation({
        parentId: report.parent_id,
        adviserId: report.adviser_id,
        includeGuidance: true,
        reportId,
        kind: "status",
      });
      return NextResponse.json({
        success: true,
        report: toGuidanceReport(report, refreshedMessages.get(reportId) ?? []),
      });
    }

    const normalized = requested === "resolved" ? "resolved" : requested === "escalated" ? "escalated" : "ongoing";
    const escalatedToPrincipal = requested === "escalated";
    let wasAlreadyEscalatedToPrincipal = false;
    if (escalatedToPrincipal) {
      const { data: currentReport, error: currentError } = await supabase
        .from("parent_adviser_reports")
        .select("escalated_to_principal")
        .eq("id", reportId)
        .limit(1)
        .maybeSingle();
      if (currentError) throw currentError;
      wasAlreadyEscalatedToPrincipal = Boolean(currentReport?.escalated_to_principal);
    }
    const updatePayload: Record<string, string | boolean> = {
      status: normalized,
      escalated_to_guidance: true,
      guidance_seen_at: now,
      status_updated_at: now,
      updated_at: now,
      last_message_at: now,
    };
    if (escalatedToPrincipal) updatePayload.escalated_to_principal = true;

    let updateResult = await supabase
      .from("parent_adviser_reports")
      .update(updatePayload)
      .eq("id", reportId)
      .eq("escalated_to_guidance", true)
      .neq("status", "cancelled")
      .select("id")
      .maybeSingle();
    let error = updateResult.error;

    if (error?.message?.includes("status_updated_at")) {
      const { status_updated_at: _statusUpdatedAt, ...fallbackPayload } = updatePayload;
      void _statusUpdatedAt;
      updateResult = await supabase
        .from("parent_adviser_reports")
        .update(fallbackPayload)
        .eq("id", reportId)
        .eq("escalated_to_guidance", true)
        .neq("status", "cancelled")
        .select("id")
        .maybeSingle();
      error = updateResult.error;
    }

    if (error) throw error;
    if (!updateResult.data) {
      return NextResponse.json({ success: false, message: "This report is not available for Guidance escalation." }, { status: 409 });
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

    if (escalatedToPrincipal && !wasAlreadyEscalatedToPrincipal) {
      try {
        const { data: principal } = await supabase
          .from("principals")
          .select("id, first_name, middle_name, last_name, suffix, email")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        const principalEmail = typeof principal?.email === "string" ? principal.email : "";
        if (principalEmail) {
          await sendGuidancePrincipalEscalationEmail({
            principalEmail,
            principalName: fullName([principal?.first_name, principal?.middle_name, principal?.last_name, principal?.suffix]) || "Principal",
            guidanceName: guidance.name,
            parentName: String(report.parent_name ?? "Parent"),
            studentName: String(report.student_name ?? "Student"),
            subject: String(report.subject ?? "Escalated Report"),
            concern: String(report.subject ?? ""),
          });
        }
      } catch (emailError) {
        console.error("Guidance principal escalation email failed:", emailError);
      }
    }

    await logAudit({ action: normalized === "resolved" ? "Report Resolved" : escalatedToPrincipal ? "Escalated to Principal" : "Report Status Updated", performedById: guidance.id, performedBy: guidance.name, performedByRole: "Guidance Counselor", targetUser: `Report #${reportId}`, targetRole: "Report", targetType: "Parent Report", targetId: reportId, relatedReportId: reportId, previousStatus: currentReport.status, newStatus: normalized, module: "Reports", details: escalatedToPrincipal ? `Escalated report #${reportId} from Guidance to the Principal.` : `Changed report #${reportId} from ${currentReport.status} to ${normalized}.` });

    await publishReportRealtimeInvalidation({
      parentId: report.parent_id,
      adviserId: report.adviser_id,
      includeGuidance: true,
      reportId,
      kind: "status",
    });

    const messages = await listMessages([reportId]);
    return NextResponse.json({
      success: true,
      report: toGuidanceReport(report, messages.get(reportId) ?? []),
    });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/guidance/[id]/status error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
