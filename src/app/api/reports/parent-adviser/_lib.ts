import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { hasUnreadForPrincipal as hasUnreadPrincipalReport } from "@/lib/principalReportReadState.cjs";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

const MESSAGE_SELECT = [
  "id",
  "report_id",
  "sender_role",
  "sender_name",
  "body",
  "thread_type",
  "attachments",
  "created_at",
  "read_by_parent",
  "read_by_adviser",
].join(", ");
const MESSAGE_REPORT_ID_CHUNK_SIZE = 25;

export type ReportRow = {
  id: number;
  parent_id: number | null;
  parent_email: string;
  parent_name: string;
  adviser_id: number | null;
  adviser_name: string;
  student_id: string;
  student_name: string;
  grade: string | null;
  section: string | null;
  subject: string;
  categories: string[];
  concern_level: number;
  allow_history_access?: boolean | null;
  status: string;
  escalated_to_guidance: boolean;
  escalated_to_principal?: boolean | null;
  guidance_seen_at?: string | null;
  parent_seen_at: string | null;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export type MessageRow = {
  id: number;
  report_id: number;
  sender_role: "parent" | "adviser" | "principal" | "guidance" | "subject_teacher";
  sender_name: string;
  body: string;
  thread_type?: "adviser" | "guidance" | "principal" | null;
  attachments?: MessageAttachment[] | null;
  created_at: string;
  read_by_parent: boolean;
  read_by_adviser: boolean;
};

export type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type GuidanceTicketRow = {
  id: number;
  report_id: number;
  parent_id: number;
  student_id: string;
  adviser_id: number | null;
  concern: string;
  message: string;
  attachments?: MessageAttachment[] | null;
  status: "pending" | "accepted" | "rejected";
  rejection_reason?: string | null;
  assigned_guidance_id?: number | null;
  created_at: string;
  decided_at?: string | null;
};

function attachmentsFromRow(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    const type = typeof record.type === "string" ? record.type : "application/octet-stream";
    const size = typeof record.size === "number" ? record.size : 0;
    const dataUrl = typeof record.dataUrl === "string" ? record.dataUrl : "";
    return name && dataUrl ? [{ name, type, size, dataUrl }] : [];
  });
}

export async function getParentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("parent_token")?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    const payload = verified.payload;
    if (payload.role !== "parent") return null;

    const id = Number(payload.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const { data: parent } = await supabase
      .from("parents")
      .select("email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, status, archive_status")
      .eq("id", id)
      .maybeSingle();
    if (!parent || !parentAccountCanAccess(parent)) return null;
    const currentName = [
      parent.parent_first_name,
      parent.parent_middle_name,
      parent.parent_last_name,
      parent.parent_suffix,
    ].filter(Boolean).join(" ").trim();
    return {
      id,
      email: parent.email ?? "",
      name: currentName || "Parent",
    };
  } catch {
    return null;
  }
}

export async function getReportForParent(id: number, parentId: number) {
  const linkedStudentIds = await getLinkedStudentIds(parentId);
  if (linkedStudentIds.length === 0) return null;

  const { data, error } = await supabase
    .from("parent_adviser_reports")
    .select("*")
    .eq("id", id)
    .eq("parent_id", parentId)
    .in("student_id", linkedStudentIds)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as ReportRow | null;
}

export async function getLinkedStudentIds(parentId: number) {
  const { data, error } = await supabase
    .from("parent_student_links")
    .select("student_id")
    .eq("parent_id", parentId);
  if (error) throw error;
  return [...new Set((data ?? []).map((link) => String(link.student_id)).filter(Boolean))];
}

export async function getReportForAdviser(id: number, adviserId: number) {
  const { data, error } = await supabase
    .from("parent_adviser_reports")
    .select("*")
    .eq("id", id)
    .eq("adviser_id", adviserId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as ReportRow | null;
}

export function parentReportStatus(status: string): "Pending" | "In Review" | "Resolved" | "Escalated" {
  if (status === "resolved") return "Resolved";
  if (status === "escalated") return "Escalated";
  if (status === "ongoing" || status === "read") return "In Review";
  return "Pending";
}

export function adviserReportStatus(status: string): "New" | "Read" | "Ongoing" | "Resolved" | "Escalated" {
  if (status === "resolved") return "Resolved";
  if (status === "escalated") return "Escalated";
  if (status === "ongoing") return "Ongoing";
  if (status === "read") return "Read";
  return "New";
}

export function statusFromAdviser(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "resolved") return "resolved";
  if (normalized === "escalated") return "escalated";
  if (normalized === "ongoing") return "ongoing";
  if (normalized === "read") return "read";
  return "new";
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

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function toParentReport(row: ReportRow, messages: MessageRow[], ticket?: GuidanceTicketRow | null) {
  const isResolved = row.status === "resolved";
  const isPrincipalConversation = Boolean(row.escalated_to_principal) || messages.some((msg) => msg.sender_role === "principal");
  const hasOriginalReportStatus = row.adviser_id !== null && row.adviser_id !== 0;
  const isGuidanceConversation = ticket?.status === "accepted" || row.escalated_to_guidance || messages.some((msg) => msg.sender_role === "guidance");
  const visibleMessages = messages;
  const lastMessage = visibleMessages.at(-1) ?? messages.at(-1);
  const hasUnreadStaffMessage = visibleMessages.some((msg) =>
    (msg.sender_role === "adviser" || msg.sender_role === "principal" || msg.sender_role === "guidance" || msg.sender_role === "subject_teacher") && !msg.read_by_parent
  );
  const unread = !isResolved && hasUnreadStaffMessage;
  const guidanceName = visibleMessages.find((msg) => msg.sender_role === "guidance")?.sender_name || "Guidance Counselor";
  const principalName = visibleMessages.find((msg) => msg.sender_role === "principal")?.sender_name || "Principal";
  const guidanceHasReplied = visibleMessages.some((msg) => msg.sender_role === "guidance");
  const hasParentReplyAfter = (timestamp?: string | null) => {
    const handoffTime = Date.parse(timestamp ?? "");
    return Number.isFinite(handoffTime) && visibleMessages.some((msg) =>
      msg.sender_role === "parent" && Date.parse(msg.created_at) > handoffTime
    );
  };
  const recipientName = isPrincipalConversation ? principalName : isGuidanceConversation ? guidanceName : row.adviser_name;
  const subjectTeacherOpeningMessage = messages.find((msg) => msg.sender_role === "subject_teacher");

  return {
    id: row.id,
    recipientName,
    recipientRole: isPrincipalConversation ? "Principal" : isGuidanceConversation ? "Guidance" : "Class Adviser",
    recipientInitials: initials(recipientName),
    recipientColor: isPrincipalConversation ? "#7c3aed" : isGuidanceConversation ? "#0ea5e9" : "#f59e0b",
    subject: row.subject,
    preview: lastMessage?.body?.slice(0, 80) || "",
    status: isResolved ? "Resolved" : unread ? "Unread" : "Pending Response",
    reportStatus: hasOriginalReportStatus ? parentReportStatus(row.status) : null,
    hasReportStatus: hasOriginalReportStatus,
    time: timeAgo(row.last_message_at || row.created_at),
    unread,
    grade: row.grade ?? "",
    section: row.section ?? "",
    studentName: row.student_name,
    submittedByName: subjectTeacherOpeningMessage?.sender_name,
    submittedByRole: subjectTeacherOpeningMessage ? "Subject Teacher" : undefined,
    submittedAt: subjectTeacherOpeningMessage ? formatDate(subjectTeacherOpeningMessage.created_at) : undefined,
    messages: visibleMessages.map((msg) => {
      const senderRole = String(msg.sender_role).trim().toLowerCase();
      const isStaffMessage = senderRole === "adviser" || senderRole === "principal" || senderRole === "guidance" || senderRole === "subject_teacher";

      return {
        id: msg.id,
        sender: isStaffMessage ? "staff" : "parent",
        senderName: isStaffMessage ? msg.sender_name || recipientName : "You",
        timestamp: formatDate(msg.created_at),
        text: msg.body,
        threadType: messageThreadType(row, messages, msg),
        attachments: attachmentsFromRow(msg.attachments),
      };
    }),
    categories: row.categories ?? [],
    concernLevel: row.concern_level ?? 0,
    escalatedToGuidance: row.escalated_to_guidance,
    escalatedToPrincipal: Boolean(row.escalated_to_principal),
    guidanceHasReplied,
    parentRepliedAfterPrincipalEscalation: Boolean(row.escalated_to_principal) && hasParentReplyAfter(row.status_updated_at),
    parentRepliedAfterAcceptedGuidanceTicket: ticket?.status === "accepted" && hasParentReplyAfter(ticket.decided_at),
    allowHistoryAccess: row.allow_history_access,
    ticketId: ticket?.id ?? null,
    ticketStatus: ticket?.status ?? null,
    ticketRejectionReason: ticket?.rejection_reason ?? null,
  };
}

export function toAdviserReport(row: ReportRow, messages: MessageRow[], ticket?: GuidanceTicketRow | null) {
  // Parent-created reports begin with a parent message, which is rendered as
  // the report body instead of a chat reply. Student Reports begin with an
  // adviser message, so the parent's first message is a real reply and must
  // remain in the Adviser ↔ Parent conversation.
  const openingMessage = messages[0] && (messages[0].sender_role === "parent" || messages[0].sender_role === "subject_teacher") ? messages[0] : undefined;
  const isResolved = row.status === "resolved";
  const adviserMessages = adviserThreadMessages(row, messages, { includeInitialParent: false });
  const hasUnreadForAdviser = !isResolved && row.status !== "ongoing" && messages.some((msg) =>
    (msg.sender_role === "parent" || msg.sender_role === "subject_teacher") &&
    !msg.read_by_adviser &&
    // Don't count parent messages after Guidance entered — those are Guidance-thread messages
    messageThreadType(row, messages, msg) === "adviser"
  );
  // Only include messages in the Adviser↔Parent thread.
  // Once escalated to Guidance, any message where the parent is replying
  // after a Guidance message belongs to the Guidance↔Parent thread — hide it.
  const firstGuidanceMessage = undefined;
  const guidanceCutoffId = null;
  void firstGuidanceMessage;

  const legacyAdviserThreadMessages = messages.filter((msg) => {
    // Always exclude Guidance messages from the adviser thread
    if (msg.sender_role === "guidance") return false;
    // Exclude the opening parent message (shown separately as report.message)
    if (openingMessage && msg.id === openingMessage.id) return false;
    // If Guidance has entered the thread, exclude any parent messages
    // that came AFTER the first Guidance message — those belong to
    // the Guidance↔Parent thread, not the Adviser↔Parent thread.
    if (guidanceCutoffId !== null && msg.sender_role === "parent" && msg.id > guidanceCutoffId) return false;
    return true;
  });

  void legacyAdviserThreadMessages;
  const replies = adviserMessages.map((msg) => ({
    sender: msg.sender_role === "adviser" ? "Adviser" : msg.sender_role === "principal" ? "Principal" : msg.sender_role === "subject_teacher" ? "Subject Teacher" : row.parent_name,
    message: msg.body,
    sent_at: formatDate(msg.created_at),
    attachments: attachmentsFromRow(msg.attachments),
  }));

  return {
    id: row.id,
    parent_name: row.parent_name,
    student_name: row.student_name,
    grade: row.grade ?? "",
    section: row.section ?? "",
    category: categoryForAdviser(row.categories?.[0]),
    subject: row.subject,
    message: openingMessage?.body ?? "",
    attachments: attachmentsFromRow(openingMessage?.attachments),
    submitted_by_name: openingMessage?.sender_role === "subject_teacher" ? openingMessage.sender_name : undefined,
    submitted_by_role: openingMessage?.sender_role === "subject_teacher" ? "Subject Teacher" : undefined,
    submitted_at: formatDate(row.created_at),
    status: adviserReportStatus(row.status),
    resolvedByGuidance: row.status === "resolved" && row.escalated_to_guidance && !row.escalated_to_principal,
    resolvedByPrincipal: row.status === "resolved" && Boolean(row.escalated_to_principal),
    guidanceSeen: Boolean(row.guidance_seen_at),
    categories: row.categories ?? [],
    concernLevel: row.concern_level ?? 0,
    escalatedToGuidance: row.escalated_to_guidance,
    escalatedToPrincipal: Boolean(row.escalated_to_principal),
    hasUnreadForAdviser,
    replies,
    ticketId: ticket?.id ?? null,
    ticketStatus: ticket?.status ?? null,
    ticketRejectionReason: ticket?.rejection_reason ?? null,
  };
}

type ReportThread = "adviser" | "guidance" | "principal";

function explicitThreadType(value: unknown): ReportThread | null {
  return value === "adviser" || value === "guidance" || value === "principal" ? value : null;
}

function messageThreadType(row: ReportRow, messages: MessageRow[], message: MessageRow): ReportThread {
  const explicit = explicitThreadType(message.thread_type);
  if (explicit) return explicit;
  if (message.sender_role === "principal") return "principal";
  if (message.sender_role === "guidance") return "guidance";
  if (message.sender_role === "adviser") return "adviser";

  const firstPrincipalMessage = messages.find((msg) => msg.sender_role === "principal");
  if (firstPrincipalMessage && message.id > firstPrincipalMessage.id) return "principal";

  const firstGuidanceMessage = messages.find((msg) => msg.sender_role === "guidance");
  if (firstGuidanceMessage && message.id > firstGuidanceMessage.id) return "guidance";

  void row;
  return "adviser";
}

function adviserThreadMessages(row: ReportRow, messages: MessageRow[], options: { includeInitialParent: boolean }) {
  const initialParentMessage = messages[0] && (messages[0].sender_role === "parent" || messages[0].sender_role === "subject_teacher") ? messages[0] : undefined;
  return messages.filter((msg) => {
    if (!options.includeInitialParent && initialParentMessage && msg.id === initialParentMessage.id) return false;
    return messageThreadType(row, messages, msg) === "adviser";
  });
}

function guidanceThreadMessages(row: ReportRow, messages: MessageRow[]) {
  const firstParentMessage = messages.find((msg) => msg.sender_role === "parent");
  const firstGuidanceMessage = messages.find((msg) => msg.sender_role === "guidance");
  const lastAdviserOrPrincipalMessage = messages.filter((msg) => msg.sender_role === "adviser" || msg.sender_role === "principal").at(-1);
  const cutoffMessage = firstGuidanceMessage ?? lastAdviserOrPrincipalMessage ?? firstParentMessage ?? null;
  const cutoffId = cutoffMessage?.id ?? 0;
  const cutoffTime = cutoffMessage ? Date.parse(cutoffMessage.created_at) : 0;

  return messages.filter((msg) => {
    const explicit = explicitThreadType(msg.thread_type);
    if (explicit) return explicit === "guidance";
    if (msg.sender_role === "principal") return false;
    if (msg.sender_role === "guidance") return true;
    if (msg.sender_role !== "parent") return false;
    const messageTime = Date.parse(msg.created_at);
    return msg.id > cutoffId || (cutoffTime > 0 && messageTime > cutoffTime);
  });
}

function principalThreadMessages(row: ReportRow, messages: MessageRow[]) {
  // Principal monitoring is read-only until Guidance escalates the report;
  // the report confirmation now records consent for the complete history.
  void row;
  return messages;
}

export function unreadGuidanceMessageIds(row: ReportRow, messages: MessageRow[]) {
  if (row.status === "resolved") return [];
  return guidanceThreadMessages(row, messages)
    .filter((msg) => msg.sender_role === "parent" && !msg.read_by_adviser)
    .map((msg) => msg.id);
}

export function toGuidanceReport(row: ReportRow, messages: MessageRow[], ticket?: GuidanceTicketRow | null) {
  const firstParentMessage = messages.find((msg) => msg.sender_role === "parent");
  const firstGuidanceMessage = messages.find((msg) => msg.sender_role === "guidance");
  const threadMessages = guidanceThreadMessages(row, messages);
  const hasUnreadForGuidance = unreadGuidanceMessageIds(row, messages).length > 0;
  const isResolved = row.status === "resolved";

  return {
    id: row.id,
    parent_name: row.parent_name,
    student_name: row.student_name,
    category: categoryForAdviser(row.categories?.[0]),
    subject: row.subject,
    message: firstParentMessage?.body ?? firstGuidanceMessage?.body ?? "",
    attachments: attachmentsFromRow(firstParentMessage?.attachments ?? firstGuidanceMessage?.attachments),
    submitted_at: formatDate(row.created_at),
    status: isResolved ? "Resolved" as const : hasUnreadForGuidance ? "New" as const : adviserReportStatus(row.status),
    resolvedByGuidance: row.status === "resolved" && row.escalated_to_guidance,
    guidanceSeen: Boolean(row.guidance_seen_at),
    categories: row.categories ?? [],
    concernLevel: row.concern_level ?? 0,
    escalatedToGuidance: row.escalated_to_guidance,
    escalatedToPrincipal: Boolean(row.escalated_to_principal),
    hasUnreadForGuidance,
    replies: threadMessages.map((msg) => ({
      sender: msg.sender_role === "guidance" ? "Guidance" : row.parent_name,
      message: msg.body,
      sent_at: formatDate(msg.created_at),
      attachments: attachmentsFromRow(msg.attachments),
    })),
    ticketId: ticket?.id ?? null,
    ticketStatus: ticket?.status ?? null,
    ticketRejectionReason: ticket?.rejection_reason ?? null,
  };
}

export function toPrincipalReport(row: ReportRow, messages: MessageRow[], ticket?: GuidanceTicketRow | null, principalHasRead = false) {
  const firstParentMessage = messages.find((msg) => msg.sender_role === "parent");
  const threadMessages = principalThreadMessages(row, messages);
  const isResolved = row.status === "resolved";
  const hasUnreadForPrincipal = hasUnreadPrincipalReport({
    status: row.status,
    principalHasRead,
    messages: threadMessages,
  });

  return {
    id: row.id,
    parent_id: row.parent_id,
    student_id: row.student_id,
    parent_name: row.parent_name,
    student_name: row.student_name,
    category: categoryForAdviser(row.categories?.[0]),
    subject: row.subject,
    message: firstParentMessage?.body ?? "",
    attachments: attachmentsFromRow(firstParentMessage?.attachments),
    submitted_at: formatDate(row.created_at),
    status: isResolved ? "Resolved" as const : hasUnreadForPrincipal ? "New" as const : adviserReportStatus(row.status),
    resolvedByGuidance: row.status === "resolved" && row.escalated_to_guidance,
    guidanceSeen: Boolean(row.guidance_seen_at),
    categories: row.categories ?? [],
    concernLevel: row.concern_level ?? 0,
    escalatedToGuidance: row.escalated_to_guidance,
    escalatedToPrincipal: Boolean(row.escalated_to_principal),
    hasUnreadForAdviser: false,
    hasUnreadForGuidance: false,
    hasUnreadForPrincipal,
    // This is Principal-specific and comes from principal_notification_reads.
    // It survives page refreshes and distinguishes a new handoff from an
    // already viewed Principal report.
    principalHasRead,
    canReply: Boolean(row.escalated_to_principal),
    ticketId: ticket?.id ?? null,
    ticketStatus: ticket?.status ?? null,
    ticketRejectionReason: ticket?.rejection_reason ?? null,
    replies: threadMessages.map((msg) => ({
      sender: msg.sender_role === "principal" ? "Principal" : msg.sender_role === "adviser" ? "Class Adviser" : msg.sender_role === "guidance" ? "Guidance Counselor" : row.parent_name,
      senderName: msg.sender_role === "parent" ? row.parent_name : (msg.sender_name || "Staff Member"),
      senderRole: msg.sender_role,
      message: msg.body,
      sent_at: formatDate(msg.created_at),
      attachments: attachmentsFromRow(msg.attachments),
    })),
  };
}

export async function listGuidanceTickets(reportIds: number[]) {
  const ids = [...new Set(reportIds.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return new Map<number, GuidanceTicketRow>();
  const { data, error } = await supabase
    .from("parent_report_guidance_tickets")
    .select("id, report_id, parent_id, student_id, adviser_id, concern, message, attachments, status, rejection_reason, assigned_guidance_id, created_at, decided_at")
    .in("report_id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as GuidanceTicketRow[]).map((ticket) => [ticket.report_id, ticket]));
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part?.[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

function categoryForAdviser(category?: string) {
  if (category === "Academic Concern") return "Academic Concern";
  if (category === "Health/Medical" || category === "Attendance") return "Absence Excuse";
  if (category === "Behavioral Issue") return "Behavioral";
  if (category === "Permission Request") return "Request";
  return "Other";
}

export async function listMessages(reportIds: number[]) {
  const uniqueReportIds = [...new Set(reportIds.filter((id) => Number.isFinite(id)))];
  if (uniqueReportIds.length === 0) return new Map<number, MessageRow[]>();

  const rows: MessageRow[] = [];
  for (let index = 0; index < uniqueReportIds.length; index += MESSAGE_REPORT_ID_CHUNK_SIZE) {
    const chunk = uniqueReportIds.slice(index, index + MESSAGE_REPORT_ID_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("parent_adviser_report_messages")
      .select(MESSAGE_SELECT)
      .in("report_id", chunk)
      .order("report_id", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    rows.push(...((data ?? []) as unknown as MessageRow[]));
  }

  const map = new Map<number, MessageRow[]>();
  for (const msg of rows) {
    const current = map.get(msg.report_id) ?? [];
    current.push(msg);
    map.set(msg.report_id, current);
  }
  return map;
}

export async function getAdviserSession() {
  return getAdviserFromToken();
}

export async function getPrincipalSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("principal_token")?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    if (verified.payload.role !== "principal") return null;
    const principalId = Number(verified.payload.id);
    const { data: principal } = await supabase.from("principals").select("status, archive_status, is_active, auth_version").eq("id", principalId).maybeSingle();
    if (!principal || principal.archive_status === "archived" || principal.status !== "active" || !principal.is_active
      || principal.auth_version !== verified.payload.authVersion) return null;
    return {
      id: principalId,
      name: [
        typeof verified.payload.first_name === "string" ? verified.payload.first_name : "",
        typeof verified.payload.middle_name === "string" ? verified.payload.middle_name : "",
        typeof verified.payload.last_name === "string" ? verified.payload.last_name : "",
        typeof verified.payload.suffix === "string" ? verified.payload.suffix : "",
      ].filter(Boolean).join(" ") || "Principal",
    };
  } catch {
    return null;
  }
}

export async function getGuidanceSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("guidance_token")?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    if (verified.payload.role !== "guidance") return null;
    const id = Number(verified.payload.id);
    const { data } = await supabase
      .from("guidance_counselors")
      .select("first_name, middle_name, last_name, suffix, email, status, archive_status")
      .eq("id", id)
      .maybeSingle();
    if (!data || data.status !== "active" || data.archive_status === "archived") return null;
    return {
      id,
      name: [data.first_name, data.middle_name, data.last_name, data.suffix].filter(Boolean).join(" ") || "Guidance Counselor",
      email: String(data.email ?? ""),
    };
  } catch {
    return null;
  }
}
