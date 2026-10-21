import { after, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { sendPrincipalParentMessageEmail, sendPrincipalStaffMessageEmail } from "@/lib/mailer";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

type PrincipalSession = {
  id: number;
  name: string;
  email: string;
};

type StudentRow = {
  student_id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  grade?: string | null;
  section?: string | null;
};

type ParentRow = {
  id: number;
  email: string;
  parent_first_name?: string | null;
  parent_middle_name?: string | null;
  parent_last_name?: string | null;
  parent_suffix?: string | null;
  student_id: string;
  students: StudentRow | StudentRow[];
};

type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

type ThreadMessage = {
  id: string;
  sender: "them" | "principal";
  body: string;
  sentAt: string;
  attachments: MessageAttachment[];
  createdAt: number;
};

type ParentReportRow = {
  id: number;
  parent_id: number | null;
  parent_email: string;
  parent_name: string;
  student_id: string;
  student_name: string;
  grade: string | null;
  section: string | null;
  subject: string;
  categories: string[];
  created_at: string;
  updated_at?: string | null;
  last_message_at?: string | null;
  adviser_id?: number | null;
};

type ParentReportMessageRow = {
  id: number;
  report_id: number;
  sender_role: "parent" | "adviser" | "principal";
  sender_name: string;
  body: string;
  attachments?: MessageAttachment[] | null;
  created_at: string;
  read_by_adviser?: boolean | null;
};

type StaffMessageRow = {
  id: number;
  sender_type: "parent" | "adviser" | "guidance" | "principal" | "ict";
  sender_id: number;
  sender_name: string;
  sender_email?: string | null;
  recipient_type: "parent" | "adviser" | "guidance" | "principal" | "ict";
  recipient_id: number;
  recipient_name: string;
  recipient_email?: string | null;
  subject: string;
  categories?: string[] | null;
  body: string;
  attachments?: MessageAttachment[] | null;
  status?: string | null;
  source_message_id?: number | null;
  created_at: string;
  updated_at?: string | null;
};

function errorMessage(error: unknown) {
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return "Principal messages are temporarily unavailable. Please try again shortly.";
  }
  return error instanceof Error ? error.message : "Server error.";
}

function isUpstreamUnavailable(error: unknown) {
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "PGRST205" ||
      error.message?.toLowerCase().includes("could not find the table") ||
      error.message?.toLowerCase().includes("schema cache"))
  );
}

function isMissingAttachmentsColumn(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
    (error.code === "PGRST204" ||
      error.message?.toLowerCase().includes("attachments") ||
      error.message?.toLowerCase().includes("schema cache"))
  );
}

function fullName(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").trim();
}

function displayParentName(studentName: string) {
  return `${studentName}'s Parent`;
}

function studentFromRelation(students: ParentRow["students"]) {
  return Array.isArray(students) ? students[0] : students;
}

function createdAtMs(row: Record<string, unknown>) {
  const value = typeof row.created_at === "string" ? row.created_at : "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function byCreatedAt(a: Record<string, unknown>, b: Record<string, unknown>) {
  return createdAtMs(a) - createdAtMs(b);
}

function rowId(row: Record<string, unknown>) {
  return Number(row.id);
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

function attachmentsFromRow(value: unknown): MessageAttachment[] {
  return cleanAttachments(value);
}

function buildAdviserStartedThread(
  root: Record<string, unknown>,
  adviserRows: Array<Record<string, unknown>>,
  staffRows: Array<Record<string, unknown>>
) {
  const visitedAdviser = new Set<number>([rowId(root)]);
  const visitedStaff = new Set<number>();
  const messages: ThreadMessage[] = [
    {
      id: `message:${root.id}`,
      sender: "them" as const,
      body: String(root.body ?? ""),
      sentAt: formatDate(String(root.created_at)),
      attachments: attachmentsFromRow(root.attachments),
      createdAt: createdAtMs(root),
    },
  ];

  let changed = true;
  while (changed) {
    changed = false;

    for (const staffRow of staffRows) {
      const id = rowId(staffRow);
      const sourceAdviserId = Number(staffRow.source_adviser_message_id);
      if (!id || visitedStaff.has(id) || !visitedAdviser.has(sourceAdviserId)) continue;
      visitedStaff.add(id);
      messages.push({
        id: `principal-reply:${id}`,
        sender: "principal" as const,
        body: String(staffRow.body ?? ""),
        sentAt: formatDate(String(staffRow.created_at)),
        attachments: attachmentsFromRow(staffRow.attachments),
        createdAt: createdAtMs(staffRow),
      });
      changed = true;
    }

    for (const adviserRow of adviserRows) {
      const id = rowId(adviserRow);
      const sourceStaffId = Number(adviserRow.source_staff_message_id);
      if (!id || visitedAdviser.has(id) || !visitedStaff.has(sourceStaffId)) continue;
      visitedAdviser.add(id);
      messages.push({
        id: `reply-message:${id}`,
        sender: "them" as const,
        body: String(adviserRow.body ?? ""),
        sentAt: formatDate(String(adviserRow.created_at)),
        attachments: attachmentsFromRow(adviserRow.attachments),
        createdAt: createdAtMs(adviserRow),
      });
      changed = true;
    }
  }

  return {
    messages: messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ createdAt, ...message }) => {
        void createdAt;
        return message;
      }),
    adviserMessageIds: visitedAdviser,
    staffMessageIds: visitedStaff,
    lastRow: [...adviserRows.filter((row) => visitedAdviser.has(rowId(row))), ...staffRows.filter((row) => visitedStaff.has(rowId(row))), root]
      .sort(byCreatedAt)
      .at(-1) ?? root,
  };
}

function buildStaffStartedThread(
  root: Record<string, unknown>,
  adviserRows: Array<Record<string, unknown>>,
  staffRows: Array<Record<string, unknown>>
) {
  const visitedStaff = new Set<number>([rowId(root)]);
  const visitedAdviser = new Set<number>();
  const messages: ThreadMessage[] = [
    {
      id: `sent-message:${root.id}`,
      sender: "principal" as const,
      body: String(root.body ?? ""),
      sentAt: formatDate(String(root.created_at)),
      attachments: attachmentsFromRow(root.attachments),
      createdAt: createdAtMs(root),
    },
  ];

  let changed = true;
  while (changed) {
    changed = false;

    for (const adviserRow of adviserRows) {
      const id = rowId(adviserRow);
      const sourceStaffId = Number(adviserRow.source_staff_message_id);
      if (!id || visitedAdviser.has(id) || !visitedStaff.has(sourceStaffId)) continue;
      visitedAdviser.add(id);
      messages.push({
        id: `reply-message:${id}`,
        sender: "them" as const,
        body: String(adviserRow.body ?? ""),
        sentAt: formatDate(String(adviserRow.created_at)),
        attachments: attachmentsFromRow(adviserRow.attachments),
        createdAt: createdAtMs(adviserRow),
      });
      changed = true;
    }

    for (const staffRow of staffRows) {
      const id = rowId(staffRow);
      const sourceAdviserId = Number(staffRow.source_adviser_message_id);
      if (!id || visitedStaff.has(id) || !visitedAdviser.has(sourceAdviserId)) continue;
      visitedStaff.add(id);
      messages.push({
        id: `principal-reply:${id}`,
        sender: "principal" as const,
        body: String(staffRow.body ?? ""),
        sentAt: formatDate(String(staffRow.created_at)),
        attachments: attachmentsFromRow(staffRow.attachments),
        createdAt: createdAtMs(staffRow),
      });
      changed = true;
    }
  }

  return {
    messages: messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ createdAt, ...message }) => {
        void createdAt;
        return message;
      }),
    adviserMessageIds: visitedAdviser,
    staffMessageIds: visitedStaff,
    lastRow: [...adviserRows.filter((row) => visitedAdviser.has(rowId(row))), ...staffRows.filter((row) => visitedStaff.has(rowId(row))), root]
      .sort(byCreatedAt)
      .at(-1) ?? root,
  };
}

function principalStartedStatus(thread: ReturnType<typeof buildStaffStartedThread>, hasUnreadAdviserReply: boolean) {
  const hasAdviserReply = thread.adviserMessageIds.size > 0;
  const lastRowId = rowId(thread.lastRow);
  const latestFromPrincipal = thread.staffMessageIds.has(lastRowId);
  const latestFromAdviser = thread.adviserMessageIds.has(lastRowId);

  if (!hasAdviserReply) return null;
  if (latestFromAdviser && hasUnreadAdviserReply) return "New Message" as const;
  if (latestFromAdviser) return "Read" as const;
  // These are standalone staff conversations, not report workflow actions.
  // A Principal's outgoing message is therefore simply sent, never a report
  // "reply" that could imply an unrelated report status transition.
  if (latestFromPrincipal) return "Sent" as const;
  return "Read" as const;
}

function buildParentReportConversation(report: ParentReportRow, messages: ParentReportMessageRow[]) {
  const sortedMessages = [...messages].sort((a, b) => createdAtMs(a as unknown as Record<string, unknown>) - createdAtMs(b as unknown as Record<string, unknown>));
  const parentMessages = sortedMessages.filter((message) => message.sender_role === "parent");
  const principalMessages = sortedMessages.filter((message) => message.sender_role === "principal");
  const latestParentMessage = parentMessages.at(-1);
  const latestPrincipalMessage = principalMessages.at(-1);
  const hasUnreadParentReply = parentMessages.some((message) => message.read_by_adviser === false);
  const hasPrincipalReplyAfterParent = Boolean(
    latestParentMessage &&
    latestPrincipalMessage &&
    createdAtMs(latestPrincipalMessage as unknown as Record<string, unknown>) > createdAtMs(latestParentMessage as unknown as Record<string, unknown>)
  );
  const lastMessage = sortedMessages.at(-1);

  return {
    id: `parent-report:${report.id}`,
    sender: {
      id: `parent:${report.parent_id ?? 0}:${report.student_id}`,
      name: report.parent_name || "Parent",
      role: "Parent" as const,
      initials: initials(report.parent_name || "Parent"),
      type: "parent" as const,
      student: report.student_name,
      gradeSection: [report.grade, report.section].filter(Boolean).join(" - "),
    },
    subject: report.subject,
    category: Array.isArray(report.categories) ? report.categories.join(", ") : "",
    status: hasUnreadParentReply ? "Unread" as const : hasPrincipalReplyAfterParent ? "Replied" as const : "Read" as const,
    lastMessageAt: formatDate(String(lastMessage?.created_at ?? report.last_message_at ?? report.updated_at ?? report.created_at)),
    messages: sortedMessages.map((message) => ({
      id: `parent-report-message:${message.id}`,
      sender: message.sender_role === "principal" ? "principal" as const : "them" as const,
      body: String(message.body ?? ""),
      sentAt: formatDate(String(message.created_at)),
      attachments: attachmentsFromRow(message.attachments),
    })),
    sortAt: createdAtMs((lastMessage ?? report) as unknown as Record<string, unknown>),
  };
}

function roleLabel(type: string) {
  if (type === "parent") return "Parent";
  if (type === "guidance") return "Guidance";
  if (type === "principal") return "Principal";
  if (type === "ict") return "ICT";
  return "Adviser";
}

function isPrincipalIctPair(row: StaffMessageRow) {
  return (
    (row.sender_type === "principal" && row.recipient_type === "ict") ||
    (row.sender_type === "ict" && row.recipient_type === "principal")
  );
}

/**
 * Legacy Adviserâ€“Principal threads persist their read state in older tables.
 * Reuse the normal Reports invalidation scope so the mounted page and the
 * dashboard-level badge source re-read the authoritative inbox immediately.
 */
async function publishPrincipalReportsReadInvalidation(principalId: number) {
  await publishRealtimeInvalidation([
    { role: "principal", id: principalId },
  ], { scope: "staff-messages", kind: "status" });
}

function buildUnifiedStaffConversations(principal: PrincipalSession, rows: StaffMessageRow[]) {
  const roots = rows.filter((row) => !Number(row.source_message_id));

  return roots.map((root) => {
    const rootId = Number(root.id);
    const replies = rows
      .filter((row) => Number(row.source_message_id) === rootId)
      .sort((a, b) => createdAtMs(a as unknown as Record<string, unknown>) - createdAtMs(b as unknown as Record<string, unknown>));
    const thread = [root, ...replies];
    const last = thread.at(-1) ?? root;
    const principalIsSender = root.sender_type === "principal" && Number(root.sender_id) === principal.id;
    const otherType = principalIsSender ? root.recipient_type : root.sender_type;
    const otherId = principalIsSender ? Number(root.recipient_id) : Number(root.sender_id);
    const otherName = principalIsSender ? root.recipient_name : root.sender_name;
    const latestIncoming = last.recipient_type === "principal" && Number(last.recipient_id) === principal.id;
    const latestFromPrincipal = last.sender_type === "principal" && Number(last.sender_id) === principal.id;
    const unread = latestIncoming && String(last.status ?? "").toLowerCase() === "unread";

    return {
      id: `staff-message:${root.id}`,
      sender: {
        id: `${otherType}:${otherId}`,
        name: otherName || "School Staff",
        role: roleLabel(otherType),
        initials: initials(otherName || "School Staff"),
        type: "staff",
      },
      subject: String(root.subject ?? ""),
      category: Array.isArray(root.categories) ? root.categories.join(", ") : "",
      // A direct message has its own inbox state. Do not reuse the report
      // workflow's "Replied" status just because the Principal sent it.
      status: unread ? "New Message" as const : latestFromPrincipal ? "Sent" as const : "Read" as const,
      // `updated_at` changes when a recipient marks the message read. The
      // inbox timestamp must remain the durable send time.
      lastMessageAt: formatDate(String(last.created_at ?? root.created_at)),
      messages: thread.map((message) => ({
        id: `staff-message-row:${message.id}`,
        sender: message.sender_type === "principal" && Number(message.sender_id) === principal.id ? "principal" as const : "them" as const,
        body: String(message.body ?? ""),
        sentAt: formatDate(String(message.created_at)),
        attachments: attachmentsFromRow(message.attachments),
      })),
      sortAt: createdAtMs(last as unknown as Record<string, unknown>),
    };
  });
}

async function latestAdviserReplyIdForStaffConversation(principalId: number, staffMessageId: number) {
  const [rootResult, adviserResult, staffResult] = await Promise.all([
    supabase
      .from("principal_staff_messages")
      .select("*")
      .eq("id", staffMessageId)
      .eq("principal_id", principalId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("adviser_principal_messages")
      .select("*")
      .eq("principal_id", principalId),
    supabase
      .from("principal_staff_messages")
      .select("*")
      .eq("principal_id", principalId),
  ]);

  if (rootResult.error) throw rootResult.error;
  if (adviserResult.error) throw adviserResult.error;
  if (staffResult.error) throw staffResult.error;
  if (!rootResult.data) return undefined;

  const adviserRows = (adviserResult.data ?? []) as Array<Record<string, unknown>>;
  const staffRows = (staffResult.data ?? []) as Array<Record<string, unknown>>;
  const thread = buildStaffStartedThread(rootResult.data as Record<string, unknown>, adviserRows, staffRows);
  const latestAdviserReply = adviserRows
    .filter((row) => thread.adviserMessageIds.has(rowId(row)))
    .sort(byCreatedAt)
    .at(-1);

  return latestAdviserReply ? rowId(latestAdviserReply) : undefined;
}

async function getPrincipalSession(): Promise<PrincipalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("principal_token")?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    if (verified.payload.role !== "principal") return null;
    const id = Number(verified.payload.id);
    if (!id) return null;

    return {
      id,
      name: fullName([
        typeof verified.payload.first_name === "string" ? verified.payload.first_name : undefined,
        typeof verified.payload.middle_name === "string" ? verified.payload.middle_name : undefined,
        typeof verified.payload.last_name === "string" ? verified.payload.last_name : undefined,
        typeof verified.payload.suffix === "string" ? verified.payload.suffix : undefined,
      ]) || "Principal",
      email: typeof verified.payload.email === "string" ? verified.payload.email : "",
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const principal = await getPrincipalSession();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const [advisersResult, guidanceResult, parentsResult, adviserInboxResult, sentStaffResult, unifiedStaffResult, parentReportsResult] = await Promise.all([
      supabase
        .from("advisers")
        .select("id, first_name, middle_name, last_name, suffix, email, grade, section, sections")
        .order("last_name", { ascending: true }),
      supabase
        .from("guidance_counselors")
        .select("id, first_name, middle_name, last_name, suffix, email")
        .order("last_name", { ascending: true }),
      supabase
        .from("parents")
        .select(`
          id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, student_id,
          students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
        `)
        .order("parent_last_name", { ascending: true }),
      supabase
        .from("adviser_principal_messages")
        .select("*")
        .eq("principal_id", principal.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("principal_staff_messages")
        .select("*")
        .eq("principal_id", principal.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("staff_messages")
        .select("*")
        .or(`and(sender_type.eq.principal,sender_id.eq.${principal.id}),and(recipient_type.eq.principal,recipient_id.eq.${principal.id})`)
        .order("created_at", { ascending: true }),
      supabase
        .from("parent_adviser_reports")
        .select("*")
        .eq("escalated_to_principal", true)
        .order("last_message_at", { ascending: false }),
    ]);

    if (advisersResult.error) throw advisersResult.error;
    if (guidanceResult.error) throw guidanceResult.error;
    if (parentsResult.error) throw parentsResult.error;
    if (adviserInboxResult.error) throw adviserInboxResult.error;
    if (sentStaffResult.error && !isMissingTableError(sentStaffResult.error)) throw sentStaffResult.error;
    if (unifiedStaffResult.error && !isMissingTableError(unifiedStaffResult.error)) throw unifiedStaffResult.error;
    if (parentReportsResult.error) throw parentReportsResult.error;

    const staff = [
      ...((guidanceResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `guidance:${row.id}`,
        type: "staff" as const,
        role: "Guidance" as const,
        name: fullName([row.first_name as string, row.middle_name as string | null, row.last_name as string, row.suffix as string | null]),
        email: String(row.email ?? ""),
      })),
      ...((advisersResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `adviser:${row.id}`,
        type: "staff" as const,
        role: "Adviser" as const,
        name: fullName([row.first_name as string, row.middle_name as string | null, row.last_name as string, row.suffix as string | null]),
        email: String(row.email ?? ""),
        grade: String(row.grade ?? ""),
        section: String(row.section ?? ""),
      })),
    ];

    const parents = ((parentsResult.data ?? []) as unknown as ParentRow[]).flatMap((parent) => {
      const student = studentFromRelation(parent.students);
      if (!student) return [];
      const studentName = fullName([student.first_name, student.middle_name, student.last_name, student.suffix]);
      const actualParentName = fullName([
        parent.parent_first_name,
        parent.parent_middle_name,
        parent.parent_last_name,
        parent.parent_suffix,
      ]);
      return {
        id: `parent:${parent.id}:${student.student_id}`,
        type: "parent" as const,
        parentId: parent.id,
        parentEmail: parent.email,
        name: displayParentName(studentName),
        actualParentName,
        studentId: student.student_id,
        student: studentName,
        gradeLevel: student.grade ?? "",
        section: student.section ?? "",
      };
    });

    const adviserMessageRows = (adviserInboxResult.data ?? []) as Array<Record<string, unknown>>;
    const staffMessageRows = sentStaffResult.error ? [] : ((sentStaffResult.data ?? []) as Array<Record<string, unknown>>);
    const unifiedStaffRows = unifiedStaffResult.error ? [] : ((unifiedStaffResult.data ?? []) as unknown as StaffMessageRow[]);
    // Contact ICT owns Principal–ICT conversations and their read state. Keep
    // those rows out of this Reports-only staff inbox and its badge source.
    const reportStaffRows = unifiedStaffRows.filter((row) => !isPrincipalIctPair(row));

    const receivedInbox = adviserMessageRows.filter((row) => !Number(row.source_staff_message_id)).map((row) => {
      const thread = buildAdviserStartedThread(row, adviserMessageRows, staffMessageRows);
      const hasPrincipalReply = thread.staffMessageIds.size > 0;
      const hasUnreadStaffMessage = [...thread.adviserMessageIds]
        .map((id) => adviserMessageRows.find((messageRow) => rowId(messageRow) === id))
        .some((messageRow) => String(messageRow?.status ?? "").toLowerCase() === "unread");
      return {
        id: `principal-message:${row.id}`,
        sender: {
          id: `adviser:${row.adviser_id}`,
          name: String(row.adviser_name ?? "Adviser"),
          role: "Adviser",
          initials: initials(String(row.adviser_name ?? "Adviser")),
          type: "staff",
        },
        subject: String(row.subject ?? ""),
        category: Array.isArray(row.categories) ? row.categories.join(", ") : "",
        status: hasUnreadStaffMessage ? "New Message" as const : hasPrincipalReply ? "Sent" as const : "Read" as const,
        lastMessageAt: formatDate(String(thread.lastRow.created_at ?? row.created_at)),
        messages: thread.messages,
        sortAt: createdAtMs(thread.lastRow),
      };
    });

    const sentInbox = sentStaffResult.error
      ? []
      : staffMessageRows.filter((row) => !Number(row.source_adviser_message_id)).map((row) => {
        const thread = buildStaffStartedThread(row, adviserMessageRows, staffMessageRows);
        const hasUnreadReply = [...thread.adviserMessageIds]
          .map((id) => adviserMessageRows.find((messageRow) => rowId(messageRow) === id))
          .some((messageRow) => String(messageRow?.status ?? "").toLowerCase() === "unread");
        return {
          id: `principal-sent-staff:${row.id}`,
          sender: {
            id: `${row.recipient_type}:${row.recipient_id}`,
            name: String(row.recipient_name ?? "School Staff"),
            role: row.recipient_type === "guidance" ? "Guidance" : "Adviser",
            initials: initials(String(row.recipient_name ?? "School Staff")),
            type: "staff",
          },
          subject: String(row.subject ?? ""),
          category: Array.isArray(row.categories) ? row.categories.join(", ") : "",
          status: principalStartedStatus(thread, hasUnreadReply),
          lastMessageAt: formatDate(String(thread.lastRow.created_at ?? row.created_at)),
          messages: thread.messages,
          sortAt: createdAtMs(thread.lastRow),
        };
      });

    const parentReportRows = (parentReportsResult.data ?? []) as ParentReportRow[];
    const { data: parentMessageRows, error: parentMessagesError } = parentReportRows.length
      ? await supabase
        .from("parent_adviser_report_messages")
        .select("*")
        .in("report_id", parentReportRows.map((report) => report.id))
        .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (parentMessagesError) throw parentMessagesError;

    const parentMessagesByReport = new Map<number, ParentReportMessageRow[]>();
    for (const message of ((parentMessageRows ?? []) as ParentReportMessageRow[])) {
      const current = parentMessagesByReport.get(message.report_id) ?? [];
      current.push(message);
      parentMessagesByReport.set(message.report_id, current);
    }

    const parentInbox = parentReportRows.map((report) =>
      buildParentReportConversation(report, parentMessagesByReport.get(report.id) ?? [])
    );

    const unifiedStaffInbox = buildUnifiedStaffConversations(principal, reportStaffRows);

    const inbox = [...receivedInbox, ...sentInbox, ...unifiedStaffInbox]
      .sort((a, b) => b.sortAt - a.sortAt);

    return NextResponse.json({ success: true, staff, parents, inbox });
  } catch (error: unknown) {
    const unavailable = isUpstreamUnavailable(error);
    (unavailable ? console.warn : console.error)("GET /api/reports/principal-messages error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: unavailable ? 503 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const principal = await getPrincipalSession();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { recipientId, conversationId, subject, categories, message, attachments } = await req.json();
    const trimmedSubject = String(subject ?? "").trim();
    const trimmedMessage = String(message ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);
    const selectedCategories = Array.isArray(categories) ? categories.map((category) => String(category).trim()).filter(Boolean) : [];

    if (!recipientId || !trimmedSubject || (!trimmedMessage && cleanedAttachments.length === 0)) {
      return NextResponse.json({ success: false, message: "Recipient, subject, and message or attachment are required." }, { status: 400 });
    }

    const [kind, rawId, studentId] = String(recipientId).split(":");
    if (kind !== "parent" && selectedCategories.length === 0) {
      return NextResponse.json({ success: false, message: "A category is required for staff-to-staff concerns." }, { status: 400 });
    }
    if (kind === "parent") {
      const rawConversationId = String(conversationId ?? "");
      if (rawConversationId.startsWith("parent-report:")) {
        return replyToParentConversation({
          principal,
          reportId: Number(rawConversationId.replace("parent-report:", "")),
          message: trimmedMessage,
          attachments: cleanedAttachments,
        });
      }

      return sendToParent({
        principal,
        parentId: Number(rawId),
        studentId,
        subject: trimmedSubject,
        message: trimmedMessage,
        attachments: cleanedAttachments,
      });
    }

    if (kind === "adviser" || kind === "guidance") {
      const rawConversationId = String(conversationId ?? "");
      if (rawConversationId.startsWith("staff-message:")) {
        return replyToUnifiedStaffConversation({
          principal,
          rootId: Number(rawConversationId.replace("staff-message:", "")),
          message: trimmedMessage,
          attachments: cleanedAttachments,
        });
      }
      if (!rawConversationId) {
        return sendUnifiedStaffMessage({
          principal,
          recipientType: kind,
          recipientId: Number(rawId),
          subject: trimmedSubject,
          categories: selectedCategories,
          message: trimmedMessage,
          attachments: cleanedAttachments,
        });
      }
      const sourceAdviserMessageId = rawConversationId.startsWith("principal-message:")
        ? Number(rawConversationId.replace("principal-message:", ""))
        : rawConversationId.startsWith("principal-sent-staff:")
          ? await latestAdviserReplyIdForStaffConversation(
            principal.id,
            Number(rawConversationId.replace("principal-sent-staff:", ""))
          )
          : undefined;
      return sendToStaff({
        principal,
        recipientType: kind,
        recipientId: Number(rawId),
        sourceAdviserMessageId,
        notifyByEmail: !rawConversationId,
        subject: trimmedSubject,
        categories: selectedCategories,
        message: trimmedMessage,
        attachments: cleanedAttachments,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid recipient." }, { status: 400 });
  } catch (error: unknown) {
    console.error("POST /api/reports/principal-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const principal = await getPrincipalSession();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { conversationId, status } = await req.json();
    const nextStatus = String(status ?? "").trim().toLowerCase();
    if (!conversationId || nextStatus !== "read") {
      return NextResponse.json({ success: false, message: "Conversation and read status are required." }, { status: 400 });
    }

    const id = String(conversationId);
    if (id.startsWith("staff-message:")) {
      const rootId = Number(id.replace("staff-message:", ""));
      if (!rootId) {
        return NextResponse.json({ success: false, message: "Invalid conversation." }, { status: 400 });
      }

      const { data: root, error: rootError } = await supabase
        .from("staff_messages")
        .select("*")
        .eq("id", rootId)
        .limit(1)
        .maybeSingle();
      if (rootError) throw rootError;
      if (!root) {
        return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
      }

      const isParticipant =
        (root.sender_type === "principal" && Number(root.sender_id) === principal.id) ||
        (root.recipient_type === "principal" && Number(root.recipient_id) === principal.id);
      if (!isParticipant) {
        return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
      }

      const { error } = await supabase
        .from("staff_messages")
        .update({ status: "read", updated_at: new Date().toISOString() })
        .eq("source_message_id", rootId)
        .eq("recipient_type", "principal")
        .eq("recipient_id", principal.id)
        .eq("status", "unread");
      if (error) throw error;

      const { error: rootUpdateError } = await supabase
        .from("staff_messages")
        .update({ status: "read", updated_at: new Date().toISOString() })
        .eq("id", rootId)
        .eq("recipient_type", "principal")
        .eq("recipient_id", principal.id)
        .eq("status", "unread");
      if (rootUpdateError) throw rootUpdateError;

      await publishPrincipalReportsReadInvalidation(principal.id);
      return NextResponse.json({ success: true });
    }

    if (id.startsWith("principal-message:")) {
      const messageId = Number(id.replace("principal-message:", ""));
      if (!messageId) {
        return NextResponse.json({ success: false, message: "Invalid conversation." }, { status: 400 });
      }

      const [rootResult, adviserResult, staffResult] = await Promise.all([
        supabase
          .from("adviser_principal_messages")
          .select("*")
          .eq("id", messageId)
          .eq("principal_id", principal.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("adviser_principal_messages")
          .select("*")
          .eq("principal_id", principal.id),
        supabase
          .from("principal_staff_messages")
          .select("*")
          .eq("principal_id", principal.id),
      ]);

      if (rootResult.error) throw rootResult.error;
      if (adviserResult.error) throw adviserResult.error;
      if (staffResult.error) throw staffResult.error;
      if (!rootResult.data) {
        return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
      }

      const thread = buildAdviserStartedThread(
        rootResult.data as Record<string, unknown>,
        (adviserResult.data ?? []) as Array<Record<string, unknown>>,
        (staffResult.data ?? []) as Array<Record<string, unknown>>
      );
      const ids = [...thread.adviserMessageIds].filter(Boolean);
      const { error } = await supabase
        .from("adviser_principal_messages")
        .update({ status: "read" })
        .eq("principal_id", principal.id)
        .in("id", ids);

      if (error) throw error;
      await publishPrincipalReportsReadInvalidation(principal.id);
      return NextResponse.json({ success: true });
    }

    if (id.startsWith("principal-sent-staff:")) {
      const staffMessageId = Number(id.replace("principal-sent-staff:", ""));
      if (!staffMessageId) {
        return NextResponse.json({ success: false, message: "Invalid conversation." }, { status: 400 });
      }

      const [rootResult, adviserResult, staffResult] = await Promise.all([
        supabase
          .from("principal_staff_messages")
          .select("*")
          .eq("id", staffMessageId)
          .eq("principal_id", principal.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("adviser_principal_messages")
          .select("*")
          .eq("principal_id", principal.id),
        supabase
          .from("principal_staff_messages")
          .select("*")
          .eq("principal_id", principal.id),
      ]);

      if (rootResult.error) throw rootResult.error;
      if (adviserResult.error) throw adviserResult.error;
      if (staffResult.error) throw staffResult.error;
      if (!rootResult.data) {
        return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
      }

      const thread = buildStaffStartedThread(
        rootResult.data as Record<string, unknown>,
        (adviserResult.data ?? []) as Array<Record<string, unknown>>,
        (staffResult.data ?? []) as Array<Record<string, unknown>>
      );
      const ids = [...thread.adviserMessageIds].filter(Boolean);
      if (ids.length === 0) return NextResponse.json({ success: true });

      const { error } = await supabase
        .from("adviser_principal_messages")
        .update({ status: "read" })
        .eq("principal_id", principal.id)
        .in("id", ids);

      if (error) throw error;
      await publishPrincipalReportsReadInvalidation(principal.id);
      return NextResponse.json({ success: true });
    }

    if (id.startsWith("parent-report:")) {
      const reportId = Number(id.replace("parent-report:", ""));
      if (!reportId) {
        return NextResponse.json({ success: false, message: "Invalid conversation." }, { status: 400 });
      }

      const { error } = await supabase
        .from("parent_adviser_report_messages")
        .update({ read_by_adviser: true })
        .eq("report_id", reportId)
        .eq("sender_role", "parent")
        .eq("read_by_adviser", false);

      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Invalid conversation." }, { status: 400 });
  } catch (error: unknown) {
    console.error("PATCH /api/reports/principal-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

async function sendToStaff({
  principal,
  recipientType,
  recipientId,
  sourceAdviserMessageId,
  notifyByEmail,
  subject,
  categories,
  message,
  attachments,
}: {
  principal: PrincipalSession;
  recipientType: "adviser" | "guidance";
  recipientId: number;
  sourceAdviserMessageId?: number;
  notifyByEmail: boolean;
  subject: string;
  categories: string[];
  message: string;
  attachments: MessageAttachment[];
}) {
  const table = recipientType === "adviser" ? "advisers" : "guidance_counselors";
  const { data: recipient, error: recipientError } = await supabase
    .from(table)
    .select("id, first_name, middle_name, last_name, suffix, email")
    .eq("id", recipientId)
    .limit(1)
    .maybeSingle();

  if (recipientError) throw recipientError;
  if (!recipient) {
    return NextResponse.json({ success: false, message: "Staff recipient not found." }, { status: 404 });
  }

  const recipientName = fullName([
    recipient.first_name,
    recipient.middle_name,
    recipient.last_name,
    recipient.suffix,
  ]);
  const recipientEmail = String(recipient.email ?? "").trim();

  if (!recipientEmail) {
    return NextResponse.json({ success: false, message: "Staff recipient has no registered email." }, { status: 400 });
  }

  let result = await supabase
    .from("principal_staff_messages")
    .insert({
      principal_id: principal.id,
      principal_name: principal.name,
      recipient_type: recipientType,
      recipient_id: recipientId,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      source_adviser_message_id: sourceAdviserMessageId || null,
      subject,
      categories,
      body: message,
      attachments,
      status: "unread",
    });

  if (result.error && isMissingAttachmentsColumn(result.error)) {
    if (attachments.length > 0) {
      throw new Error("Attachment support is not migrated yet. Please run principal_staff_message_attachments_migration.sql in Supabase.");
    }
    result = await supabase
      .from("principal_staff_messages")
      .insert({
        principal_id: principal.id,
        principal_name: principal.name,
        recipient_type: recipientType,
        recipient_id: recipientId,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        subject,
        categories,
        body: message,
        status: "unread",
      });
  }

  if (result.error && result.error.message?.toLowerCase().includes("source_adviser_message_id")) {
    result = await supabase
      .from("principal_staff_messages")
      .insert({
        principal_id: principal.id,
        principal_name: principal.name,
        recipient_type: recipientType,
        recipient_id: recipientId,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        subject,
        categories,
        body: message,
        attachments,
        status: "unread",
      });
  }

  if (result.error && !isMissingTableError(result.error)) throw result.error;

  if (notifyByEmail) {
    after(async () => {
      try {
        await sendPrincipalStaffMessageEmail({
          staffEmail: recipientEmail,
          staffName: recipientName,
          staffRole: recipientType === "adviser" ? "Adviser" : "Guidance",
          principalName: principal.name,
          subject,
          categories,
          message,
          hasAttachments: attachments.length > 0,
        });
      } catch (error) {
        console.error("Principal staff-message email delivery failed:", error);
      }
    });
  }

  return NextResponse.json({
    success: true,
    target: "staff",
    stored: !result.error,
  }, { status: 201 });
}

async function sendUnifiedStaffMessage({
  principal,
  recipientType,
  recipientId,
  subject,
  categories,
  message,
  attachments,
}: {
  principal: PrincipalSession;
  recipientType: "adviser" | "guidance";
  recipientId: number;
  subject: string;
  categories: string[];
  message: string;
  attachments: MessageAttachment[];
}) {
  const table = recipientType === "adviser" ? "advisers" : "guidance_counselors";
  const { data: recipient, error: recipientError } = await supabase
    .from(table)
    .select("id, first_name, middle_name, last_name, suffix, email")
    .eq("id", recipientId)
    .limit(1)
    .maybeSingle();

  if (recipientError) throw recipientError;
  if (!recipient) {
    return NextResponse.json({ success: false, message: "Staff recipient not found." }, { status: 404 });
  }

  const recipientName = fullName([
    recipient.first_name,
    recipient.middle_name,
    recipient.last_name,
    recipient.suffix,
  ]) || (recipientType === "guidance" ? "Guidance" : "Adviser");
  const recipientEmail = String(recipient.email ?? "").trim();

  if (!recipientEmail) {
    return NextResponse.json({ success: false, message: "Staff recipient has no registered email." }, { status: 400 });
  }

  const { data: inserted, error } = await supabase
    .from("staff_messages")
    .insert({
      sender_type: "principal",
      sender_id: principal.id,
      sender_name: principal.name,
      sender_email: principal.email,
      recipient_type: recipientType,
      recipient_id: recipientId,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      subject,
      categories,
      body: message,
      attachments,
      status: "unread",
    })
    .select("id")
    .single();

  if (error) throw error;

  after(async () => {
    try {
      await sendPrincipalStaffMessageEmail({
        staffEmail: recipientEmail,
        staffName: recipientName,
        staffRole: recipientType === "adviser" ? "Adviser" : "Guidance",
        principalName: principal.name,
        subject,
        categories,
        message,
        hasAttachments: attachments.length > 0,
      });
    } catch (error) {
      console.error("Principal staff-message email delivery failed:", error);
    }
  });

  return NextResponse.json({
    success: true,
    target: "staff",
    conversationId: inserted?.id ? `staff-message:${inserted.id}` : undefined,
  }, { status: 201 });
}

async function replyToUnifiedStaffConversation({
  principal,
  rootId,
  message,
  attachments,
}: {
  principal: PrincipalSession;
  rootId: number;
  message: string;
  attachments: MessageAttachment[];
}) {
  const { data: root, error: rootError } = await supabase
    .from("staff_messages")
    .select("*")
    .eq("id", rootId)
    .limit(1)
    .maybeSingle();
  if (rootError) throw rootError;
  if (!root) {
    return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
  }

  const principalIsSender = root.sender_type === "principal" && Number(root.sender_id) === principal.id;
  const principalIsRecipient = root.recipient_type === "principal" && Number(root.recipient_id) === principal.id;
  if (!principalIsSender && !principalIsRecipient) {
    return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
  }

  const recipientType = principalIsSender ? String(root.recipient_type) : String(root.sender_type);
  const recipientId = principalIsSender ? Number(root.recipient_id) : Number(root.sender_id);
  const recipientName = principalIsSender ? String(root.recipient_name ?? "") : String(root.sender_name ?? "");
  const recipientEmail = principalIsSender ? String(root.recipient_email ?? "") : String(root.sender_email ?? "");

  const { error } = await supabase
    .from("staff_messages")
    .insert({
      sender_type: "principal",
      sender_id: principal.id,
      sender_name: principal.name,
      sender_email: principal.email,
      recipient_type: recipientType,
      recipient_id: recipientId,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      subject: root.subject,
      categories: root.categories ?? [],
      body: message,
      attachments,
      source_message_id: rootId,
      status: "unread",
    });

  if (error) throw error;

  if (recipientEmail) {
    after(async () => {
      try {
        await sendPrincipalStaffMessageEmail({
          staffEmail: recipientEmail,
          staffName: recipientName || "School Staff",
          staffRole: roleLabel(recipientType),
          principalName: principal.name,
          subject: String(root.subject ?? ""),
          categories: Array.isArray(root.categories) ? root.categories.map(String) : [],
          message,
          hasAttachments: attachments.length > 0,
        });
      } catch (error) {
        console.error("Principal staff-message email delivery failed:", error);
      }
    });
  }

  return NextResponse.json({ success: true, target: "staff" }, { status: 201 });
}

async function replyToParentConversation({
  principal,
  reportId,
  message,
  attachments,
}: {
  principal: PrincipalSession;
  reportId: number;
  message: string;
  attachments: MessageAttachment[];
}) {
  const { data: report, error: reportError } = await supabase
    .from("parent_adviser_reports")
    .select("id")
    .eq("id", reportId)
    .or("adviser_id.is.null,adviser_id.eq.0")
    .limit(1)
    .maybeSingle();

  if (reportError) throw reportError;
  if (!report) {
    return NextResponse.json({ success: false, message: "Parent conversation not found." }, { status: 404 });
  }

  let result = await supabase
    .from("parent_adviser_report_messages")
    .insert({
      report_id: reportId,
      sender_role: "principal",
      sender_name: principal.name,
      body: message,
      attachments,
      read_by_parent: false,
      read_by_adviser: true,
    });

  if (result.error && isMissingAttachmentsColumn(result.error)) {
    if (attachments.length > 0) {
      throw new Error("Attachment support is not migrated yet. Please run parent_report_message_attachments_migration.sql in Supabase.");
    }
    result = await supabase
      .from("parent_adviser_report_messages")
      .insert({
        report_id: reportId,
        sender_role: "principal",
        sender_name: principal.name,
        body: message,
        read_by_parent: false,
        read_by_adviser: true,
      });
  }

  if (result.error) throw result.error;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("parent_adviser_reports")
    .update({ status: "replied", status_updated_at: now, updated_at: now, last_message_at: now })
    .eq("id", reportId);

  if (updateError) throw updateError;

  const { error: readError } = await supabase
    .from("parent_adviser_report_messages")
    .update({ read_by_adviser: true })
    .eq("report_id", reportId)
    .eq("sender_role", "parent")
    .eq("read_by_adviser", false);

  if (readError) throw readError;

  return NextResponse.json({ success: true, target: "parent" }, { status: 201 });
}

async function sendToParent({
  principal,
  parentId,
  studentId,
  subject,
  message,
  attachments,
}: {
  principal: PrincipalSession;
  parentId: number;
  studentId: string;
  subject: string;
  message: string;
  attachments: MessageAttachment[];
}) {
  const { data: parentRow, error: parentError } = await supabase
    .from("parents")
    .select(`
      id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, student_id,
      students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
    `)
    .eq("id", parentId)
    .eq("student_id", studentId)
    .limit(1)
    .maybeSingle();

  if (parentError) throw parentError;
  if (!parentRow) {
    return NextResponse.json({ success: false, message: "Parent recipient not found." }, { status: 404 });
  }

  const parent = parentRow as unknown as ParentRow;
  const student = studentFromRelation(parent.students);
  if (!student) {
    return NextResponse.json({ success: false, message: "Student record not found for this parent." }, { status: 404 });
  }
  const studentName = fullName([student.first_name, student.middle_name, student.last_name, student.suffix]);
  const parentName = fullName([parent.parent_first_name, parent.parent_middle_name, parent.parent_last_name, parent.parent_suffix]) || displayParentName(studentName);
  // This legacy endpoint must preserve direct-message semantics too: it
  // never creates a Parent Report when the Principal contacts a parent.
  const { data: createdMessage, error: messageError } = await supabase
    .from("staff_messages")
    .insert({
      sender_type: "principal",
      sender_id: principal.id,
      sender_name: principal.name,
      sender_email: principal.email,
      recipient_type: "parent",
      recipient_id: parent.id,
      recipient_name: parentName,
      recipient_email: parent.email,
      subject,
      categories: ["Message"],
      body: message,
      attachments,
      status: "unread",
    })
    .select("*")
    .single();
  if (messageError) throw messageError;

  // This durable row is immediately visible to the Parent Reports inbox.
  // Keep the Broadcast on the request path; only email delivery is deferred.
  await publishRealtimeInvalidation([
    { role: "principal", id: principal.id },
    { role: "parent", id: parent.id },
  ], "staff-messages");

  after(async () => {
    try {
      await sendPrincipalParentMessageEmail({
        parentEmail: parent.email,
        parentName,
        studentName,
        principalName: principal.name,
        subject,
        message,
        hasAttachments: attachments.length > 0,
      });
    } catch (error) {
      console.error("Principal message email delivery failed:", error);
    }
  });

  return NextResponse.json({ success: true, target: "parent", message: createdMessage }, { status: 201 });
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
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
