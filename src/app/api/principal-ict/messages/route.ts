import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalSession } from "@/app/api/reports/parent-adviser/_lib";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { sendStaffMessageEmail } from "@/lib/mailer";
import { idempotencyKeyFrom, isUniqueViolation } from "@/lib/serverIdempotency";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

type Role = "principal" | "ict";
type Session = {
    type: Role;
    id: number;
    name: string;
    email: string;
    profilePicture?: string | null;
};

type StaffMessageRow = {
    id: number;
    sender_type: Role;
    sender_id: number;
    sender_name: string;
    sender_email: string | null;
    recipient_type: Role;
    recipient_id: number;
    recipient_name: string;
    recipient_email: string | null;
    subject: string;
    body: string;
    attachments: MessageAttachment[] | null;
    status: string;
    source_message_id: number | null;
    created_at: string;
    updated_at: string | null;
};

type MessageAttachment = {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
};

type Recipient = {
    id: string;
    role: "Principal" | "ICT";
    name: string;
    email: string;
    meta?: string;
    profilePicture?: string | null;
};

function errorMessage(error: unknown) {
    if (isTransientConnectionError(error)) {
        return "ICT messages are temporarily unavailable. Please try again shortly.";
    }
    return error instanceof Error ? error.message : "Server error.";
}

function isTransientConnectionError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EHOSTUNREACH|ENETUNREACH|ECONNREFUSED/i.test(message);
}

function fullName(parts: Array<string | null | undefined>) {
    return parts.filter(Boolean).join(" ").trim();
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

async function currentSession(): Promise<Session | null> {
    const principal = await getPrincipalSession();
    if (principal?.id) {
        return {
            type: "principal",
            id: Number(principal.id),
            name: principal.name || "Principal",
            email: "",
        };
    }

    const ict = await getIctFromToken();
    if (ict?.id) {
        return {
            type: "ict",
            id: Number(ict.id),
            name: fullName([ict.first_name, ict.middle_name, ict.last_name, ict.suffix]) || "ICT Personnel",
            email: ict.email || "",
        };
    }

    return null;
}

function otherRole(role: Role): Role {
    return role === "principal" ? "ict" : "principal";
}

function roleLabel(role: Role): "Principal" | "ICT" {
    return role === "ict" ? "ICT" : "Principal";
}
function isPrincipalIctPair(row: StaffMessageRow) {
    const pair = new Set([row.sender_type, row.recipient_type]);
    return pair.has("principal") && pair.has("ict");
}

function isParticipant(row: StaffMessageRow, session: Session) {
    return (
        (row.sender_type === session.type && Number(row.sender_id) === session.id) ||
        (row.recipient_type === session.type && Number(row.recipient_id) === session.id)
    );
}

function isIncoming(row: StaffMessageRow, session: Session) {
    return row.recipient_type === session.type && Number(row.recipient_id) === session.id;
}

function conversationId(id: number) {
    // Contact ICT and the ICT Inbox must refer to the same saved root with
    // one opaque identifier so Realtime typing events match on both pages.
    return `staff-message:${id}`;
}

function rootIdFromConversationId(value: unknown) {
    const raw = String(value ?? "");
    // Keep the former route-specific key readable for an already-open tab,
    // but issue the shared staff-message key for every new response.
    const match = raw.match(/^(?:staff-message|principal-ict):([1-9][0-9]*)$/);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function mapConversation(root: StaffMessageRow, replies: StaffMessageRow[], session: Session) {
    const thread = [root, ...replies].sort(
        (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
    );
    const last = thread.at(-1) ?? root;
    const unread = thread.some((row) => isIncoming(row, session) && row.status === "unread");
    const otherIsRootSender = root.sender_type !== session.type || Number(root.sender_id) !== session.id;
    const otherType = otherIsRootSender ? root.sender_type : root.recipient_type;
    const otherId = otherIsRootSender ? root.sender_id : root.recipient_id;
    const otherName = otherIsRootSender ? root.sender_name : root.recipient_name;

    return {
        id: root.id,
        conversationId: conversationId(root.id),
        recipientId: `${otherType}:${otherId}`,
        otherRole: roleLabel(otherType),
        otherName,
        subject: root.subject,
        body: root.body,
        sentAt: root.created_at,
        updatedAt: last.created_at,
        status: unread ? "New" : thread.length > 1 ? "Replied" : "Read",
        isUnread: unread,
        thread: thread.map((row) => ({
            id: row.id,
            senderRole: roleLabel(row.sender_type),
            senderName: row.sender_name,
            isCurrentUser: row.sender_type === session.type && Number(row.sender_id) === session.id,
            body: row.body,
            attachments: cleanAttachments(row.attachments),
            sentAt: row.created_at,
            status: row.status,
        })),
    };
}

async function recipientsFor(session: Session): Promise<Recipient[]> {
    if (session.type === "principal") {
        const { data, error } = await supabase
            .from("ict_admins")
            .select("id, first_name, middle_name, last_name, suffix, email, status")
            .eq("status", "active")
            .order("last_name", { ascending: true });

        if (error) throw error;

        return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: `ict:${row.id}`,
            role: "ICT" as const,
            name: fullName([
                row.first_name as string | null,
                row.middle_name as string | null,
                row.last_name as string | null,
                row.suffix as string | null,
            ]) || "ICT Personnel",
                email: String(row.email ?? ""),
        }));
    }

    const { data, error } = await supabase
        .from("advisers")
        .select("id, first_name, middle_name, last_name, suffix, email, grade, section, status")
        .eq("status", "active")
        .order("last_name", { ascending: true });

    if (error) throw error;

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: `adviser:${row.id}`,
        role: "Principal" as const,
        name: fullName([
            row.first_name as string | null,
            row.middle_name as string | null,
            row.last_name as string | null,
            row.suffix as string | null,
        ]) || "Adviser",
        email: String(row.email ?? ""),
        meta: [row.grade, row.section].filter(Boolean).join(" - "),
    }));
}

async function findRecipient(session: Session, recipientId: string) {
    const [type, rawId] = recipientId.split(":") as [Role, string];
    const id = Number(rawId);
    if (type !== otherRole(session.type) || !Number.isFinite(id)) return null;

    const recipients = await recipientsFor(session);
    return recipients.find((recipient) => recipient.id === `${type}:${id}`) ?? null;
}

export async function GET(req: NextRequest) {
    try {
        const session = await currentSession();
        if (!session) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        if (req.nextUrl.searchParams.get("summary") === "1") {
            const seenAfter = Date.parse(req.nextUrl.searchParams.get("seenAfter") ?? "");
            let unreadQuery = supabase
                .from("staff_messages")
                .select("id, source_message_id")
                .eq("sender_type", otherRole(session.type))
                .eq("recipient_type", session.type)
                .eq("recipient_id", session.id)
                .eq("status", "unread");
            if (Number.isFinite(seenAfter)) {
                unreadQuery = unreadQuery.gt("created_at", new Date(seenAfter).toISOString());
            }
            const { data, error } = await unreadQuery;
            if (error) throw error;
            const unreadConversationIds = new Set((data ?? []).map((row) =>
                Number(row.source_message_id) || Number(row.id)
            ));
            return NextResponse.json({ success: true, unreadCount: unreadConversationIds.size });
        }

        const [recipients, messagesResult] = await Promise.all([
            recipientsFor(session),
            supabase
                .from("staff_messages")
                .select("*")
                .or(
                    `and(sender_type.eq.${session.type},sender_id.eq.${session.id}),and(recipient_type.eq.${session.type},recipient_id.eq.${session.id})`
                )
                .order("created_at", { ascending: true }),
        ]);

        if (messagesResult.error) throw messagesResult.error;

        const rows = ((messagesResult.data ?? []) as StaffMessageRow[])
            .filter((row) => isParticipant(row, session))
            .filter(isPrincipalIctPair);

        const roots = rows.filter((row) => !row.source_message_id);
        const repliesByRoot = new Map<number, StaffMessageRow[]>();
        for (const row of rows) {
            if (!row.source_message_id) continue;
            const current = repliesByRoot.get(Number(row.source_message_id)) ?? [];
            current.push(row);
            repliesByRoot.set(Number(row.source_message_id), current);
        }

        const conversations = roots
            .map((root) => mapConversation(root, repliesByRoot.get(root.id) ?? [], session))
            .map((conversation) => ({ ...conversation, otherProfilePicture: null }))
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

        // Retain email addresses only for server-side message routing.
        const publicRecipients = recipients.map((recipient) => ({
            id: recipient.id,
            role: recipient.role,
            name: recipient.name,
            meta: recipient.meta,
            profilePicture: recipient.profilePicture,
        }));

        return NextResponse.json({
            success: true,
            currentUser: {
                role: roleLabel(session.type),
                id: `${session.type}:${session.id}`,
                name: session.name,
            },
            recipients: publicRecipients,
            conversations,
            unreadCount: conversations.filter((conversation) => conversation.isUnread).length,
        });
    } catch (error) {
        const unavailable = isTransientConnectionError(error);
        (unavailable ? console.warn : console.error)("GET /api/principal-ict/messages error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: unavailable ? 503 : 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await currentSession();
        if (!session) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const idempotencyKey = idempotencyKeyFrom(req);
        if (!idempotencyKey) {
            return NextResponse.json({ success: false, message: "A valid idempotency key is required." }, { status: 400 });
        }
        const body = await req.json();
        const trimmedSubject = String(body.subject ?? "").trim();
        const trimmedMessage = String(body.message ?? "").trim();
        const cleanedAttachments = cleanAttachments(body.attachments);
        const rootId = rootIdFromConversationId(body.conversationId);

        if (!trimmedMessage && cleanedAttachments.length === 0) {
            return NextResponse.json({ success: false, message: "Message or attachment is required." }, { status: 400 });
        }

        let recipientId = String(body.recipientId ?? "");
        let subject = trimmedSubject;

        if (rootId) {
            const { data: root, error } = await supabase
                .from("staff_messages")
                .select("*")
                .eq("id", rootId)
                .maybeSingle();

            if (error) throw error;
            if (!root) {
                return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
            }

            const typedRoot = root as StaffMessageRow;
            if (!isParticipant(typedRoot, session) || !isPrincipalIctPair(typedRoot)) {
                return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
            }

            const currentIsSender = typedRoot.sender_type === session.type && Number(typedRoot.sender_id) === session.id;
            const recipientType = currentIsSender ? typedRoot.recipient_type : typedRoot.sender_type;
            const rawRecipientId = currentIsSender ? typedRoot.recipient_id : typedRoot.sender_id;
            recipientId = `${recipientType}:${rawRecipientId}`;
            subject = typedRoot.subject;
        }

        if (!rootId && !subject) {
            return NextResponse.json({ success: false, message: "Subject is required." }, { status: 400 });
        }

        const recipient = await findRecipient(session, recipientId);
        if (!recipient) {
            return NextResponse.json(
                { success: false, message: "Invalid recipient. Adviser-ICT messaging only allows Advisers and ICT personnel." },
                { status: 403 }
            );
        }

        const [recipientType, rawRecipientId] = recipient.id.split(":") as [Role, string];
        const { data: existing, error: existingError } = await supabase
            .from("staff_messages")
            .select("id")
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
        if (existingError) throw existingError;
        if (existing) return NextResponse.json({ success: true, idempotent: true }, { status: 200 });

        const { data: createdMessage, error } = await supabase.from("staff_messages").insert({
            sender_type: session.type,
            sender_id: session.id,
            sender_name: session.name,
            sender_email: session.email,
            recipient_type: recipientType,
            recipient_id: Number(rawRecipientId),
            recipient_name: recipient.name,
            recipient_email: recipient.email,
            subject,
            categories: ["Principal-ICT"],
            body: trimmedMessage,
            attachments: cleanedAttachments,
            source_message_id: rootId,
            status: "unread",
            idempotency_key: idempotencyKey,
        }).select("*").single();

        if (error) {
            if (isUniqueViolation(error)) return NextResponse.json({ success: true, idempotent: true }, { status: 200 });
            throw error;
        }

        if (rootId) {
            // A response is an acknowledgement for incoming messages in the
            // same thread; leave the stored reply itself as a separate row.
            const now = new Date().toISOString();
            const [{ error: rootReadError }, { error: repliesReadError }] = await Promise.all([
                supabase.from("staff_messages")
                    .update({ status: "read", updated_at: now })
                    .eq("id", rootId)
                    .eq("recipient_type", session.type)
                    .eq("recipient_id", session.id)
                    .eq("status", "unread"),
                supabase.from("staff_messages")
                    .update({ status: "read", updated_at: now })
                    .eq("source_message_id", rootId)
                    .eq("recipient_type", session.type)
                    .eq("recipient_id", session.id)
                    .eq("status", "unread"),
            ]);
            if (rootReadError) throw rootReadError;
            if (repliesReadError) throw repliesReadError;
        }

        // Notify the open ICT Inbox as soon as the row is committed. A slow
        // email provider cannot be allowed to delay this live update.
        await publishRealtimeInvalidation([
            { role: session.type, id: session.id },
            { role: recipientType, id: Number(rawRecipientId) },
        ], {
            scope: "staff-messages",
            kind: "message",
            conversationId: conversationId(rootId ?? Number(createdMessage.id)),
            messageId: Number(createdMessage.id),
        });

        // Only send email for new messages, not replies.
        if (!rootId) after(async () => {
            try {
                await sendStaffMessageEmail({
                    recipientEmail: recipient.email,
                    recipientName: recipient.name,
                    senderName: session.name,
                    senderRole: session.type === "principal" ? "Principal" : "ICT",
                    subject,
                    message: trimmedMessage,
                    hasAttachments: cleanedAttachments.length > 0,
                });
            } catch (emailError) {
                console.error("Email notification failed:", emailError);
            }
        });

        return NextResponse.json({ success: true, message: createdMessage }, { status: 201 });
    } catch (error) {
        const unavailable = isTransientConnectionError(error);
        (unavailable ? console.warn : console.error)("POST /api/principal-ict/messages error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: unavailable ? 503 : 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await currentSession();
        if (!session) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const body = await req.json();
        const rootId = rootIdFromConversationId(body.conversationId);
        const status = String(body.status ?? "").toLowerCase();

        if (!rootId || status !== "read") {
            return NextResponse.json({ success: false, message: "Valid conversation and read status are required." }, { status: 400 });
        }

        const { data: root, error: rootError } = await supabase
            .from("staff_messages")
            .select("*")
            .eq("id", rootId)
            .maybeSingle();

        if (rootError) throw rootError;
        if (!root) {
            return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
        }

        const typedRoot = root as StaffMessageRow;
        if (!isParticipant(typedRoot, session) || !isPrincipalIctPair(typedRoot)) {
            return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
        }

        const now = new Date().toISOString();
        const { error: rootReadError } = await supabase
            .from("staff_messages")
            .update({ status: "read", updated_at: now })
            .eq("id", rootId)
            .eq("recipient_type", session.type)
            .eq("recipient_id", session.id)
            .eq("status", "unread");

        if (rootReadError) throw rootReadError;

        const { error: repliesReadError } = await supabase
            .from("staff_messages")
            .update({ status: "read", updated_at: now })
            .eq("source_message_id", rootId)
            .eq("recipient_type", session.type)
            .eq("recipient_id", session.id)
            .eq("status", "unread");

        if (repliesReadError) throw repliesReadError;

        await publishRealtimeInvalidation([
            { role: typedRoot.sender_type, id: Number(typedRoot.sender_id) },
            { role: typedRoot.recipient_type, id: Number(typedRoot.recipient_id) },
        ], "staff-messages");

        return NextResponse.json({ success: true });
    } catch (error) {
        const unavailable = isTransientConnectionError(error);
        (unavailable ? console.warn : console.error)("PATCH /api/principal-ict/messages error:", error);
        return NextResponse.json({ success: false, message: errorMessage(error) }, { status: unavailable ? 503 : 500 });
    }
}
