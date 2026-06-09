import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendParentReportAdviserEmail } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";
import {
  getAdviserSession,
  getGuidanceSession,
  getParentSession,
  getPrincipalSession,
  listMessages,
  toAdviserReport,
  toGuidanceReport,
  toParentReport,
  toPrincipalReport,
  type ReportRow,
} from "./_lib";

const MAX_REPORTS = 100;
const REPORT_SELECT = [
  "id",
  "parent_id",
  "parent_email",
  "parent_name",
  "adviser_id",
  "adviser_name",
  "student_id",
  "student_name",
  "grade",
  "section",
  "subject",
  "categories",
  "concern_level",
  "status",
  "escalated_to_guidance",
  "escalated_to_principal",
  "guidance_seen_at",
  "parent_seen_at",
  "status_updated_at",
  "created_at",
  "updated_at",
  "last_message_at",
].join(", ");

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function supabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message ?? record.details ?? "Server error.");
  }
  return "Server error.";
}

type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

function cleanAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const type = typeof record.type === "string" ? record.type : "application/octet-stream";
    const size = typeof record.size === "number" ? record.size : 0;
    const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";
    if (!name || !dataUrl || size > 10 * 1024 * 1024) return [];
    return [{ name, type, size, dataUrl }];
  });
}

function isMissingAttachmentsColumn(error: { message?: string; code?: string } | null) {
  return Boolean(
    error &&
    (error.message?.toLowerCase().includes("attachments") ||
      error.message?.toLowerCase().includes("schema cache") ||
      error.code === "PGRST204")
  );
}

function isMissingColumn(error: { message?: string; code?: string } | null, column: string) {
  return Boolean(
    error &&
    (error.code === "PGRST204" ||
      error.message?.toLowerCase().includes(column.toLowerCase()) ||
      error.message?.toLowerCase().includes("schema cache"))
  );
}

function studentFromRelation(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get("role");

    if (role === "adviser") {
      const adviser = await getAdviserSession();
      if (!adviser) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      const { data, error } = await supabase
        .from("parent_adviser_reports")
        .select(REPORT_SELECT)
        .eq("adviser_id", adviser.id)
        .order("last_message_at", { ascending: false })
        .limit(MAX_REPORTS);

      if (error) throw error;

      const rows = (data ?? []) as unknown as ReportRow[];
      const messages = await listMessages(rows.map((row) => row.id));
      return NextResponse.json({
        success: true,
        reports: rows.map((row) => toAdviserReport(row, messages.get(row.id) ?? [])),
      });
    }

    if (role === "principal") {
      const principal = await getPrincipalSession();
      if (!principal) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      const { data, error } = await supabase
        .from("parent_adviser_reports")
        .select(REPORT_SELECT)
        .eq("escalated_to_principal", true)
        .order("last_message_at", { ascending: false })
        .limit(MAX_REPORTS);

      if (error) throw error;

      const rows = (data ?? []) as unknown as ReportRow[];
      const messages = await listMessages(rows.map((row) => row.id));
      return NextResponse.json({
        success: true,
        reports: rows.map((row) => toPrincipalReport(row, messages.get(row.id) ?? [])),
      });
    }

    if (role === "guidance") {
      const guidance = await getGuidanceSession();
      if (!guidance) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      const { data, error } = await supabase
        .from("parent_adviser_reports")
        .select(REPORT_SELECT)
        .eq("escalated_to_guidance", true)
        .order("last_message_at", { ascending: false })
        .limit(MAX_REPORTS);

      if (error) throw error;

      const rows = (data ?? []) as unknown as ReportRow[];
      const messages = await listMessages(rows.map((row) => row.id));
      return NextResponse.json({
        success: true,
        reports: rows.map((row) => toGuidanceReport(row, messages.get(row.id) ?? [])),
      });
    }

    const parent = await getParentSession();
    if (!parent) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("parent_adviser_reports")
      .select(REPORT_SELECT)
      .eq("parent_email", parent.email)
      .order("last_message_at", { ascending: false })
      .limit(MAX_REPORTS);

    if (error) throw error;

    const rows = (data ?? []) as unknown as ReportRow[];
    const messages = await listMessages(rows.map((row) => row.id));
    return NextResponse.json({
      success: true,
      reports: rows.map((row) => toParentReport(row, messages.get(row.id) ?? [])),
    });
  } catch (error: unknown) {
    console.error("GET /api/reports/parent-adviser error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const parent = await getParentSession();
    if (!parent) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { adviserId, studentId, subject, categories, concernLevel, message, attachments } = await req.json();
    const cleanedAttachments = cleanAttachments(attachments);
    if (!adviserId || !studentId || !subject || (!String(message ?? "").trim() && cleanedAttachments.length === 0) || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json(
        { success: false, message: "Adviser, student, subject, category, and message or attachment are required." },
        { status: 400 }
      );
    }

    const { data: adviserRows, error: adviserError } = await supabase
      .from("advisers")
      .select("id, first_name, last_name, email, grade, section, sections")
      .eq("id", adviserId)
      .limit(1);

    if (adviserError) throw adviserError;
    const adviser = adviserRows?.[0];
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Adviser not found." }, { status: 404 });
    }

    const { data: parentRows, error: parentError } = await supabase
      .from("parents")
      .select(`
        id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, student_id,
        students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
      `)
      .eq("email", parent.email)
      .eq("student_id", studentId)
      .limit(1);

    if (parentError) throw parentError;
    const parentRow = parentRows?.[0];
    if (!parentRow) {
      return NextResponse.json({ success: false, message: "Student is not linked to your parent account." }, { status: 403 });
    }

    const student = studentFromRelation(parentRow.students) as {
      student_id: string;
      first_name: string;
      middle_name?: string | null;
      last_name: string;
      suffix?: string | null;
      grade?: string | null;
      section?: string | null;
    };

    const parentName = [
      parentRow.parent_first_name,
      parentRow.parent_middle_name,
      parentRow.parent_last_name,
      parentRow.parent_suffix,
    ].filter(Boolean).join(" ");
    const studentName = [student.first_name, student.middle_name, student.last_name, student.suffix]
      .filter(Boolean)
      .join(" ");
    const adviserName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ");
    const adviserSections = Array.isArray(adviser.sections) && adviser.sections.length > 0
      ? adviser.sections
      : adviser.section
      ? [adviser.section]
      : [];

    if (adviser.grade !== student.grade || !adviserSections.includes(student.section ?? "")) {
      return NextResponse.json(
        { success: false, message: "Selected adviser is not assigned to this student." },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const trimmedSubject = String(subject).trim();
    const trimmedMessage = String(message).trim();
    const duplicateSince = new Date(Date.now() - 60_000).toISOString();
    const { data: duplicateRows, error: duplicateError } = await supabase
      .from("parent_adviser_reports")
      .select("*")
      .eq("parent_email", parent.email)
      .eq("adviser_id", adviser.id)
      .eq("student_id", student.student_id)
      .eq("subject", trimmedSubject)
      .gte("created_at", duplicateSince)
      .order("created_at", { ascending: false })
      .limit(5);

    if (duplicateError) throw duplicateError;
    const duplicateMessages = await listMessages((duplicateRows ?? []).map((row) => row.id));
    const duplicateReport = (duplicateRows ?? []).find((row) => {
      const firstParentMessage = (duplicateMessages.get(row.id) ?? []).find((msg) => msg.sender_role === "parent");
      return firstParentMessage?.body === trimmedMessage;
    });

    if (duplicateReport) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        report: toParentReport(duplicateReport, duplicateMessages.get(duplicateReport.id) ?? []),
      });
    }

    const reportPayload: Record<string, string | number | string[] | null> = {
      parent_id: parentRow.id,
      parent_email: parent.email,
      parent_name: parentName || parent.name,
      adviser_id: adviser.id,
      adviser_name: adviserName,
      student_id: student.student_id,
      student_name: studentName,
      grade: student.grade ?? "",
      section: student.section ?? "",
      subject: trimmedSubject,
      categories,
      concern_level: Number(concernLevel) || 0,
      status: "new",
      parent_seen_at: now,
      status_updated_at: now,
      updated_at: now,
      last_message_at: now,
    };

    let reportResult = await supabase
      .from("parent_adviser_reports")
      .insert(reportPayload)
      .select("*")
      .single();

    if (reportResult.error && isMissingColumn(reportResult.error, "status_updated_at")) {
      delete reportPayload.status_updated_at;
      reportResult = await supabase
        .from("parent_adviser_reports")
        .insert(reportPayload)
        .select("*")
        .single();
    }

    if (reportResult.error && isMissingColumn(reportResult.error, "parent_seen_at")) {
      delete reportPayload.parent_seen_at;
      reportResult = await supabase
        .from("parent_adviser_reports")
        .insert(reportPayload)
        .select("*")
        .single();
    }

    const { data: report, error: reportError } = reportResult;
    if (reportError) throw reportError;

    let messageResult = await supabase
      .from("parent_adviser_report_messages")
      .insert({
        report_id: report.id,
        sender_role: "parent",
        sender_name: parentName || parent.name,
        body: trimmedMessage,
        thread_type: "adviser",
        attachments: cleanedAttachments,
        read_by_parent: true,
      });

    if (messageResult.error && isMissingAttachmentsColumn(messageResult.error)) {
      if (cleanedAttachments.length > 0) {
        throw new Error("Attachment support is not migrated yet. Please run parent_report_message_attachments_migration.sql in Supabase.");
      }
      messageResult = await supabase
        .from("parent_adviser_report_messages")
        .insert({
          report_id: report.id,
          sender_role: "parent",
          sender_name: parentName || parent.name,
          body: trimmedMessage,
          read_by_parent: true,
        });
    }

    if (messageResult.error) throw messageResult.error;

    if (adviser.email) {
      try {
        await sendParentReportAdviserEmail({
          adviserEmail: adviser.email,
          adviserName,
          parentName: parentName || parent.name,
          studentName,
          subject: trimmedSubject,
          categories,
          message: trimmedMessage,
          hasAttachments: cleanedAttachments.length > 0,
        });
      } catch (emailError) {
        console.error("Unable to send parent report adviser email:", emailError);
      }
    }

    // ── Audit log ──
    await logAudit({
      action:          "Submit Report",
      performedBy:     parentName || parent.name,
      performedByRole: "Parent",
      targetUser:      adviserName,
      targetRole:      "Adviser",
      details:         `Parent submitted a report: "${trimmedSubject}" (${categories.join(", ")}).`,
      module:          "Reports",
    });

    const messages = await listMessages([report.id]);
    return NextResponse.json({
      success: true,
      report: toParentReport(report, messages.get(report.id) ?? []),
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/reports/parent-adviser error:", error);
    return NextResponse.json({ success: false, message: supabaseErrorMessage(error) }, { status: 500 });
  }
}
