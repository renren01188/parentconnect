import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { acceptedGuidanceRecipientForReport, publishReportRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { principalReportReadKey } from "@/lib/principalReportReadState.cjs";
import {
  getAdviserSession,
  getGuidanceSession,
  getParentSession,
  getPrincipalSession,
  getReportForAdviser,
  getReportForParent,
  isStudentConcernReport,
} from "../../_lib";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

const IDEMPOTENCY_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

// Some deployed databases predate the idempotency_key column. The marker is
// stored alongside attachments only for that legacy shape; read paths already
// discard items without a name and data URL, so it is never exposed as a file.
type LegacyIdempotencyMarker = { _parentconnect_idempotency_key: string };
type StoredAttachment = MessageAttachment | LegacyIdempotencyMarker;

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

function isClosedReportStatus(status: unknown) {
  return ["resolved", "cancelled"].includes(String(status ?? "").toLowerCase());
}

async function legacyDuplicateMessage(reportId: number, idempotencyKey: string) {
  const { data, error } = await supabase
    .from("parent_adviser_report_messages")
    .select("id, attachments")
    .eq("report_id", reportId)
    .order("id", { ascending: false });

  if (error) throw error;
  const duplicate = (data ?? []).find((row) => Array.isArray(row.attachments) && row.attachments.some((item) => {
    if (!item || typeof item !== "object") return false;
    return (item as Record<string, unknown>)._parentconnect_idempotency_key === idempotencyKey;
  }));
  return duplicate?.id ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reportId = Number(id);
    const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() ?? "";
    const { body, role, attachments, threadType } = await req.json();
    const trimmedBody = String(body ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);

    if (!reportId || (!trimmedBody && cleanedAttachments.length === 0)) {
      return NextResponse.json({ success: false, message: "Message or attachment is required." }, { status: 400 });
    }
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      return NextResponse.json({ success: false, message: "A valid idempotency key is required." }, { status: 400 });
    }

    const requestedRole = role === "adviser" ? "adviser" : role === "guidance" ? "guidance" : role === "principal" ? "principal" : "parent";

    if (requestedRole === "adviser") {
      const adviser = await getAdviserSession();
      if (!adviser) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      const report = await getReportForAdviser(reportId, adviser.id);
      if (!report) {
        return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
      }

      if (isClosedReportStatus(report.status)) {
        return NextResponse.json(
          { success: false, message: "This report is closed. You can no longer send messages in this conversation." },
          { status: 403 }
        );
      }

      // Block adviser from sending messages once the report has been escalated to Guidance.
      if (report.escalated_to_guidance) {
        return NextResponse.json(
          { success: false, message: "This report has been escalated to Guidance. You can no longer send messages in this conversation." },
          { status: 403 }
        );
      }

      const adviserName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ");
      const result = await insertMessage(reportId, "adviser", adviserName, trimmedBody, report.status, cleanedAttachments, "adviser", idempotencyKey);
      // Broadcast while this request is still alive. Deferring this with
      // `after()` lets a serverless response finish before the Broadcast REST
      // call starts, which can leave the Parent waiting for a manual refresh.
      if (!result.duplicate) await deliverReportInvalidation(report, reportId, result.id);
      return NextResponse.json({ success: true, messageId: result.id });
    }

    if (requestedRole === "guidance") {
      const guidance = await getGuidanceSession();
      if (!guidance) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      const { data: report, error: reportError } = await supabase
        .from("parent_adviser_reports")
        .select("*")
        .eq("id", reportId)
        .eq("escalated_to_guidance", true)
        .limit(1)
        .maybeSingle();

      if (reportError) throw reportError;
      if (!report) {
        return NextResponse.json({ success: false, message: "Escalated report not found." }, { status: 404 });
      }

      if (isClosedReportStatus(report.status)) {
        return NextResponse.json(
          { success: false, message: "This report is closed. You can no longer send messages in this conversation." },
          { status: 403 }
        );
      }

      // Block Guidance from sending messages once the report has been escalated to the Principal.
      if (report.escalated_to_principal) {
        return NextResponse.json(
          { success: false, message: "This report has been escalated to the Principal. Guidance can no longer send messages in this conversation." },
          { status: 403 }
        );
      }

      // An accepted ticket belongs to one Guidance user. Legacy
      // escalations without an accepted assignment retain the established
      // active-Guidance fallback, but an assigned conversation must not be
      // writable by another counselor.
      const assignedGuidanceId = await acceptedGuidanceRecipientForReport(reportId);
      if (assignedGuidanceId !== null && assignedGuidanceId !== guidance.id) {
        return NextResponse.json(
          { success: false, message: "This report is assigned to another Guidance user." },
          { status: 403 },
        );
      }

      const result = await insertMessage(reportId, "guidance", guidance.name, trimmedBody, String(report.status ?? ""), cleanedAttachments, "guidance", idempotencyKey);
      if (!result.duplicate) {
        await deliverReportInvalidation(report, reportId, result.id);
      }
      return NextResponse.json({ success: true, messageId: result.id });
    }

    if (requestedRole === "principal") {
      const principal = await getPrincipalSession();
      if (!principal) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      const { data: report, error: reportError } = await supabase
        .from("parent_adviser_reports")
        .select("*")
        .eq("id", reportId)
        .eq("escalated_to_principal", true)
        .limit(1)
        .maybeSingle();

      if (reportError) throw reportError;
      if (!report) {
        return NextResponse.json({ success: false, message: "Principal-escalated report not found." }, { status: 404 });
      }

      if (isClosedReportStatus(report.status)) {
        return NextResponse.json(
          { success: false, message: "This report is closed. You can no longer send messages in this conversation." },
          { status: 403 }
        );
      }

      const result = await insertMessage(reportId, "principal", principal.name, trimmedBody, String(report.status ?? ""), cleanedAttachments, "principal", idempotencyKey);
      // Email notifications are intentionally disabled for Principal <-> Parent conversations.
      if (!result.duplicate) await deliverReportInvalidation(report, reportId, result.id);
      return NextResponse.json({ success: true, messageId: result.id });
    }

    const parent = await getParentSession();
    if (!parent) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const report = await getReportForParent(reportId, parent.id);
    if (!report) {
      return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    }

    if (isClosedReportStatus(report.status)) {
      return NextResponse.json(
        { success: false, message: "This report is closed. You can no longer send messages in this conversation." },
        { status: 403 }
      );
    }

    if (isStudentConcernReport(report) && report.allow_history_access !== true) {
      return NextResponse.json(
        { success: false, message: "Accept the Terms and Agreement before starting this Student Concern conversation." },
        { status: 403 },
      );
    }

    // The report handoff determines the Parent's active conversation. Do not
    // let a browser-provided thread type route a reply back to an Adviser once
    // Guidance or the Principal owns the report.
    const parentThreadType = report.escalated_to_principal
      ? "principal"
      : report.escalated_to_guidance
        ? "guidance"
        : "adviser";
    void threadType;
    const result = await insertMessage(reportId, "parent", parent.name, trimmedBody, report.status, cleanedAttachments, parentThreadType, idempotencyKey);
    // Email notifications are intentionally disabled for Parent <-> Principal conversations.
    if (!result.duplicate) await deliverReportInvalidation(report, reportId, result.id);
    return NextResponse.json({ success: true, messageId: result.id });
  } catch (error: unknown) {
    console.error("POST /api/reports/parent-adviser/[id]/messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

async function publishReportInvalidation(report: {
  parent_id?: number | null;
  adviser_id?: number | null;
  escalated_to_guidance?: boolean | null;
  escalated_to_principal?: boolean | null;
}, reportId: number, messageId: number) {
  const principalConversation = Boolean(report.escalated_to_principal);
  const guidanceConversation = !principalConversation && Boolean(report.escalated_to_guidance);
  const guidanceId = guidanceConversation
    ? await acceptedGuidanceRecipientForReport(reportId)
    : null;
  await publishReportRealtimeInvalidation({
    parentId: report.parent_id,
    // Message invalidations belong only to the conversation owner at the
    // current handoff stage. Durable status changes use their own broader
    // notifications; a reply must never refresh a former participant's
    // active message box.
    adviserId: principalConversation || guidanceConversation ? null : report.adviser_id,
    includeAdviser: !principalConversation && !guidanceConversation,
    includeGuidance: guidanceConversation,
    guidanceId,
    includePrincipals: principalConversation,
    reportId,
    kind: "message",
    messageId,
  });
}

/**
 * Realtime is an enhancement to a committed message, never a reason to turn
 * that successful message into a server error. Calling it before the response
 * makes an active recipient receive the update immediately; this boundary
 * still preserves the normal reconnect/visibility refresh if Realtime itself
 * is temporarily unavailable.
 */
async function deliverReportInvalidation(report: {
  parent_id?: number | null;
  adviser_id?: number | null;
  escalated_to_guidance?: boolean | null;
  escalated_to_principal?: boolean | null;
}, reportId: number, messageId: number) {
  try {
    await publishReportInvalidation(report, reportId, messageId);
  } catch (error) {
    console.error("Unable to publish parent report Realtime invalidation:", error);
  }
}

function scheduleMessageAudit({
  reportId,
  senderRole,
  senderName,
  currentStatus,
  nextStatus,
  attachments,
  threadType,
}: {
  reportId: number;
  senderRole: "parent" | "adviser" | "guidance" | "principal";
  senderName: string;
  currentStatus: string;
  nextStatus?: string;
  attachments: MessageAttachment[];
  threadType: "adviser" | "guidance" | "principal";
}) {
  // The reply and report-state transaction has already committed at this
  // point. Audit delivery must not turn that successful message into a false
  // server error for the sender.
  after(async () => {
    try {
      await logAudit({
        action: "Message Sent",
        performedBy: senderName,
        performedByRole: senderRole === "parent" ? "Parent/Guardian" : senderRole === "guidance" ? "Guidance Counselor" : senderRole === "principal" ? "Principal" : "Adviser",
        targetUser: `Report #${reportId}`,
        targetRole: "Report",
        targetType: "Parent Report Message",
        targetId: reportId,
        relatedReportId: reportId,
        previousStatus: currentStatus,
        newStatus: nextStatus ?? currentStatus,
        module: "Reports",
        details: `${senderName} sent a ${senderRole} message on report #${reportId}.`,
        metadata: { attachmentCount: attachments.length, threadType },
      });
    } catch (error) {
      console.error("Unable to record parent report message audit entry:", error);
    }
  });
}

function isMissingAtomicMessageFunction(error: { message?: string; code?: string } | null) {
  return Boolean(
    error &&
    (error.code === "PGRST202" ||
      /append_parent_adviser_report_message|schema cache/i.test(error.message ?? ""))
  );
}

async function insertMessage(
  reportId: number,
  senderRole: "parent" | "adviser" | "guidance" | "principal",
  senderName: string,
  body: string,
  currentStatus: string,
  attachments: MessageAttachment[],
  threadType: "adviser" | "guidance" | "principal",
  idempotencyKey: string,
) {
  const { data, error } = await supabase.rpc("append_parent_adviser_report_message", {
    p_report_id: reportId,
    p_sender_role: senderRole,
    p_sender_name: senderName,
    p_body: body,
    p_attachments: attachments,
    p_thread_type: threadType,
    p_idempotency_key: idempotencyKey,
  });

  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const id = Number(row?.message_id);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error("The saved message did not return an identifier.");
    }
    const duplicate = row?.duplicate === true;
    const reportStatus = typeof row?.report_status === "string" ? row.report_status : currentStatus;
    if (!duplicate) {
      scheduleMessageAudit({
        reportId,
        senderRole,
        senderName,
        currentStatus,
        nextStatus: reportStatus,
        attachments,
        threadType,
      });
    }
    return { id, duplicate };
  }

  // The fallback is only for installations that have not applied the paired
  // migration yet. Once it is applied, every normal request takes the single
  // transactional RPC above.
  if (!isMissingAtomicMessageFunction(error)) throw error;
  return insertMessageLegacy(reportId, senderRole, senderName, body, currentStatus, attachments, threadType, idempotencyKey);
}

async function insertMessageLegacy(
  reportId: number,
  senderRole: "parent" | "adviser" | "guidance" | "principal",
  senderName: string,
  body: string,
  currentStatus: string,
  attachments: MessageAttachment[],
  threadType: "adviser" | "guidance" | "principal",
  idempotencyKey: string,
) {
  let storedAttachments: StoredAttachment[] = attachments;
  let result = await supabase
    .from("parent_adviser_report_messages")
    .insert({
      report_id: reportId,
      sender_role: senderRole,
      sender_name: senderName,
      body,
      thread_type: threadType,
      attachments: storedAttachments,
      idempotency_key: idempotencyKey,
      read_by_parent: senderRole === "parent",
      read_by_adviser: senderRole === "adviser" || senderRole === "guidance" || senderRole === "principal",
    })
    .select("id")
    .maybeSingle();

  if (result.error?.code === "23505") {
    const { data: existing, error: existingError } = await supabase
      .from("parent_adviser_report_messages")
      .select("id")
      .eq("report_id", reportId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError || !existing) throw existingError ?? result.error;
    return { id: existing.id, duplicate: true };
  }

  // Keep requests safe during a rolling migration. The durable UUID column is
  // preferred, but older deployments can still deduplicate a retried request
  // through an internal JSON marker until that column is available.
  if (result.error && isMissingColumn(result.error, "idempotency_key")) {
    const existingId = await legacyDuplicateMessage(reportId, idempotencyKey);
    if (existingId) return { id: existingId, duplicate: true };

    storedAttachments = [...attachments, { _parentconnect_idempotency_key: idempotencyKey }];
    result = await supabase
      .from("parent_adviser_report_messages")
      .insert({
        report_id: reportId,
        sender_role: senderRole,
        sender_name: senderName,
        body,
        thread_type: threadType,
        attachments: storedAttachments,
        read_by_parent: senderRole === "parent",
        read_by_adviser: senderRole === "adviser" || senderRole === "guidance" || senderRole === "principal",
      })
      .select("id")
      .maybeSingle();
  }

  if (result.error && isMissingColumn(result.error, "thread_type")) {
    result = await supabase
      .from("parent_adviser_report_messages")
      .insert({
        report_id: reportId,
        sender_role: senderRole,
        sender_name: senderName,
        body,
        attachments: storedAttachments,
        read_by_parent: senderRole === "parent",
        read_by_adviser: senderRole === "adviser" || senderRole === "guidance" || senderRole === "principal",
      });
  }

  if (result.error && isMissingAttachmentsColumn(result.error)) {
    if (attachments.length > 0) {
      throw new Error("Attachment support is not migrated yet. Please run parent_report_message_attachments_migration.sql in Supabase.");
    }
    result = await supabase
      .from("parent_adviser_report_messages")
      .insert({
        report_id: reportId,
        sender_role: senderRole,
        sender_name: senderName,
        body,
        read_by_parent: senderRole === "parent",
        read_by_adviser: senderRole === "adviser" || senderRole === "guidance" || senderRole === "principal",
      });
  }

  if (result.error) throw result.error;
  const insertedId = result.data?.id;
  if (!insertedId) throw new Error("Message insert did not return an identifier.");

  if (senderRole === "parent") {
    // A new Parent message is unread for every Principal until that Principal
    // opens the report. This touches only Principal receipts; it never changes
    // Parent/Adviser read flags, workflow status, escalation, or permissions.
    const { error: principalReadError } = await supabase
      .from("principal_notification_reads")
      .delete()
      .eq("notif_key", principalReportReadKey(reportId));

    if (principalReadError) throw principalReadError;

    const { error: readError } = await supabase
      .from("parent_adviser_report_messages")
      .update({ read_by_parent: true })
      .eq("report_id", reportId)
      .in("sender_role", ["adviser", "principal", "guidance"]);

    if (readError) throw readError;
  }

  if (senderRole === "adviser" || senderRole === "guidance" || senderRole === "principal") {
    // A successful staff reply is an acknowledgement of the existing Parent
    // messages. Without this receipt, a historical message can reappear as a
    // new sidebar item after the status changes to Replied.
    const { error: readError } = await supabase
      .from("parent_adviser_report_messages")
      .update({ read_by_adviser: true })
      .eq("report_id", reportId)
      .in("sender_role", ["parent", "subject_teacher"]);
    if (readError) throw readError;
  }

  const normalizedStatus = String(currentStatus).toLowerCase();
  // A staff reply to an existing report is a workflow event.  Keep direct
  // staff_messages out of this route so standalone messages never gain a
  // report status.
  const nextStatus = senderRole === "adviser" || senderRole === "guidance" || senderRole === "principal"
    ? "replied"
    // A new Parent message makes an Adviser conversation active again. Do
    // not override an escalated Guidance/Principal workflow.
    : senderRole === "parent" && threadType === "adviser" && normalizedStatus === "replied"
      ? "ongoing"
      : undefined;
  const now = new Date().toISOString();
  const updatePayload: Record<string, string> = {
    updated_at: now,
    last_message_at: now,
  };
  if (nextStatus) {
    updatePayload.status = nextStatus;
    updatePayload.status_updated_at = now;
  }
  if (senderRole === "parent") updatePayload.parent_seen_at = now;

  let { error: updateError } = await supabase
    .from("parent_adviser_reports")
    .update(updatePayload)
    .eq("id", reportId);

  if (updateError && isMissingColumn(updateError, "parent_seen_at")) {
    delete updatePayload.parent_seen_at;
    const fallback = await supabase
      .from("parent_adviser_reports")
      .update(updatePayload)
      .eq("id", reportId);
    updateError = fallback.error;
  }

  if (updateError) throw updateError;
  scheduleMessageAudit({
    reportId,
    senderRole,
    senderName,
    currentStatus,
    nextStatus,
    attachments,
    threadType,
  });
  return { id: insertedId, duplicate: false };
}
