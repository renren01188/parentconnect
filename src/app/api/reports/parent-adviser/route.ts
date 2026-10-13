import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { principalReportReadKey } from "@/lib/principalReportReadState.cjs";
import { sendParentReportAdviserEmail } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";
import { publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
  getAdviserSession,
  getGuidanceSession,
  getLinkedStudentIds,
  getParentSession,
  getPrincipalSession,
  listGuidanceTickets,
  listMessageSummaries,
  listMessages,
  toAdviserReport,
  toAdviserReportSummary,
  toGuidanceReport,
  toGuidanceReportSummary,
  toParentReport,
  toParentReportSummary,
  toPrincipalReport,
  toPrincipalReportSummary,
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
  "allow_history_access",
  "status",
  "escalated_to_guidance",
  "escalated_to_principal",
  "cancelled_at",
  "cancelled_by_parent_id",
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

function isTransientConnectionError(error: unknown) {
  const message = error instanceof Error
    ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}`
    : JSON.stringify(error ?? "");
  return /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EHOSTUNREACH|ENETUNREACH/i.test(message);
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

async function getParentReportCooldownUntil(parentId: number) {
  const { data, error } = await supabase
    .from("parents")
    .select("report_submission_cooldown_until")
    .eq("id", parentId)
    .maybeSingle();
  if (error) throw error;
  const value = typeof data?.report_submission_cooldown_until === "string"
    ? data.report_submission_cooldown_until
    : null;
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) && timestamp > Date.now()
    ? new Date(timestamp).toISOString()
    : null;
}

function studentFromRelation(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

type ParentIdentity = {
  id: number;
  email: string | null;
  student_id: string | null;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
};

function parentDisplayName(parent: ParentIdentity) {
  return [
    parent.parent_first_name,
    parent.parent_middle_name,
    parent.parent_last_name,
    parent.parent_suffix,
  ].filter(Boolean).join(" ").trim();
}

/** Resolve sender identity from the parent account so legacy report snapshots
 * cannot show an adviser name in the parent-facing Guidance queue. */
async function resolveParentIdentities(rows: ReportRow[]): Promise<ReportRow[]> {
  const parentIds = [...new Set(rows.flatMap((row) => row.parent_id ? [row.parent_id] : []))];
  const parentEmails = [...new Set(rows.flatMap((row) => row.parent_email ? [row.parent_email] : []))];
  const studentIds = [...new Set(rows.flatMap((row) => row.student_id ? [row.student_id] : []))];
  const select = "id, email, student_id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix";

  const [byIdResult, byEmailResult, byStudentResult] = await Promise.all([
    parentIds.length ? supabase.from("parents").select(select).in("id", parentIds) : Promise.resolve({ data: [], error: null }),
    parentEmails.length ? supabase.from("parents").select(select).in("email", parentEmails) : Promise.resolve({ data: [], error: null }),
    studentIds.length ? supabase.from("parents").select(select).in("student_id", studentIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (byIdResult.error) throw byIdResult.error;
  if (byEmailResult.error) throw byEmailResult.error;
  if (byStudentResult.error) throw byStudentResult.error;

  const parents = [...(byIdResult.data ?? []), ...(byEmailResult.data ?? []), ...(byStudentResult.data ?? [])] as ParentIdentity[];
  const parentsById = new Map(parents.map((parent) => [parent.id, parent]));
  const parentsByEmail = new Map(parents.filter((parent) => parent.email).map((parent) => [parent.email!, parent]));
  const parentsByStudent = new Map(parents.filter((parent) => parent.student_id).map((parent) => [parent.student_id!, parent]));

  return rows.map((row) => {
    const parent = (row.parent_id ? parentsById.get(row.parent_id) : undefined)
      ?? parentsByEmail.get(row.parent_email)
      ?? parentsByStudent.get(row.student_id);
    const name = parent ? parentDisplayName(parent) : "";

    return parent && name ? { ...row, parent_name: name } : row;
  });
}

export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get("role");
    const requestedReportId = Number(req.nextUrl.searchParams.get("reportId"));
    const reportId = Number.isSafeInteger(requestedReportId) && requestedReportId > 0
      ? requestedReportId
      : null;
    // A list request returns only information needed to render cards and
    // badges. Supplying reportId always returns the complete conversation.
    const summary = req.nextUrl.searchParams.get("summary") === "1" && !reportId;

    if (role === "adviser") {
      const adviser = await getAdviserSession();
      if (!adviser) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      let query = supabase
        .from("parent_adviser_reports")
        .select(REPORT_SELECT)
        .eq("adviser_id", adviser.id)
        .order("last_message_at", { ascending: false });
      if (reportId) query = query.eq("id", reportId);
      const { data, error } = await query.limit(reportId ? 1 : MAX_REPORTS);

      if (error) throw error;

      const rows = await resolveParentIdentities((data ?? []) as unknown as ReportRow[]);
      const [messages, tickets] = await Promise.all([
        (summary ? listMessageSummaries : listMessages)(rows.map((row) => row.id)),
        listGuidanceTickets(rows.map((row) => row.id), !summary),
      ]);
      return NextResponse.json({
        success: true,
        reports: rows.map((row) => summary
          ? toAdviserReportSummary(row, messages.get(row.id) ?? [], tickets.get(row.id))
          : { ...toAdviserReport(row, messages.get(row.id) ?? [], tickets.get(row.id)), detailsLoaded: true }),
      });
    }

    if (role === "principal") {
      const principal = await getPrincipalSession();
      if (!principal) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      let query = supabase
        .from("parent_adviser_reports")
        .select(REPORT_SELECT)
        .order("last_message_at", { ascending: false });
      if (reportId) query = query.eq("id", reportId);
      // Principal monitoring must be a complete superset of Parent Reports.
      // Do not apply the regular inbox cap here, otherwise a new report can
      // appear in Principal Notifications while being absent from Reports.
      const { data, error } = await (reportId ? query.limit(1) : query);

      if (error) throw error;

      const rows = await resolveParentIdentities((data ?? []) as unknown as ReportRow[]);
      const [messages, tickets, principalReadsResult] = await Promise.all([
        (summary ? listMessageSummaries : listMessages)(rows.map((row) => row.id)),
        listGuidanceTickets(rows.map((row) => row.id), !summary),
        supabase.from("principal_notification_reads").select("notif_key").eq("principal_id", principal.id),
      ]);
      if (principalReadsResult.error) throw principalReadsResult.error;
      const principalReadKeys = new Set((principalReadsResult.data ?? []).map((read) => read.notif_key));
      return NextResponse.json({
        success: true,
        reports: rows.map((row) => summary
          ? toPrincipalReportSummary(
            row,
            messages.get(row.id) ?? [],
            tickets.get(row.id),
            principalReadKeys.has(principalReportReadKey(row.id)),
          )
          : {
            ...toPrincipalReport(
              row,
              messages.get(row.id) ?? [],
              tickets.get(row.id),
              principalReadKeys.has(principalReportReadKey(row.id)),
            ),
            detailsLoaded: true,
          }),
      });
    }

    if (role === "guidance") {
      const guidance = await getGuidanceSession();
      if (!guidance) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      let query = supabase
        .from("parent_adviser_reports")
        .select(REPORT_SELECT)
        .eq("escalated_to_guidance", true)
        .order("last_message_at", { ascending: false });
      if (reportId) query = query.eq("id", reportId);
      const { data, error } = await query.limit(reportId ? 1 : MAX_REPORTS);

      if (error) throw error;

      const rows = await resolveParentIdentities((data ?? []) as unknown as ReportRow[]);
      const [messages, tickets] = await Promise.all([
        (summary ? listMessageSummaries : listMessages)(rows.map((row) => row.id)),
        listGuidanceTickets(rows.map((row) => row.id), !summary),
      ]);
      return NextResponse.json({
        success: true,
        reports: rows.map((row) => summary
          ? toGuidanceReportSummary(row, messages.get(row.id) ?? [], tickets.get(row.id))
          : { ...toGuidanceReport(row, messages.get(row.id) ?? [], tickets.get(row.id)), detailsLoaded: true }),
      });
    }

    const parent = await getParentSession();
    if (!parent) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const [linkedStudentIds, reportSubmissionCooldownUntil] = await Promise.all([
      getLinkedStudentIds(parent.id),
      getParentReportCooldownUntil(parent.id),
    ]);
    if (linkedStudentIds.length === 0) {
      return NextResponse.json({ success: true, reports: [], reportSubmissionCooldownUntil });
    }

    let query = supabase
      .from("parent_adviser_reports")
      .select(REPORT_SELECT)
      .eq("parent_id", parent.id)
      .in("student_id", linkedStudentIds)
      .is("cancelled_at", null)
      .order("last_message_at", { ascending: false });
    if (reportId) query = query.eq("id", reportId);
    const { data, error } = await query.limit(reportId ? 1 : MAX_REPORTS);

    if (error) throw error;

    const rows = await resolveParentIdentities((data ?? []) as unknown as ReportRow[]);
    const [messages, tickets] = await Promise.all([
      (summary ? listMessageSummaries : listMessages)(rows.map((row) => row.id)),
      listGuidanceTickets(rows.map((row) => row.id), !summary),
    ]);
    return NextResponse.json({
      success: true,
      reportSubmissionCooldownUntil,
      reports: rows.map((row) => summary
        ? toParentReportSummary(row, messages.get(row.id) ?? [], tickets.get(row.id))
        : { ...toParentReport(row, messages.get(row.id) ?? [], tickets.get(row.id)), detailsLoaded: true }),
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

    const reportSubmissionCooldownUntil = await getParentReportCooldownUntil(parent.id);
    if (reportSubmissionCooldownUntil) {
      return NextResponse.json({
        success: false,
        message: "You must wait before submitting another report.",
        reportSubmissionCooldownUntil,
      }, { status: 429 });
    }

    const { adviserId, studentId, subject, categories, concernLevel, message, attachments, allowHistoryAccess, termsAccepted } = await req.json();
    const cleanedAttachments = cleanAttachments(attachments);
    if (!adviserId || !studentId || !subject || (!String(message ?? "").trim() && cleanedAttachments.length === 0) || !Array.isArray(categories) || categories.length === 0 || termsAccepted !== true) {
      return NextResponse.json(
        { success: false, message: "Adviser, student, subject, category, message or attachment, and report terms acceptance are required." },
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

    const { data: parentRow, error: parentError } = await supabase
      .from("parents")
      .select("id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix")
      .eq("id", parent.id)
      .maybeSingle();

    if (parentError) throw parentError;
    if (!parentRow) {
      return NextResponse.json({ success: false, message: "Student is not linked to your parent account." }, { status: 403 });
    }

    const { data: linkedStudent, error: linkedStudentError } = await supabase
      .from("parent_student_links")
      .select(`
        student_id,
        students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
      `)
      .eq("parent_id", parent.id)
      .eq("student_id", studentId)
      .maybeSingle();
    if (linkedStudentError) throw linkedStudentError;
    if (!linkedStudent) {
      return NextResponse.json({ success: false, message: "Student is not linked to your parent account." }, { status: 403 });
    }

    const student = studentFromRelation(linkedStudent.students) as {
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
      .eq("parent_id", parent.id)
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

    const reportPayload: Record<string, string | number | boolean | string[] | null> = {
      parent_id: parent.id,
      parent_email: parentRow.email ?? parent.email,
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
      allow_history_access: allowHistoryAccess === true,
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

    if (reportResult.error && isMissingColumn(reportResult.error, "allow_history_access")) {
      delete reportPayload.allow_history_access;
      reportResult = await supabase
        .from("parent_adviser_reports")
        .insert(reportPayload)
        .select("*")
        .single();
    }

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

    await publishReportRealtimeInvalidation({ parentId: parent.id, adviserId: adviser.id, reportId: report.id, kind: "status" });

    const messages = await listMessages([report.id]);
    return NextResponse.json({
      success: true,
      report: toParentReport(report, messages.get(report.id) ?? []),
    }, { status: 201 });
  } catch (error: unknown) {
    const unavailable = isTransientConnectionError(error);
    (unavailable ? console.warn : console.error)("POST /api/reports/parent-adviser error:", error);
    return NextResponse.json(
      {
        success: false,
        message: unavailable
          ? "The reports service is temporarily unavailable. Please try again shortly."
          : supabaseErrorMessage(error),
      },
      { status: unavailable ? 503 : 500 }
    );
  }
}
