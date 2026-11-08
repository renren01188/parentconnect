import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { sendStaffMessageEmail } from "@/lib/mailer";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
  getPrincipalSession,
  isPrincipalVisibleReport,
  reportResolverRole,
  type ReportRow,
} from "../../../parent-adviser/_lib";

type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

type PrincipalParentMessage = {
  id: number;
  sender: "principal" | "parent";
  senderName: string;
  message: string;
  attachments: MessageAttachment[];
  sentAt: string;
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fullName(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").trim();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * FileReader produces base64 data URLs. Verify the payload as well as its
 * claimed size so a browser cannot bypass the 10 MB limit by changing only
 * the JSON `size` field before it reaches the database.
 */
function validateAttachments(value: unknown):
  | { attachments: MessageAttachment[]; error?: never }
  | { attachments?: never; error: string } {
  if (value === undefined || value === null) return { attachments: [] };
  if (!Array.isArray(value)) return { error: "Attachments must be a list of files." };
  if (value.length > MAX_ATTACHMENTS) return { error: `You can attach up to ${MAX_ATTACHMENTS} files.` };

  const attachments: MessageAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { error: "One of the attachments is invalid." };
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const type = typeof record.type === "string" && record.type.trim()
      ? record.type.trim()
      : "application/octet-stream";
    const size = typeof record.size === "number" ? record.size : Number.NaN;
    const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";

    if (!name || name.length > 255 || !Number.isSafeInteger(size) || size < 0) {
      return { error: "One of the attachments is invalid." };
    }
    if (size > MAX_ATTACHMENT_BYTES) {
      return { error: `“${name}” is over the 10 MB attachment limit.` };
    }

    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match || match[2].length % 4 !== 0) {
      return { error: `“${name}” could not be read as an attachment.` };
    }
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength !== size || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      return { error: `“${name}” is over the 10 MB attachment limit or has an invalid size.` };
    }
    attachments.push({ name, type, size, dataUrl });
  }
  return { attachments };
}

function cleanStoredAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const type = typeof record.type === "string" ? record.type : "application/octet-stream";
    const size = typeof record.size === "number" ? record.size : 0;
    const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";
    return name && dataUrl ? [{ name, type, size, dataUrl }] : [];
  });
}

function toClientMessage(row: Record<string, unknown>): PrincipalParentMessage {
  const sender = row.sender_type === "parent" ? "parent" : "principal";
  return {
    id: Number(row.id),
    sender,
    senderName: String(row.sender_name ?? (sender === "parent" ? "Parent" : "Principal")),
    message: String(row.body ?? ""),
    attachments: cleanStoredAttachments(row.attachments),
    sentAt: formatDate(String(row.created_at ?? "")),
  };
}

async function getAuthorizedResolvedReport(reportId: number) {
  const { data, error } = await supabase
    .from("parent_adviser_reports")
    .select("id, parent_id, parent_email, parent_name, student_id, student_name, subject, status, resolved_by_role, escalated_to_guidance, escalated_to_principal, allow_history_access")
    .eq("id", reportId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const report = data as ReportRow;
  if (!isPrincipalVisibleReport(report)) return null;
  if (String(report.status).toLowerCase() !== "resolved") return null;
  const resolver = reportResolverRole(report);
  if (resolver !== "Adviser" && resolver !== "Guidance") return null;
  return report;
}

async function getMessageParent(report: ReportRow) {
  const parentId = Number(report.parent_id);
  if (!Number.isSafeInteger(parentId) || parentId <= 0) return null;

  const { data, error } = await supabase
    .from("parents")
    .select("id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, status, archive_status")
    .eq("id", parentId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !parentAccountCanAccess(data)) return null;

  const email = String(data.email ?? "").trim().toLowerCase();
  return {
    id: Number(data.id),
    email,
    hasDeliverableEmail: isEmail(email),
    name: fullName([
      data.parent_first_name,
      data.parent_middle_name,
      data.parent_last_name,
      data.parent_suffix,
    ]) || report.parent_name || "Parent",
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await getPrincipalSession();
    if (!principal) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { id } = await params;
    const reportId = Number(id);
    if (!Number.isSafeInteger(reportId) || reportId <= 0) {
      return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    }

    const report = await getAuthorizedResolvedReport(reportId);
    if (!report) {
      return NextResponse.json({ success: false, message: "This report is not eligible for a separate Principal message." }, { status: 403 });
    }

    const parent = await getMessageParent(report);
    if (!parent) {
      return NextResponse.json({ success: false, message: "The Parent account is unavailable." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("staff_messages")
      .select("id, sender_type, sender_id, sender_name, body, attachments, created_at")
      .eq("report_id", reportId)
      .or(`and(sender_type.eq.principal,recipient_type.eq.parent,recipient_id.eq.${parent.id}),and(sender_type.eq.parent,sender_id.eq.${parent.id},recipient_type.eq.principal)`)
      .order("created_at", { ascending: true });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      messages: (data ?? []).map((row) => toClientMessage(row as Record<string, unknown>)),
    });
  } catch (error) {
    console.error("GET /api/reports/principal/[id]/parent-message error:", error);
    return NextResponse.json({ success: false, message: "Unable to load Principal messages for this report." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await getPrincipalSession();
    if (!principal) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { id } = await params;
    const reportId = Number(id);
    if (!Number.isSafeInteger(reportId) || reportId <= 0) {
      return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
    }

    const payload = await req.json().catch(() => null);
    const message = String(payload?.message ?? "").trim();
    const attachmentResult = validateAttachments(payload?.attachments);
    if ("error" in attachmentResult) {
      return NextResponse.json({ success: false, message: attachmentResult.error }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ success: false, message: "Enter a message for the Parent." }, { status: 400 });
    }
    if (message.length > 10_000) {
      return NextResponse.json({ success: false, message: "The message must be 10,000 characters or fewer." }, { status: 400 });
    }

    // Re-check the report's current state at write time. Nothing in this
    // endpoint inserts a parent_adviser_report_message or updates the report.
    const report = await getAuthorizedResolvedReport(reportId);
    if (!report) {
      return NextResponse.json({ success: false, message: "This report is no longer eligible for a separate Principal message." }, { status: 409 });
    }
    const parent = await getMessageParent(report);
    if (!parent) {
      return NextResponse.json({ success: false, message: "The Parent account is unavailable." }, { status: 404 });
    }

    const { data: created, error } = await supabase
      .from("staff_messages")
      .insert({
        sender_type: "principal",
        sender_id: principal.id,
        sender_name: principal.name,
        recipient_type: "parent",
        recipient_id: parent.id,
        recipient_name: parent.name,
        recipient_email: parent.email,
        subject: report.subject,
        categories: ["Report Follow-up"],
        body: message,
        attachments: attachmentResult.attachments,
        source_message_id: null,
        report_id: reportId,
        status: "unread",
      })
      .select("id, sender_type, sender_id, sender_name, body, attachments, created_at")
      .single();
    if (error) throw error;

    // The message is durable before either the UI wake-up or email attempt.
    await publishRealtimeInvalidation([
      { role: "principal", id: principal.id },
      { role: "parent", id: parent.id },
    ], {
      scope: "staff-messages",
      kind: "message",
      reportId,
      conversationId: `staff-message:${Number(created.id)}`,
      messageId: Number(created.id),
    });

    // Dashboard delivery is the required path. When a Parent has a valid
    // email address, send the matching optional notification after the
    // response without delaying the saved message or its Realtime update.
    if (parent.hasDeliverableEmail) after(async () => {
      try {
        await sendStaffMessageEmail({
          recipientEmail: parent.email,
          recipientName: parent.name,
          senderName: principal.name,
          senderRole: "Principal",
          subject: report.subject,
          message,
          hasAttachments: attachmentResult.attachments.length > 0,
        });
      } catch (error) {
        console.error("Principal report follow-up email delivery failed:", error);
      }
    });

    return NextResponse.json({ success: true, message: toClientMessage(created as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/reports/principal/[id]/parent-message error:", error);
    return NextResponse.json({ success: false, message: "Unable to send the Principal message to the Parent." }, { status: 500 });
  }
}
