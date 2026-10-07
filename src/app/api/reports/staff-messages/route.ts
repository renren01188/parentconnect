import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { sendGuidanceMessageEmail, sendStaffMessageEmail } from "@/lib/mailer";
import {
  getGuidanceSession,
  getPrincipalSession,
  listMessages,
  toParentReport,
} from "../parent-adviser/_lib";

type StaffRole = "adviser" | "guidance" | "principal" | "ict";
type MessageAttachment = { name: string; type: string; size: number; dataUrl: string };

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

function errorMessage(error: unknown) {
  if (isTransientConnectionError(error)) {
    return "Staff messages are temporarily unavailable. Please try again shortly.";
  }
  return error instanceof Error ? error.message : "Server error.";
}

function isTransientConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EHOSTUNREACH|ENETUNREACH/i.test(message);
}

function fullName(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").trim();
}

function displayParentName(studentName: string) {
  return `${studentName}'s Parent`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "PGRST205" || error.message?.toLowerCase().includes("could not find the table") || error.message?.toLowerCase().includes("schema cache")));
}

function parseRole(value: unknown): StaffRole | null {
  return value === "adviser" || value === "guidance" || value === "principal" || value === "ict" ? value : null;
}

async function resolveStaffByRole(role: StaffRole) {
  if (role === "guidance") {
    const guidance = await getGuidanceSession();
    return guidance ? { type: "guidance" as const, id: guidance.id, name: guidance.name, email: guidance.email } : null;
  }

  if (role === "adviser") {
    const adviser = await getAdviserFromToken();
    if (!adviser) return null;
    return {
      type: "adviser" as const,
      id: Number(adviser.id),
      name: fullName([adviser.first_name, adviser.last_name]) || "Adviser",
      email: String(adviser.email ?? ""),
    };
  }

  if (role === "principal") {
    const principal = await getPrincipalSession();
    if (!principal) return null;
    const { data } = await supabase.from("principals").select("email").eq("id", principal.id).limit(1).maybeSingle();
    return { type: "principal" as const, id: principal.id, name: principal.name, email: String(data?.email ?? "") };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;
  if (token) {
    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role === "ict") {
        const name = fullName([
          typeof verified.payload.first_name === "string" ? verified.payload.first_name : "",
          typeof verified.payload.middle_name === "string" ? verified.payload.middle_name : "",
          typeof verified.payload.last_name === "string" ? verified.payload.last_name : "",
          typeof verified.payload.suffix === "string" ? verified.payload.suffix : "",
        ]) || "ICT Admin";
        return {
          type: "ict" as const,
          id: Number(verified.payload.id),
          name,
          email: String(verified.payload.email ?? ""),
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function currentStaff(preferredRole?: StaffRole | null) {
  if (preferredRole) return resolveStaffByRole(preferredRole);

  for (const role of ["guidance", "adviser", "principal", "ict"] as StaffRole[]) {
    const staff = await resolveStaffByRole(role);
    if (staff) return staff;
  }

  return null;
}

async function staffRecipients(current: NonNullable<Awaited<ReturnType<typeof currentStaff>>>) {
  const [advisers, guidanceRows, principals] = await Promise.all([
    supabase.from("advisers").select("id, first_name, middle_name, last_name, suffix, email, grade, section").eq("status", "active"),
    supabase.from("guidance_counselors").select("id, first_name, middle_name, last_name, suffix, email").eq("status", "active"),
    supabase.from("principals").select("id, first_name, middle_name, last_name, suffix, email").eq("is_active", true),
  ]);
  // A school may not have every staff module installed yet. Missing optional
  // staff tables should simply produce no recipients for that role.
  if (advisers.error && !isMissingTableError(advisers.error)) throw advisers.error;
  if (guidanceRows.error && !isMissingTableError(guidanceRows.error)) throw guidanceRows.error;
  if (principals.error && !isMissingTableError(principals.error)) throw principals.error;

  const recipients = [
    ...((principals.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: `principal:${row.id}`,
      type: "staff" as const,
      role: "Principal",
      name: fullName([row.first_name as string, row.middle_name as string | null, row.last_name as string, row.suffix as string | null]) || "Principal",
      email: String(row.email ?? ""),
    })),
    ...((advisers.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: `adviser:${row.id}`,
      type: "staff" as const,
      role: "Adviser",
      name: fullName([row.first_name as string, row.middle_name as string | null, row.last_name as string, row.suffix as string | null]) || "Adviser",
      email: String(row.email ?? ""),
      grade: String(row.grade ?? ""),
      section: String(row.section ?? ""),
    })),
    ...((guidanceRows.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: `guidance:${row.id}`,
      type: "staff" as const,
      role: "Guidance",
      name: fullName([row.first_name as string, row.middle_name as string | null, row.last_name as string, row.suffix as string | null]) || "Guidance Counselor",
      email: String(row.email ?? ""),
    })),
  ].filter((recipient) => !(recipient.id === `${current.type}:${current.id}`));

  return Array.from(new Map(recipients.map((recipient) => [recipient.id, recipient])).values());
}

async function parentRecipients() {
  const { data, error } = await supabase
    .from("parents")
    .select(`
      id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, student_id,
      students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
    `)
    .order("parent_last_name", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).flatMap((parent) => {
    const studentRaw = parent.students;
    const student = Array.isArray(studentRaw) ? studentRaw[0] : studentRaw;
    const row = student && typeof student === "object" ? student as Record<string, unknown> : {};
    const studentName = fullName([row.first_name as string, row.middle_name as string | null, row.last_name as string, row.suffix as string | null]);
    const actualParentName = fullName([
      parent.parent_first_name as string | null,
      parent.parent_middle_name as string | null,
      parent.parent_last_name as string | null,
      parent.parent_suffix as string | null,
    ]);
    const studentId = String(row.student_id ?? parent.student_id ?? "");
    return {
      id: `parent:${parent.id}:${studentId}`,
      type: "parent" as const,
      parentId: Number(parent.id),
      parentEmail: String(parent.email ?? ""),
      name: actualParentName || (studentName ? displayParentName(studentName) : "Registered Parent"),
      actualParentName: actualParentName || "Registered Parent",
      studentId,
      student: studentName || studentId || "No linked student",
      gradeLevel: String(row.grade ?? "").trim() || "No grade level",
      section: String(row.section ?? "").trim() || "No section",
    };
  }).filter((parent) => parent.parentEmail && parent.studentId);
}

function roleLabel(type: string) {
  if (type === "principal") return "Principal";
  if (type === "guidance") return "Guidance";
  if (type === "ict") return "ICT";
  return "Adviser";
}

export async function GET(req: NextRequest) {
  try {
    const current = await currentStaff(parseRole(req.nextUrl.searchParams.get("role")));
    if (!current) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const [recipients, parents, messagesResult] = await Promise.all([
      staffRecipients(current),
      current.type === "guidance" ? parentRecipients() : Promise.resolve([]),
      supabase
        .from("staff_messages")
        .select("*")
        .or(`and(sender_type.eq.${current.type},sender_id.eq.${current.id}),and(recipient_type.eq.${current.type},recipient_id.eq.${current.id})`)
        .order("created_at", { ascending: true }),
    ]);

    if (messagesResult.error && !isMissingTableError(messagesResult.error)) throw messagesResult.error;
    const rows = messagesResult.error ? [] : ((messagesResult.data ?? []) as Array<Record<string, unknown>>);
    const roots = rows.filter((row) => !Number(row.source_message_id));
    const conversations = roots.map((root) => {
      const rootId = Number(root.id);
      const replies = rows.filter((row) => Number(row.source_message_id) === rootId).sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
      const thread = [root, ...replies];
      const last = thread.at(-1) ?? root;
      const latestIncoming = last.recipient_type === current.type && Number(last.recipient_id) === current.id;
      const unread = latestIncoming && String(last.status ?? "") === "unread";
      const otherIsSender = root.sender_type !== current.type || Number(root.sender_id) !== current.id;
      const rootIsCurrentUser = root.sender_type === current.type && Number(root.sender_id) === current.id;
      return {
        id: Number(root.id),
        conversationId: `staff-message:${root.id}`,
        sender: roleLabel(String(otherIsSender ? root.sender_type : root.recipient_type)) as "Principal" | "Guidance" | "Adviser" | "ICT",
        sender_name: String(otherIsSender ? root.sender_name : root.recipient_name),
        sender_email: String(otherIsSender ? root.sender_email ?? "" : root.recipient_email ?? ""),
        message_sender: roleLabel(String(root.sender_type)),
        message_sender_name: String(root.sender_name ?? ""),
        message_sender_email: String(root.sender_email ?? ""),
        message_sender_is_current: rootIsCurrentUser,
        subject: String(root.subject ?? ""),
        message: String(root.body ?? ""),
        categories: Array.isArray(root.categories) ? root.categories.map(String) : [],
        attachments: cleanAttachments(root.attachments),
        sent_at: formatDate(String(root.created_at)),
        status: unread ? "New" as const : thread.length > 1 && !latestIncoming ? "Replied" as const : "Read" as const,
        priority: "Normal" as const,
        replies: replies.map((reply) => ({
          id: Number(reply.id),
          sender: reply.sender_type === current.type && Number(reply.sender_id) === current.id ? roleLabel(current.type) : roleLabel(String(reply.sender_type)),
          sender_name: String(reply.sender_name ?? ""),
          sender_email: String(reply.sender_email ?? ""),
          is_current_user: reply.sender_type === current.type && Number(reply.sender_id) === current.id,
          message: String(reply.body ?? ""),
          sent_at: formatDate(String(reply.created_at)),
          attachments: cleanAttachments(reply.attachments),
        })),
        sortAt: Date.parse(String(last.created_at ?? root.created_at)),
      };
    }).sort((a, b) => b.sortAt - a.sortAt);

    return NextResponse.json({ success: true, recipients, parents, messages: conversations });
  } catch (error: unknown) {
    const unavailable = isTransientConnectionError(error);
    (unavailable ? console.warn : console.error)("GET /api/reports/staff-messages error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: unavailable ? 503 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const current = await currentStaff(parseRole(payload?.role));
    if (!current) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { recipientId, conversationId, subject, categories, message, attachments } = payload;
    const trimmedSubject = String(subject ?? "").trim();
    const trimmedMessage = String(message ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);
    const selectedCategories = Array.isArray(categories) ? categories.map(String).filter(Boolean) : [];
    if (!recipientId || !trimmedSubject || selectedCategories.length === 0 || (!trimmedMessage && cleanedAttachments.length === 0)) {
      return NextResponse.json({ success: false, message: "Recipient, subject, category, and message or attachment are required." }, { status: 400 });
    }

    if (String(recipientId).startsWith("parent:")) {
      if (current.type !== "guidance") return NextResponse.json({ success: false, message: "Only Guidance can message parents from this route." }, { status: 403 });
      return sendGuidanceToParent({ current, recipientId: String(recipientId), subject: trimmedSubject, categories: selectedCategories, message: trimmedMessage, attachments: cleanedAttachments });
    }

    const [recipientType, rawRecipientId] = String(recipientId).split(":") as [StaffRole, string];
    if (!["adviser", "guidance", "principal"].includes(recipientType)) {
      return NextResponse.json({ success: false, message: "Invalid recipient." }, { status: 400 });
    }
    const recipients = await staffRecipients(current);
    const recipient = recipients.find((item) => item.id === `${recipientType}:${rawRecipientId}`);
    if (!recipient) return NextResponse.json({ success: false, message: "Recipient not found." }, { status: 404 });

    const sourceMessageId = String(conversationId ?? "").startsWith("staff-message:")
      ? Number(String(conversationId).replace("staff-message:", ""))
      : null;

    const { data: createdMessage, error } = await supabase.from("staff_messages").insert({
      sender_type: current.type,
      sender_id: current.id,
      sender_name: current.name,
      sender_email: current.email,
      recipient_type: recipientType,
      recipient_id: Number(rawRecipientId),
      recipient_name: recipient.name,
      recipient_email: recipient.email,
      subject: trimmedSubject,
      categories: selectedCategories,
      body: trimmedMessage,
      attachments: cleanedAttachments,
      source_message_id: sourceMessageId || null,
      status: "unread",
    }).select("*").single();
    if (error) throw error;

    if (recipient.email) {
      try {
        await sendStaffMessageEmail({
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          senderName: current.name,
          senderRole: roleLabel(current.type),
          subject: trimmedSubject,
          message: trimmedMessage,
          hasAttachments: cleanedAttachments.length > 0,
        });
      } catch (emailError) {
        // The message is already stored; a mail delivery problem must not make
        // the client retry and create a duplicate conversation.
        console.error("Staff message email notification failed:", emailError);
      }
    }

    return NextResponse.json({ success: true, message: createdMessage }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/reports/staff-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = await req.json();
    const current = await currentStaff(parseRole(payload?.role));
    if (!current) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { conversationId, status, reply, attachments } = payload;
    const rootId = String(conversationId ?? "").startsWith("staff-message:")
      ? Number(String(conversationId).replace("staff-message:", ""))
      : 0;
    const nextStatus = String(status ?? "").toLowerCase();
    const replyBody = String(reply ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);
    if (!rootId || !["read", "replied"].includes(nextStatus)) {
      return NextResponse.json({ success: false, message: "Valid conversation and status are required." }, { status: 400 });
    }

    const { data: root, error: rootError } = await supabase
      .from("staff_messages")
      .select("*")
      .eq("id", rootId)
      .limit(1)
      .maybeSingle();
    if (rootError) throw rootError;
    if (!root) return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });

    const isParticipant =
      (root.sender_type === current.type && Number(root.sender_id) === current.id) ||
      (root.recipient_type === current.type && Number(root.recipient_id) === current.id);
    if (!isParticipant) return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });

    if (replyBody || cleanedAttachments.length > 0) {
      const recipientType = root.sender_type === current.type && Number(root.sender_id) === current.id
        ? String(root.recipient_type)
        : String(root.sender_type);
      const recipientId = root.sender_type === current.type && Number(root.sender_id) === current.id
        ? Number(root.recipient_id)
        : Number(root.sender_id);
      const recipientName = root.sender_type === current.type && Number(root.sender_id) === current.id
        ? String(root.recipient_name ?? "")
        : String(root.sender_name ?? "");
      const recipientEmail = root.sender_type === current.type && Number(root.sender_id) === current.id
        ? String(root.recipient_email ?? "")
        : String(root.sender_email ?? "");

      const { data: createdMessage, error } = await supabase.from("staff_messages").insert({
        sender_type: current.type,
        sender_id: current.id,
        sender_name: current.name,
        sender_email: current.email,
        recipient_type: recipientType,
        recipient_id: recipientId,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        subject: root.subject,
        categories: root.categories ?? [],
        body: replyBody,
        attachments: cleanedAttachments,
        source_message_id: rootId,
        status: "unread",
      }).select("*").single();
      if (error) throw error;
      // Email notifications are intentionally disabled for replies.
      // Only new conversations (POST) trigger an email notification.
      return NextResponse.json({ success: true, message: createdMessage });
    } else {
      const now = new Date().toISOString();
      const { error: rootReadError } = await supabase
        .from("staff_messages")
        .update({ status: "read", updated_at: now })
        .eq("id", rootId)
        .eq("recipient_type", current.type)
        .eq("recipient_id", current.id)
        .eq("status", "unread");
      if (rootReadError) throw rootReadError;

      const { error: repliesReadError } = await supabase
        .from("staff_messages")
        .update({ status: "read", updated_at: now })
        .eq("source_message_id", rootId)
        .eq("recipient_type", current.type)
        .eq("recipient_id", current.id)
        .eq("status", "unread");
      if (repliesReadError) throw repliesReadError;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/staff-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

async function sendGuidanceToParent({
  current,
  recipientId,
  subject,
  categories,
  message,
  attachments,
}: {
  current: { type: "guidance"; id: number; name: string; email: string };
  recipientId: string;
  subject: string;
  categories: string[];
  message: string;
  attachments: MessageAttachment[];
}) {
  const [, rawParentId, studentId] = recipientId.split(":");
  const { data: parentRow, error } = await supabase
    .from("parents")
    .select(`
      id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, student_id,
      students ( student_id, first_name, middle_name, last_name, suffix, grade, section )
    `)
    .eq("id", Number(rawParentId))
    .eq("student_id", studentId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!parentRow) return NextResponse.json({ success: false, message: "Parent recipient not found." }, { status: 404 });

  const parent = parentRow as Record<string, unknown>;
  const studentRaw = parent.students;
  const student = ((Array.isArray(studentRaw) ? studentRaw[0] : studentRaw) ?? {}) as Record<string, unknown>;
  const studentName = fullName([student.first_name as string, student.middle_name as string | null, student.last_name as string, student.suffix as string | null]);
  const parentName = fullName([parent.parent_first_name as string | null, parent.parent_middle_name as string | null, parent.parent_last_name as string | null, parent.parent_suffix as string | null]) || displayParentName(studentName);
  const now = new Date().toISOString();

  const { data: report, error: reportError } = await supabase.from("parent_adviser_reports").insert({
    parent_id: Number(parent.id),
    parent_email: String(parent.email ?? ""),
    parent_name: parentName,
    adviser_id: null,
    adviser_name: current.name,
    student_id: String(student.student_id ?? parent.student_id ?? ""),
    student_name: studentName || String(parent.student_id ?? "No linked student"),
    grade: String(student.grade ?? "").trim() || "No grade level",
    section: String(student.section ?? "").trim() || "No section",
    subject,
    categories,
    concern_level: 50,
    status: "ongoing",
    escalated_to_guidance: false,
    escalated_to_principal: false,
    status_updated_at: now,
    updated_at: now,
    last_message_at: now,
  }).select("*").single();
  if (reportError) throw reportError;

  const { error: messageError } = await supabase.from("parent_adviser_report_messages").insert({
    report_id: report.id,
    sender_role: "guidance",
    sender_name: current.name,
    body: message,
    thread_type: "guidance",
    attachments,
    read_by_parent: false,
    read_by_adviser: true,
  });
  if (messageError) throw messageError;

  await sendGuidanceMessageEmail({
    recipientEmail: String(parent.email ?? ""),
    recipientName: parentName,
    recipientRole: "Parent",
    guidanceName: current.name,
    subject,
    message,
    hasAttachments: attachments.length > 0,
  });

  const messages = await listMessages([report.id]);
  return NextResponse.json({ success: true, report: toParentReport(report, messages.get(report.id) ?? []) }, { status: 201 });
}
