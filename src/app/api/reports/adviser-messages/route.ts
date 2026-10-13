import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { sendAdviserParentMessageEmail, sendAdviserPrincipalMessageEmail } from "@/lib/mailer";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { logAudit } from "@/lib/audit";

type PrincipalRow = {
  id: number;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
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

function createdAtMs(row: Record<string, unknown>) {
  const parsed = Date.parse(String(row.created_at ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function adviserRecipientMatch(adviser: NonNullable<Awaited<ReturnType<typeof getAdviserFromToken>>>) {
  const email = String(adviser.email ?? "").trim();
  return email
    ? `recipient_id.eq.${adviser.id},recipient_email.eq.${email}`
    : `recipient_id.eq.${adviser.id}`;
}

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const adviserSections = Array.isArray(adviser.sections) && adviser.sections.length > 0
      ? adviser.sections
      : adviser.section
        ? [adviser.section]
        : [];

    const [principalsResult, parentsResult, inboxResult, repliesResult] = await Promise.all([
      supabase
        .from("principals")
        .select("id, first_name, middle_name, last_name, suffix, email")
        .eq("is_active", true)
        .order("last_name", { ascending: true }),
      supabase
        .from("parents")
        .select(`
          id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, student_id,
          students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
        `)
        .eq("students.grade", adviser.grade)
        .in("students.section", adviserSections.length > 0 ? adviserSections : [""])
        .order("parent_last_name", { ascending: true }),
      supabase
        .from("principal_staff_messages")
        .select("*")
        .eq("recipient_type", "adviser")
        .or(adviserRecipientMatch(adviser))
        .order("created_at", { ascending: false }),
      supabase
        .from("adviser_principal_messages")
        .select("*")
        .eq("adviser_id", adviser.id)
        .order("created_at", { ascending: true }),
    ]);

    if (principalsResult.error) throw principalsResult.error;
    if (parentsResult.error) throw parentsResult.error;
    if (inboxResult.error && !isMissingTableError(inboxResult.error)) throw inboxResult.error;
    if (repliesResult.error && !isMissingTableError(repliesResult.error)) throw repliesResult.error;

    const principals = ((principalsResult.data ?? []) as PrincipalRow[]).map((principal) => ({
      id: `principal:${principal.id}`,
      principalId: principal.id,
      type: "admin" as const,
      role: "Principal",
      name: fullName([principal.first_name, principal.middle_name, principal.last_name, principal.suffix]) || "Principal",
      email: principal.email,
    }));

    const parents = ((parentsResult.data ?? []) as unknown as ParentRow[]).flatMap((parent) => {
      const student = studentFromRelation(parent.students);
      if (!student) return [];
      const studentName = fullName([student.first_name, student.middle_name, student.last_name, student.suffix]);
      return {
        id: `parent:${parent.id}:${student.student_id}`,
        parentId: parent.id,
        parentEmail: parent.email,
        name: displayParentName(studentName),
        parentName: displayParentName(studentName),
        actualParentName: fullName([
          parent.parent_first_name,
          parent.parent_middle_name,
          parent.parent_last_name,
          parent.parent_suffix,
        ]),
        studentId: student.student_id,
        studentName,
        grade: student.grade ?? "",
        section: student.section ?? "",
        type: "parent" as const,
      };
    });

    const repliesBySource = new Map<number, Array<{ sender: string; message: string; sent_at: string; attachments: MessageAttachment[] }>>();
    for (const row of ((repliesResult.data ?? []) as Array<Record<string, unknown>>)) {
      const sourceId = Number(row.source_staff_message_id);
      if (!sourceId) continue;
      const current = repliesBySource.get(sourceId) ?? [];
      current.push({
        sender: "Adviser",
        message: String(row.body ?? ""),
        sent_at: formatDate(String(row.created_at)),
        attachments: attachmentsFromRow(row.attachments),
      });
      repliesBySource.set(sourceId, current);
    }

    const principalRepliesByAdviserSource = new Map<number, Array<Record<string, unknown>>>();
    for (const row of ((inboxResult.data ?? []) as Array<Record<string, unknown>>)) {
      const sourceId = Number(row.source_adviser_message_id);
      if (!sourceId) continue;
      const current = principalRepliesByAdviserSource.get(sourceId) ?? [];
      current.push(row);
      principalRepliesByAdviserSource.set(sourceId, current);
    }

    const sentPrincipalMessages = ((repliesResult.data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => !Number(row.source_staff_message_id))
      .map((row) => {
        const principal = principals.find((item) => item.principalId === Number(row.principal_id));
        const principalReplies = [...(principalRepliesByAdviserSource.get(Number(row.id)) ?? [])].sort((a, b) => createdAtMs(a) - createdAtMs(b));
        const adviserFollowUps = principalReplies.flatMap((reply) =>
          ((repliesResult.data ?? []) as Array<Record<string, unknown>>)
            .filter((replyRow) => Number(replyRow.source_staff_message_id) === Number(reply.id))
        );
        const threadedReplies = principalReplies.flatMap((reply) => [
          {
            sender: "Principal",
            message: String(reply.body ?? ""),
            sent_at: formatDate(String(reply.created_at)),
            attachments: attachmentsFromRow(reply.attachments),
          },
          ...((repliesResult.data ?? []) as Array<Record<string, unknown>>)
            .filter((replyRow) => Number(replyRow.source_staff_message_id) === Number(reply.id))
            .sort((a, b) => createdAtMs(a) - createdAtMs(b))
            .map((followUp) => ({
              sender: "Adviser",
              message: String(followUp.body ?? ""),
              sent_at: formatDate(String(followUp.created_at)),
              attachments: attachmentsFromRow(followUp.attachments),
            })),
        ]);
        const latestConversationRow = [...principalReplies, ...adviserFollowUps]
          .sort((a, b) => createdAtMs(a) - createdAtMs(b))
          .at(-1);
        return {
          id: Number(row.id),
          conversationId: `adviser-sent-principal:${row.id}`,
          sender: "Principal" as const,
          sender_name: principal?.name ?? "Principal",
          sender_email: principal?.email ?? "",
          subject: String(row.subject ?? ""),
          message: String(row.body ?? ""),
          categories: Array.isArray(row.categories) ? row.categories.map((category) => String(category)) : [],
          attachments: attachmentsFromRow(row.attachments),
          sent_at: formatDate(String(row.created_at)),
          status: principalReplies.length > 0 ? "Replied" as const : "Read" as const,
          priority: Array.isArray(row.categories) && row.categories.some((category) => ["Academic Concern", "Health/Medical", "Behavioral Issue"].includes(String(category)))
            ? "High" as const
            : "Normal" as const,
          replies: threadedReplies,
          sortAt: createdAtMs(latestConversationRow ?? row),
        };
      });

    const receivedPrincipalMessages = inboxResult.error
      ? []
      : ((inboxResult.data ?? []) as Array<Record<string, unknown>>).filter((row) => !Number(row.source_adviser_message_id)).map((row) => {
        const rawReplies = ((repliesResult.data ?? []) as Array<Record<string, unknown>>)
          .filter((replyRow) => Number(replyRow.source_staff_message_id) === Number(row.id))
          .sort((a, b) => createdAtMs(a) - createdAtMs(b));
        return {
          id: Number(row.id),
          conversationId: `principal-message:${row.id}`,
          sender: "Principal" as const,
          sender_name: String(row.principal_name ?? "Principal"),
          sender_email: "",
          subject: String(row.subject ?? ""),
          message: String(row.body ?? ""),
          categories: Array.isArray(row.categories) ? row.categories.map((category) => String(category)) : [],
          attachments: attachmentsFromRow(row.attachments),
          sent_at: formatDate(String(row.created_at)),
          status: row.status === "read" ? "Read" as const : row.status === "replied" ? "Replied" as const : "New" as const,
          priority: Array.isArray(row.categories) && row.categories.some((category) => ["Academic Concern", "Health/Medical", "Behavioral Issue"].includes(String(category)))
            ? "High" as const
            : "Normal" as const,
          replies: repliesBySource.get(Number(row.id)) ?? [],
          sortAt: createdAtMs(rawReplies.at(-1) ?? row),
        };
      });

    const principalMessages = [...receivedPrincipalMessages, ...sentPrincipalMessages]
      .sort((a, b) => b.sortAt - a.sortAt);

    return NextResponse.json({ success: true, principals, parents, principalMessages });
  } catch (error: unknown) {
    console.error("GET /api/reports/adviser-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
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

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { recipientId, subject, categories, message, attachments } = await req.json();
    const trimmedSubject = String(subject ?? "").trim();
    const trimmedMessage = String(message ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);
    const selectedCategories = Array.isArray(categories)
      ? categories.map((category) => String(category).trim()).filter(Boolean)
      : [];

    if (!recipientId || !trimmedSubject || (!trimmedMessage && cleanedAttachments.length === 0)) {
      return NextResponse.json(
        { success: false, message: "Recipient, subject, and message or attachment are required." },
        { status: 400 }
      );
    }

    const [kind, rawId, studentId] = String(recipientId).split(":");
    if (kind !== "parent" && selectedCategories.length === 0) {
      return NextResponse.json({ success: false, message: "A category is required for staff-to-staff concerns." }, { status: 400 });
    }
    if (kind === "principal") {
      return createPrincipalMessage({
        principalId: Number(rawId),
        adviser,
        subject: trimmedSubject,
        categories: selectedCategories,
        message: trimmedMessage,
        attachments: cleanedAttachments,
      });
    }

    if (kind === "parent") {
      return createParentReport({
        parentId: Number(rawId),
        studentId,
        adviser,
        subject: trimmedSubject,
        message: trimmedMessage,
        attachments: cleanedAttachments,
      });
    }

    return NextResponse.json({ success: false, message: "Invalid recipient." }, { status: 400 });
  } catch (error: unknown) {
    console.error("POST /api/reports/adviser-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { messageId, conversationId, status, reply, attachments } = await req.json();
    const rawConversationId = String(conversationId ?? "");
    const id = rawConversationId.startsWith("principal-message:")
      ? Number(rawConversationId.replace("principal-message:", ""))
      : rawConversationId.startsWith("adviser-sent-principal:")
        ? Number(rawConversationId.replace("adviser-sent-principal:", ""))
        : Number(messageId);
    const target = rawConversationId.startsWith("principal-message:")
      ? "received"
      : rawConversationId.startsWith("adviser-sent-principal:")
        ? "sent"
        : "unknown";
    const nextStatus = String(status ?? "").trim().toLowerCase();
    const replyBody = String(reply ?? "").trim();
    const cleanedAttachments = cleanAttachments(attachments);

    if (!id || !["read", "replied", "unread"].includes(nextStatus)) {
      return NextResponse.json({ success: false, message: "Valid message id and status are required." }, { status: 400 });
    }

    // ── Try principal_staff_messages first (received messages) ──
    if (target !== "sent") {
      const { data: receivedMsg, error: receivedError } = await supabase
        .from("principal_staff_messages")
        .select("*")
        .eq("id", id)
        .limit(1)
        .maybeSingle();

      if (receivedError) throw receivedError;

      if (receivedMsg) {
        // Mark received message status
        const { error: updateError } = await supabase
          .from("principal_staff_messages")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", id);

        if (updateError) throw updateError;

        // Insert reply if provided
        if (replyBody || cleanedAttachments.length > 0) {
          const adviserName = fullName([adviser.first_name, adviser.last_name]);
          let replyResult = await supabase
            .from("adviser_principal_messages")
            .insert({
              adviser_id: adviser.id,
              adviser_name: adviserName,
              adviser_email: adviser.email,
              principal_id: receivedMsg.principal_id,
              source_staff_message_id: id,
              subject: receivedMsg.subject,
              categories: receivedMsg.categories ?? [],
              body: replyBody,
              attachments: cleanedAttachments,
              status: "unread",
            });

          if (replyResult.error && replyResult.error.message?.toLowerCase().includes("source_staff_message_id")) {
            replyResult = await supabase
              .from("adviser_principal_messages")
              .insert({
                adviser_id: adviser.id,
                adviser_name: adviserName,
                adviser_email: adviser.email,
                principal_id: receivedMsg.principal_id,
                subject: receivedMsg.subject,
                categories: receivedMsg.categories ?? [],
                body: replyBody,
                attachments: cleanedAttachments,
                status: "unread",
              });
          }

          if (replyResult.error && isMissingAttachmentsColumn(replyResult.error)) {
            if (cleanedAttachments.length > 0) {
              throw new Error("Attachment support is not migrated yet.");
            }
            replyResult = await supabase
              .from("adviser_principal_messages")
              .insert({
                adviser_id: adviser.id,
                adviser_name: adviserName,
                adviser_email: adviser.email,
                principal_id: receivedMsg.principal_id,
                source_staff_message_id: id,
                subject: receivedMsg.subject,
                categories: receivedMsg.categories ?? [],
                body: replyBody,
                status: "unread",
              });
          }

          if (replyResult.error) throw replyResult.error;
        }

        return NextResponse.json({ success: true });
      }
    }

    // ── Fallback: try adviser_principal_messages (sent messages) ──
    const { data: sentMsg, error: sentError } = await supabase
      .from("adviser_principal_messages")
      .select("*")
      .eq("id", id)
      .eq("adviser_id", adviser.id)
      .limit(1)
      .maybeSingle();

    if (sentError) throw sentError;
    if (!sentMsg) {
      return NextResponse.json({ success: false, message: "Principal message not found." }, { status: 404 });
    }

    // For sent messages, just mark read — no further insert needed
    if (replyBody || cleanedAttachments.length > 0) {
      const { data: latestPrincipalReply, error: latestPrincipalReplyError } = await supabase
        .from("principal_staff_messages")
        .select("*")
        .eq("source_adviser_message_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestPrincipalReplyError) throw latestPrincipalReplyError;

      if (!latestPrincipalReply) {
        return NextResponse.json(
          { success: false, message: "Wait for the principal to reply before adding another message to this conversation." },
          { status: 400 }
        );
      }

      const adviserName = fullName([adviser.first_name, adviser.last_name]);
      let followUpResult = await supabase
        .from("adviser_principal_messages")
        .insert({
          adviser_id: adviser.id,
          adviser_name: adviserName,
          adviser_email: adviser.email,
          principal_id: sentMsg.principal_id,
          source_staff_message_id: latestPrincipalReply.id,
          subject: sentMsg.subject,
          categories: sentMsg.categories ?? [],
          body: replyBody,
          attachments: cleanedAttachments,
          status: "unread",
        });

      if (followUpResult.error && isMissingAttachmentsColumn(followUpResult.error)) {
        if (cleanedAttachments.length > 0) {
          throw new Error("Attachment support is not migrated yet.");
        }
        followUpResult = await supabase
          .from("adviser_principal_messages")
          .insert({
            adviser_id: adviser.id,
            adviser_name: adviserName,
            adviser_email: adviser.email,
            principal_id: sentMsg.principal_id,
            source_staff_message_id: latestPrincipalReply.id,
            subject: sentMsg.subject,
            categories: sentMsg.categories ?? [],
            body: replyBody,
            status: "unread",
          });
      }

      if (followUpResult.error) throw followUpResult.error;
    }

    const { error: sentUpdateError } = await supabase
      .from("adviser_principal_messages")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("adviser_id", adviser.id);

    if (sentUpdateError && !sentUpdateError.message?.toLowerCase().includes("updated_at")) {
      throw sentUpdateError;
    }

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error("PATCH /api/reports/adviser-messages error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

async function createParentReport({
  parentId,
  studentId,
  adviser,
  subject,
  message,
  attachments,
}: {
  parentId: number;
  studentId: string;
  adviser: NonNullable<Awaited<ReturnType<typeof getAdviserFromToken>>>;
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

  const student = studentFromRelation((parentRow as unknown as ParentRow).students);
  if (!student) {
    return NextResponse.json({ success: false, message: "Student record not found for this parent." }, { status: 404 });
  }
  const adviserSections = Array.isArray(adviser.sections) && adviser.sections.length > 0
    ? adviser.sections
    : adviser.section
      ? [adviser.section]
      : [];

  if (student.grade !== adviser.grade || !adviserSections.includes(student.section ?? "")) {
    return NextResponse.json(
      { success: false, message: "This parent is not assigned to your advisory class." },
      { status: 403 }
    );
  }

  const adviserName = fullName([adviser.first_name, adviser.last_name]);
  const studentName = fullName([student.first_name, student.middle_name, student.last_name, student.suffix]);
  const typedParentRow = parentRow as unknown as ParentRow;
  const actualParentName = fullName([
    typedParentRow.parent_first_name,
    typedParentRow.parent_middle_name,
    typedParentRow.parent_last_name,
    typedParentRow.parent_suffix,
  ]);
  const parentName = displayParentName(studentName);

  // The legacy endpoint remains for existing clients, but direct staff
  // messages are stored in staff_messages and never create report workflow.
  const { data: createdMessage, error: messageError } = await supabase
    .from("staff_messages")
    .insert({
      sender_type: "adviser",
      sender_id: Number(adviser.id),
      sender_name: adviserName,
      sender_email: String(adviser.email ?? ""),
      recipient_type: "parent",
      recipient_id: Number(parentRow.id),
      recipient_name: actualParentName || parentName,
      recipient_email: parentRow.email,
      subject,
      categories: ["Message"],
      body: message,
      attachments,
      status: "unread",
    })
    .select("*")
    .single();
  if (messageError) throw messageError;

  await sendAdviserParentMessageEmail({
    parentEmail: parentRow.email,
    parentName: actualParentName || parentName,
    studentName,
    adviserName,
    subject,
    message,
    hasAttachments: attachments.length > 0,
  });

  await publishRealtimeInvalidation([
    { role: "adviser", id: Number(adviser.id) },
    { role: "parent", id: Number(parentRow.id) },
  ], "staff-messages");

  // ── Audit log ──
  await logAudit({
    action:          "Message",
    performedBy:     adviserName,
    performedByRole: "Adviser",
    targetUser:      actualParentName || parentName,
    targetRole:      "Parent",
    details:         `Adviser sent a direct message to parent: "${subject}".`,
    module:          "Reports",
  });

  return NextResponse.json({
    success: true,
    target: "parent",
    message: createdMessage,
  }, { status: 201 });
}

async function createPrincipalMessage({
  principalId,
  adviser,
  subject,
  categories,
  message,
  attachments,
}: {
  principalId: number;
  adviser: NonNullable<Awaited<ReturnType<typeof getAdviserFromToken>>>;
  subject: string;
  categories: string[];
  message: string;
  attachments: MessageAttachment[];
}) {
  const { data: principal, error: principalError } = await supabase
    .from("principals")
    .select("id, first_name, middle_name, last_name, suffix, email")
    .eq("id", principalId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (principalError) throw principalError;
  if (!principal) {
    return NextResponse.json({ success: false, message: "Principal recipient not found." }, { status: 404 });
  }

  const adviserName = fullName([adviser.first_name, adviser.last_name]);
  const { error } = await supabase
    .from("adviser_principal_messages")
    .insert({
      adviser_id: adviser.id,
      adviser_name: adviserName,
      adviser_email: adviser.email,
      principal_id: principalId,
      subject,
      categories,
      body: message,
      attachments,
      status: "unread",
    });

  if (error && isMissingAttachmentsColumn(error)) {
    if (attachments.length > 0) {
      throw new Error("Attachment support is not migrated yet. Please run adviser_principal_message_attachments_migration.sql in Supabase.");
    }
    const fallback = await supabase
      .from("adviser_principal_messages")
      .insert({
        adviser_id: adviser.id,
        adviser_name: adviserName,
        adviser_email: adviser.email,
        principal_id: principalId,
        subject,
        categories,
        body: message,
        status: "unread",
      });
    if (fallback.error) throw fallback.error;
  } else if (error) {
    throw error;
  }

  const principalRow = principal as PrincipalRow;
  const principalName = fullName([
    principalRow.first_name,
    principalRow.middle_name,
    principalRow.last_name,
    principalRow.suffix,
  ]) || "Principal";

  await sendAdviserPrincipalMessageEmail({
    principalEmail: principalRow.email,
    principalName,
    adviserName,
    subject,
    categories,
    message,
    hasAttachments: attachments.length > 0,
  });

  return NextResponse.json({ success: true, target: "principal" }, { status: 201 });
}
