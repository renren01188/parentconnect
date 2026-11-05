import { after, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { sendStaffMessageEmail } from "@/lib/mailer";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
  getGuidanceSession,
  getParentSession,
  getPrincipalSession,
} from "../parent-adviser/_lib";

type StaffRole = "adviser" | "guidance" | "principal" | "ict";
type ParticipantRole = StaffRole | "parent";
type MessageAttachment = { name: string; type: string; size: number; dataUrl: string };

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

function errorMessage(error: unknown) {
  const databaseError = error as { code?: string; message?: string } | null;
  if (
    databaseError?.code === "23514" &&
    databaseError.message?.includes("staff_messages_recipient_type_check")
  ) {
    // This can only occur in an environment that has not deployed the
    // Parent-recipient constraint migration yet. Do not expose raw database
    // details to the sender, and do not retry the insert.
    return "Parent messaging is being set up. Please apply the latest database migration, then try again.";
  }
  if (
    databaseError?.code === "23514" &&
    databaseError.message?.includes("staff_messages_sender_type_check")
  ) {
    return "Parent conversation replies are being set up. Please apply the latest database migration, then try again.";
  }
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
    timeZone: "Asia/Manila",
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

function parseParticipantRole(value: unknown): ParticipantRole | null {
  return value === "parent" ? "parent" : parseRole(value);
}

function isIctContactRow(row: Record<string, unknown>, participantType: ParticipantRole) {
  const senderType = String(row.sender_type ?? "");
  const recipientType = String(row.recipient_type ?? "");
  return participantType !== "ict" && (
    (senderType === participantType && recipientType === "ict") ||
    (senderType === "ict" && recipientType === participantType)
  );
}

function rootIdFromConversationId(value: unknown) {
  const match = String(value ?? "").match(/^(?:staff-message|adviser-ict|guidance-ict|principal-ict):([1-9][0-9]*)$/);
  if (!match) return 0;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
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

async function currentParticipant(preferredRole?: ParticipantRole | null) {
  if (preferredRole === "parent") {
    const parent = await getParentSession();
    return parent ? { type: "parent" as const, ...parent } : null;
  }

  return currentStaff(preferredRole ?? null);
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
      name: fullName([row.first_name as string, row.middle_name as string | null, row.last_name as string, row.suffix as string | null]) || "Guidance",
      email: String(row.email ?? ""),
    })),
  ].filter((recipient) => !(recipient.id === `${current.type}:${current.id}`));

  return Array.from(new Map(recipients.map((recipient) => [recipient.id, recipient])).values());
}

function toParentRecipient(parent: Record<string, unknown>) {
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

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map(toParentRecipient)
    .filter((parent) => parent.parentEmail && parent.studentId);
}

async function findParentRecipient(parentId: number, studentId: string) {
  const { data, error } = await supabase
    .from("parents")
    .select(`
      id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, student_id,
      students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
    `)
    .eq("id", parentId)
    .eq("student_id", studentId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const recipient = toParentRecipient(data as Record<string, unknown>);
  return recipient.parentEmail && recipient.studentId ? recipient : null;
}

async function adviserMayMessageParent(parentId: number, studentId: string) {
  const adviser = await getAdviserFromToken();
  if (!adviser) return false;
  const sections = Array.isArray(adviser.sections) && adviser.sections.length > 0
    ? adviser.sections
    : adviser.section ? [adviser.section] : [];
  if (!adviser.grade || sections.length === 0) return false;
  const { data, error } = await supabase
    .from("parents")
    .select("id, students!inner ( student_id, grade, section )")
    .eq("id", parentId)
    .eq("students.student_id", studentId)
    .eq("students.grade", adviser.grade)
    .in("students.section", sections)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function roleLabel(type: string) {
  if (type === "parent") return "Parent";
  if (type === "principal") return "Principal";
  if (type === "guidance") return "Guidance";
  if (type === "ict") return "ICT";
  return "Adviser";
}

export async function GET(req: NextRequest) {
  try {
    const current = await currentParticipant(parseParticipantRole(req.nextUrl.searchParams.get("role")));
    if (!current) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    // Reports pages opt into this scoped feed. Contact ICT continues to use
    // its dedicated role-pair endpoints, so ICT threads never enter a Reports
    // panel or its count calculation.
    const excludeIctContact = req.nextUrl.searchParams.get("excludeIct") === "1";

    // Sidebar layouts need a fast, server-authorized unread count while the
    // user is elsewhere in the dashboard. Do not send thread bodies or
    // attachment data just to update a badge after a Realtime invalidation.
    if (req.nextUrl.searchParams.get("summary") === "1") {
      const seenAfter = Date.parse(req.nextUrl.searchParams.get("seenAfter") ?? "");
      let unreadQuery = supabase
        .from("staff_messages")
        .select("id, source_message_id")
        .eq("recipient_type", current.type)
        .eq("recipient_id", current.id)
        .eq("status", "unread");
      if (Number.isFinite(seenAfter)) {
        unreadQuery = unreadQuery.gt("created_at", new Date(seenAfter).toISOString());
      }
      const { data, error } = await unreadQuery;
      if (error && !isMissingTableError(error)) throw error;
      const unreadConversationIds = new Set((data ?? [])
        .map((row) => Number(row.source_message_id) || Number(row.id))
        .filter((id) => Number.isSafeInteger(id) && id > 0));
      return NextResponse.json({ success: true, unreadCount: unreadConversationIds.size });
    }

    // Parents can fetch only messages addressed to their own account.  This
    // endpoint is intentionally server-session authenticated; no browser RLS
    // policy is widened for the standalone-message inbox.
    if (current.type === "parent") {
      const { data, error } = await supabase
        .from("staff_messages")
        .select("*")
        // Parents can see a thread sent to them and their own replies in that
        // exact thread. The server still verifies the session before either
        // direction is returned.
        .or(`and(recipient_type.eq.parent,recipient_id.eq.${current.id}),and(sender_type.eq.parent,sender_id.eq.${current.id})`)
        .order("created_at", { ascending: true });
      if (error && !isMissingTableError(error)) throw error;

      const rows = error ? [] : ((data ?? []) as Array<Record<string, unknown>>);
      const roots = rows.filter((row) => !Number(row.source_message_id));
      const repliesByRootId = new Map<number, Array<Record<string, unknown>>>();
      for (const row of rows) {
        const rootId = Number(row.source_message_id);
        if (!rootId) continue;
        const replies = repliesByRootId.get(rootId) ?? [];
        replies.push(row);
        repliesByRootId.set(rootId, replies);
      }

      const messages = roots.map((root) => {
        const rootId = Number(root.id);
        const replies = (repliesByRootId.get(rootId) ?? [])
          .sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
        const thread = [root, ...replies];
        const last = thread.at(-1) ?? root;
        const unread =
          last.recipient_type === "parent" &&
          Number(last.recipient_id) === current.id &&
          String(last.status ?? "").toLowerCase() === "unread";
        return {
          id: rootId,
          conversationId: `staff-message:${rootId}`,
          senderRole: roleLabel(String(root.sender_type)),
          senderName: String(root.sender_name ?? "School Staff"),
          subject: String(root.subject ?? ""),
          message: String(root.body ?? ""),
          attachments: cleanAttachments(root.attachments),
          sentAt: formatDate(String(root.created_at)),
          unread,
          replies: replies.map((reply) => ({
            id: Number(reply.id),
            senderRole: roleLabel(String(reply.sender_type)),
            senderName: String(reply.sender_name ?? "School Staff"),
            message: String(reply.body ?? ""),
            attachments: cleanAttachments(reply.attachments),
            sentAt: formatDate(String(reply.created_at)),
          })),
          sortAt: Date.parse(String(last.created_at ?? root.created_at)),
        };
      }).sort((a, b) => b.sortAt - a.sortAt);

      return NextResponse.json({ success: true, recipients: [], parents: [], messages });
    }

    const [recipients, parents, messagesResult] = await Promise.all([
      staffRecipients(current),
      // Adviser and Principal recipient pickers retain their scoped legacy
      // queries.  Do not return the school-wide parent directory to them.
      current.type === "guidance" ? parentRecipients() : Promise.resolve([]),
      supabase
        .from("staff_messages")
        .select("*")
        .or(`and(sender_type.eq.${current.type},sender_id.eq.${current.id}),and(recipient_type.eq.${current.type},recipient_id.eq.${current.id})`)
        .order("created_at", { ascending: true }),
    ]);

    if (messagesResult.error && !isMissingTableError(messagesResult.error)) throw messagesResult.error;
    const allRows = messagesResult.error ? [] : ((messagesResult.data ?? []) as Array<Record<string, unknown>>);
    const rows = excludeIctContact
      ? allRows.filter((row) => !isIctContactRow(row, current.type))
      : allRows;
    const roots = rows.filter((row) => !Number(row.source_message_id));
    const repliesByRootId = new Map<number, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const rootId = Number(row.source_message_id);
      if (!rootId) continue;
      const replies = repliesByRootId.get(rootId) ?? [];
      replies.push(row);
      repliesByRootId.set(rootId, replies);
    }
    const conversations = roots.map((root) => {
      const rootId = Number(root.id);
      const replies = (repliesByRootId.get(rootId) ?? []).sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
      const thread = [root, ...replies];
      const last = thread.at(-1) ?? root;
      const latestIncoming = last.recipient_type === current.type && Number(last.recipient_id) === current.id;
      const latestOutgoing = last.sender_type === current.type && Number(last.sender_id) === current.id;
      const unread = latestIncoming && String(last.status ?? "") === "unread";
      const otherIsSender = root.sender_type !== current.type || Number(root.sender_id) !== current.id;
      const rootIsCurrentUser = root.sender_type === current.type && Number(root.sender_id) === current.id;
      const latestIsCurrentUser = latestOutgoing;
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
        // The thread root remains available for the detail view. Inbox cards
        // use these explicit latest-row fields so a reply never shows stale
        // content or the wrong sender.
        latest_message: String(last.body ?? ""),
        latest_sender: roleLabel(String(last.sender_type)),
        latest_sender_name: String(last.sender_name ?? ""),
        latest_sender_is_current: latestIsCurrentUser,
        latest_sent_at: formatDate(String(last.created_at ?? root.created_at)),
        latest_created_at: String(last.created_at ?? root.created_at),
        // Direct staff conversations are independent from report workflow
        // state. An outgoing final message is "Sent", never "Replied".
        status: unread ? "New" as const : latestOutgoing ? "Sent" as const : "Read" as const,
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

    const { recipientId, conversationId, subject, message, attachments } = payload;
    const trimmedSubject = String(subject ?? "").trim();
    const trimmedMessage = String(message ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);
    if (!recipientId || !trimmedSubject || (!trimmedMessage && cleanedAttachments.length === 0)) {
      return NextResponse.json({ success: false, message: "Recipient, subject, and message or attachment are required." }, { status: 400 });
    }

    if (String(recipientId).startsWith("parent:")) {
      const [, rawParentId, studentId] = String(recipientId).split(":");
      const parentId = Number(rawParentId);
      if (!Number.isSafeInteger(parentId) || parentId < 1 || !studentId) {
        return NextResponse.json({ success: false, message: "Parent recipient not found." }, { status: 404 });
      }
      // Look up the chosen parent only. Re-reading the entire school parent
      // directory before every send made the send path slower than the write.
      const recipient = await findParentRecipient(parentId, studentId);
      if (!recipient) return NextResponse.json({ success: false, message: "Parent recipient not found." }, { status: 404 });
      if (current.type === "adviser" && !await adviserMayMessageParent(recipient.parentId, recipient.studentId)) {
        // Do not reveal whether an out-of-class parent exists.
        return NextResponse.json({ success: false, message: "Parent recipient not found." }, { status: 404 });
      }

      const { data: createdMessage, error } = await supabase.from("staff_messages").insert({
        sender_type: current.type,
        sender_id: current.id,
        sender_name: current.name,
        sender_email: current.email,
        recipient_type: "parent",
        recipient_id: recipient.parentId,
        recipient_name: recipient.actualParentName,
        recipient_email: recipient.parentEmail,
        subject: trimmedSubject,
        // The legacy table makes categories non-null.  This internal marker is
        // never shown as a concern category and never creates a report.
        categories: ["Message"],
        body: trimmedMessage,
        attachments: cleanedAttachments,
        source_message_id: null,
        status: "unread",
      }).select("*").single();
      if (error) throw error;

      // Broadcast the small, data-free invalidation while this request is
      // still alive. Deferring it with after() made local/dev sends succeed
      // without reliably waking an already-open Parent Reports inbox.
      await publishRealtimeInvalidation([
        { role: current.type, id: current.id },
        { role: "parent", id: recipient.parentId },
      ], {
        scope: "staff-messages",
        kind: "message",
        conversationId: `staff-message:${Number(createdMessage.id)}`,
        messageId: Number(createdMessage.id),
      });

      // Email is independent of the durable message and the live UI signal.
      // It remains post-response so a slow mail provider cannot block send.
      if (recipient.parentEmail) after(async () => {
        try {
          await sendStaffMessageEmail({
            recipientEmail: recipient.parentEmail,
            recipientName: recipient.actualParentName,
            senderName: current.name,
            senderRole: roleLabel(current.type),
            subject: trimmedSubject,
            message: trimmedMessage,
            hasAttachments: cleanedAttachments.length > 0,
          });
        } catch (error) {
          console.error("Staff message email delivery failed:", error);
        }
      });
      return NextResponse.json({ success: true, message: createdMessage }, { status: 201 });
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
      categories: ["Message"],
      body: trimmedMessage,
      attachments: cleanedAttachments,
      source_message_id: sourceMessageId || null,
      status: "unread",
    }).select("*").single();
    if (error) throw error;

    // The recipient's open message list must be refreshed immediately after
    // its saved row is committed. Keep this live signal on the response path;
    // publishRealtimeInvalidation handles delivery failures without failing
    // the stored message.
    await publishRealtimeInvalidation([
      { role: current.type, id: current.id },
      { role: recipientType, id: Number(rawRecipientId) },
    ], {
      scope: "staff-messages",
      kind: "message",
      conversationId: `staff-message:${sourceMessageId || Number(createdMessage.id)}`,
      messageId: Number(createdMessage.id),
    });

    if (recipient.email) after(async () => {
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
      } catch (error) {
        console.error("Staff message email delivery failed:", error);
      }
    });

    return NextResponse.json({ success: true, message: createdMessage }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/reports/staff-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
export async function PATCH(req: NextRequest) {
  try {
    const payload = await req.json();
    const current = await currentParticipant(parseParticipantRole(payload?.role));
    if (!current) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { conversationId, status, reply, attachments } = payload;
    const rootId = rootIdFromConversationId(conversationId);
    const nextStatus = String(status ?? "").toLowerCase();
    const replyBody = String(reply ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);
    if (!rootId || !["read", "replied", "typing"].includes(nextStatus)) {
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

    if (nextStatus === "typing") {
      const active = payload?.active;
      const actorKey = typeof payload?.actorKey === "string" ? payload.actorKey : "";
      if (typeof active !== "boolean" || !/^[a-zA-Z0-9-]{16,128}$/.test(actorKey)) {
        return NextResponse.json({ success: false, message: "Invalid typing event." }, { status: 400 });
      }

      // This never writes a row. The root lookup above proves that the caller
      // is one of the two saved participants before its opaque conversation
      // key is broadcast to those same participants only.
      const recipients: Array<{ role: ParticipantRole; id: number }> = [];
      const senderRole = parseParticipantRole(root.sender_type);
      const recipientRole = parseParticipantRole(root.recipient_type);
      const senderId = Number(root.sender_id);
      const recipientId = Number(root.recipient_id);
      if (senderRole && Number.isSafeInteger(senderId) && senderId > 0) {
        recipients.push({ role: senderRole, id: senderId });
      }
      if (recipientRole && Number.isSafeInteger(recipientId) && recipientId > 0) {
        recipients.push({ role: recipientRole, id: recipientId });
      }
      await publishRealtimeInvalidation(recipients, {
        scope: "staff-messages",
        kind: "typing",
        // Older Contact ICT tabs used route-specific keys such as
        // `adviser-ict:123`. Re-broadcast the one canonical saved-root key so
        // a current ICT Inbox, which uses `staff-message:123`, receives the
        // typing state immediately during and after a rolling deployment.
        conversationId: `staff-message:${rootId}`,
        actorKey,
        active,
      });
      return NextResponse.json({ success: true });
    }

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
        // A Principal follow-up can be tied to a resolved report without
        // becoming a parent_adviser_report_message. Preserve that optional
        // link on Parent replies so its separate School Messages thread stays
        // visible in the Principal's report-level message panel.
        report_id: Number(root.report_id) || null,
        status: "unread",
      }).select("*").single();
      if (error) throw error;

      // A reply acknowledges every inbound message in its own conversation.
      // This is inbox/read state only; direct conversations never inherit a
      // report workflow status merely because someone responded.
      const now = new Date().toISOString();
      const [{ error: rootReadError }, { error: repliesReadError }] = await Promise.all([
        supabase.from("staff_messages")
          .update({ status: "read", updated_at: now })
          .eq("id", rootId)
          .eq("recipient_type", current.type)
          .eq("recipient_id", current.id)
          .eq("status", "unread"),
        supabase.from("staff_messages")
          .update({ status: "read", updated_at: now })
          .eq("source_message_id", rootId)
          .eq("recipient_type", current.type)
          .eq("recipient_id", current.id)
          .eq("status", "unread"),
      ]);
      if (rootReadError) throw rootReadError;
      if (repliesReadError) throw repliesReadError;

      // Email notifications are intentionally disabled for replies.
      // Only new conversations (POST) trigger an email notification.
      await publishRealtimeInvalidation([
        { role: current.type, id: current.id },
        { role: recipientType as ParticipantRole, id: recipientId },
      ], {
        scope: "staff-messages",
        kind: "message",
        conversationId: `staff-message:${rootId}`,
        messageId: Number(createdMessage.id),
      });
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

      const recipients: Array<{ role: ParticipantRole; id: number }> = [
        { role: current.type, id: current.id },
      ];
      const senderRole = parseParticipantRole(root.sender_type);
      const recipientRole = parseParticipantRole(root.recipient_type);
      const senderId = Number(root.sender_id);
      const recipientId = Number(root.recipient_id);
      if (senderRole && Number.isSafeInteger(senderId) && senderId > 0) {
        recipients.push({ role: senderRole, id: senderId });
      }
      if (recipientRole && Number.isSafeInteger(recipientId) && recipientId > 0) {
        recipients.push({ role: recipientRole, id: recipientId });
      }
      // A read acknowledgement is persisted conversation state. Notify only
      // its verified participants so open sidebar counts update in place.
      await publishRealtimeInvalidation(recipients, "staff-messages");
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/staff-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
