"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Loader2, MessageSquare, Monitor, Paperclip, Search, Send, Upload, X } from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { UserAvatar } from "@/components/UserAvatar";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { keyForSubmission, type IdempotencyAttempt } from "@/lib/clientIdempotency";
import { useStaffMessagesRealtime } from "@/hooks/useStaffMessagesRealtime";

type Recipient = {
    id: string;
    role: "ICT";
    name: string;
};

type MessageAttachment = {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
};

type ThreadMessage = {
    id: number;
    senderRole: "Adviser" | "ICT";
    senderName: string;
    isCurrentUser: boolean;
    body: string;
    attachments?: MessageAttachment[];
    sentAt: string;
    status: string;
};

type Conversation = {
    id: number;
    conversationId: string;
    recipientId: string;
    otherRole: "Adviser" | "ICT";
    otherName: string;
    otherProfilePicture?: string | null;
    subject: string;
    body: string;
    sentAt: string;
    updatedAt: string;
    status: "New" | "Read" | "Replied";
    isUnread: boolean;
    thread: ThreadMessage[];
};

type GuidanceIctMessagesResponse = {
    success: boolean;
    message?: string;
    conversations?: Conversation[];
    recipients?: Recipient[];
    unreadCount?: number;
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function fileToAttachment(file: File): Promise<MessageAttachment> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            dataUrl: String(reader.result ?? ""),
        });
        reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
        reader.readAsDataURL(file);
    });
}

async function filesToAttachments(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    return Promise.all(files.map(fileToAttachment));
}

function statusClass(status: Conversation["status"]) {
    if (status === "New") return "bg-sky-500 text-white";
    if (status === "Replied") return "bg-sky-100 text-sky-700";
    return "bg-slate-200 text-slate-600";
}

function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

function initials(name: string) {
    return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "ICT";
}

function formatAttachmentSize(size: number) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChips({ attachments, mine = false }: { attachments?: MessageAttachment[]; mine?: boolean }) {
    if (!attachments?.length) return null;
    return (
        <div className={`mt-2 flex max-w-[75%] flex-wrap gap-2 ${mine ? "justify-end" : ""}`}>
            {attachments.map((attachment, index) => (
                <a
                    key={`${attachment.name}-${index}`}
                    href={attachment.dataUrl}
                    download={attachment.name}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="max-w-[180px] truncate">{attachment.name}</span>
                    <span className="shrink-0 text-slate-400">{formatAttachmentSize(attachment.size)}</span>
                </a>
            ))}
        </div>
    );
}

function ComposeModal({
    recipients,
    onClose,
    onSent,
}: {
    recipients: Recipient[];
    onClose: () => void;
    onSent: (payload: { recipientId: string; subject: string; message: string; attachments: MessageAttachment[] }) => Promise<void>;
}) {
    const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? "");
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const selected = recipients.find((recipient) => recipient.id === recipientId);
    const canSend = Boolean(recipientId && subject.trim() && (message.trim() || attachments.length > 0) && !sending);

    async function handleSend() {
        if (!canSend) return;
        setSending(true);
        setSendError(null);
        try {
            await onSent({ recipientId, subject: subject.trim(), message: message.trim(), attachments });
            setSent(true);
        } catch (error) {
            setSendError(error instanceof Error ? error.message : "Unable to send message.");
        } finally {
            setSending(false);
        }
    }

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/45 p-5" onClick={onClose}>
            <div className="flex max-h-[calc(100vh-40px)] w-[480px] flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-900">New Message</h2>
                        <p className="mt-1 text-sm text-slate-400">Send a message to ICT personnel</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {sent ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-10">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100">
                            <CheckCircle className="h-7 w-7 text-sky-500" />
                        </div>
                        <p className="text-base font-bold text-slate-900">Message Sent</p>
                        <p className="text-center text-sm text-slate-400">Your message has been sent to {selected?.name ?? "ICT"}.</p>
                        <button onClick={onClose} className="mt-2 rounded-xl bg-sky-500 px-7 py-2.5 text-sm font-bold text-white transition hover:bg-sky-600">
                            Done
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-5 px-6 py-5">
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-700">Recipient</label>
                            <select
                                value={recipientId}
                                onChange={(event) => setRecipientId(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            >
                                {recipients.map((recipient) => (
                                    <option key={recipient.id} value={recipient.id}>
                                        {recipient.name}
                                    </option>
                                ))}
                            </select>
                            {sendError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{sendError}</p>}
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-700">Subject</label>
                            <input
                                value={subject}
                                onChange={(event) => setSubject(event.target.value)}
                                placeholder="Enter subject..."
                                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-700">Message</label>
                            <textarea
                                value={message}
                                onChange={(event) => setMessage(event.target.value)}
                                placeholder="Type your message..."
                                rows={6}
                                className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            />
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-slate-700">Attachments</label>
                            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-4 transition hover:border-sky-300 hover:bg-sky-50/40">
                                <Upload className="h-5 w-5 text-slate-300" />
                                <p className="text-sm font-medium text-slate-500">Click to upload files</p>
                                <p className="text-xs text-slate-400">Max 10MB per file</p>
                                <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={async (event) => {
                                        if (event.target.files) {
                                            const nextAttachments = await filesToAttachments(event.target.files);
                                            setAttachments((prev) => [...prev, ...nextAttachments].slice(0, 5));
                                        }
                                        event.target.value = "";
                                    }}
                                />
                            </label>
                            {attachments.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {attachments.map((attachment, index) => (
                                        <span key={`${attachment.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                            <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                                            <span className="max-w-[160px] truncate">{attachment.name}</span>
                                            <span className="shrink-0 text-slate-400">{formatAttachmentSize(attachment.size)}</span>
                                            <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="text-slate-400 hover:text-red-500">
                                                <X className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                            <button onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                                Cancel
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={!canSend}
                                className="flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
                            >
                                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                Send Message
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ContactICTPage() {
    const { setIctUnreadCount } = useNotifContext();
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [reply, setReply] = useState("");
    const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sendingReply, setSendingReply] = useState(false);
    const [showCompose, setShowCompose] = useState(false);
    const threadEndRef = useRef<HTMLDivElement>(null);
    const newMessageAttemptRef = useRef<IdempotencyAttempt | null>(null);
    const replyAttemptRef = useRef<IdempotencyAttempt | null>(null);

    const selected = conversations.find((conversation) => conversation.conversationId === selectedId) ?? null;
    const filteredConversations = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return conversations;
        return conversations.filter((conversation) =>
            [conversation.otherName, conversation.subject, conversation.body]
                .join(" ")
                .toLowerCase()
                .includes(query)
        );
    }, [conversations, search]);

    const loadMessages = useCallback(async (background = false): Promise<boolean> => {
        if (!background) setLoading(true);
        if (!background) setError(null);
        try {
            const { response: res, data } = await fetchJsonWithRetry<GuidanceIctMessagesResponse>("/api/guidance-ict/messages", { cache: "no-store" });
            if (!res.ok || !data?.success) throw new Error(data?.message || "Unable to load ICT messages.");

            const nextConversations = (data.conversations ?? []) as Conversation[];
            setRecipients((data.recipients ?? []) as Recipient[]);
            setConversations(nextConversations);
            setIctUnreadCount(Number(data.unreadCount ?? 0));
            setSelectedId((current) => current ?? nextConversations[0]?.conversationId ?? null);
            setError(null);
            return true;
        } catch (err) {
            if (!background) setError(err instanceof Error ? err.message : "Unable to load ICT messages.");
            if (!background) {
                setConversations([]);
                setIctUnreadCount(0);
            }
            return false;
        } finally {
            if (!background) setLoading(false);
        }
    }, [setIctUnreadCount]);

    useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    const liveUpdateError = useStaffMessagesRealtime("guidance-ict-messages", loadMessages);

    useEffect(() => {
        threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [selected?.thread.length, selectedId]);

    async function openConversation(conversation: Conversation) {
        setSelectedId(conversation.conversationId);
        if (!conversation.isUnread) return;

        setConversations((prev) =>
            prev.map((item) => item.conversationId === conversation.conversationId ? { ...item, status: "Read", isUnread: false } : item)
        );
        setIctUnreadCount(Math.max(0, conversations.filter((item) => item.isUnread).length - 1));

        await fetch("/api/guidance-ict/messages", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId: conversation.conversationId, status: "read" }),
        }).catch(() => null);
        void loadMessages(true);
    }

    async function sendNewMessage(payload: { recipientId: string; subject: string; message: string; attachments: MessageAttachment[] }) {
        const idempotencyKey = keyForSubmission(newMessageAttemptRef, payload);
        const res = await fetch("/api/guidance-ict/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) throw new Error(data?.message || "Unable to send message.");
        newMessageAttemptRef.current = null;
        void loadMessages(true);
    }

    async function sendReply() {
        if (!selected || (!reply.trim() && replyAttachments.length === 0) || sendingReply) return;
        setSendingReply(true);
        try {
            const payload = {
                conversationId: selected.conversationId,
                recipientId: selected.recipientId,
                message: reply.trim(),
                attachments: replyAttachments,
            };
            const idempotencyKey = keyForSubmission(replyAttemptRef, payload);
            const res = await fetch("/api/guidance-ict/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) throw new Error(data?.message || "Unable to send reply.");
            replyAttemptRef.current = null;
            setReply("");
            setReplyAttachments([]);
            void loadMessages(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to send reply.");
        } finally {
            setSendingReply(false);
        }
    }

    return (
        <div className="flex h-full flex-col bg-slate-50">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 shadow-sm">
                        <Monitor className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Contact ICT</h1>
                        <p className="mt-0.5 text-xs text-slate-400">Messages between guidance and ICT personnel</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowCompose(true)}
                    className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600"
                >
                    <Send className="h-3.5 w-3.5" /> New Message
                </button>
            </div>

            {liveUpdateError && (
                <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-semibold text-amber-800">
                    {liveUpdateError}
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                <div className="flex w-full max-w-[400px] shrink-0 flex-col border-r border-slate-100 bg-white">
                    <div className="border-b border-slate-100 px-3 py-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search ICT messages..."
                                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                        {loading && <p className="py-8 text-center text-sm font-semibold text-slate-400">Loading messages...</p>}
                        {!loading && error && <p className="py-8 text-center text-sm font-semibold text-red-500">{error}</p>}
                        {!loading && !error && filteredConversations.length === 0 && (
                            <div className="mt-10 flex flex-col items-center gap-2 text-slate-400">
                                <MessageSquare className="h-8 w-8 opacity-30" />
                                <p className="text-xs font-semibold">No ICT messages yet</p>
                            </div>
                        )}
                        <div className="flex flex-col gap-1.5">
                            {filteredConversations.map((conversation) => (
                                <button
                                    key={conversation.conversationId}
                                    onClick={() => openConversation(conversation)}
                                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${selectedId === conversation.conversationId ? "border-sky-200 bg-sky-50" : "border-slate-100 bg-white hover:bg-slate-50"
                                        }`}
                                >
                                    <div className="mb-1 flex items-center gap-2">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-500">
                                            <Monitor className="h-3.5 w-3.5 text-white" />
                                        </div>
                                        <p className="flex-1 truncate text-[11px] font-bold text-slate-700">{conversation.subject}</p>
                                        {conversation.isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
                                    </div>
                                    <div className="flex items-center justify-between pl-9">
                                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusClass(conversation.status)}`}>
                                            {conversation.status}
                                        </span>
                                        <span className="text-[10px] text-slate-400">{formatDate(conversation.updatedAt)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex flex-1 flex-col overflow-hidden">
                    {!selected ? (
                        <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
                            <Monitor className="mb-3 h-10 w-10 opacity-30" />
                            <p className="text-sm font-semibold">Select a message or start a new conversation</p>
                        </div>
                    ) : (
                        <>
                            <div className="shrink-0 border-b border-l-4 border-l-sky-500 border-slate-100 bg-white px-6 py-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-500 text-xs font-bold text-white">
                                            {initials(selected.otherName)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-extrabold text-slate-900">{selected.otherName}</p>
                                        </div>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(selected.status)}`}>{selected.status}</span>
                                </div>
                                <h2 className="mt-3 text-base font-extrabold text-slate-900">{selected.subject}</h2>
                                <p className="mt-0.5 text-xs text-slate-400">{formatDate(selected.sentAt)}</p>
                            </div>

                            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
                                {selected.thread.map((message) => (
                                    <div key={message.id} className={`flex items-start gap-2.5 ${message.isCurrentUser ? "flex-row-reverse" : ""}`}>
                                        {!message.isCurrentUser && (
                                            <UserAvatar name={message.senderName} className="mt-0.5 h-8 w-8 rounded-full" fallbackClassName="bg-slate-500" />
                                        )}
                                        <div className={`flex flex-1 flex-col ${message.isCurrentUser ? "items-end" : "items-start"}`}>
                                        {message.body && (
                                            <div className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.isCurrentUser
                                                ? "rounded-br-sm bg-sky-500 text-white"
                                                : "rounded-bl-sm border border-slate-100 bg-white text-slate-700 shadow-sm"
                                                }`}>
                                                {message.body}
                                            </div>
                                        )}
                                        <AttachmentChips attachments={message.attachments} mine={message.isCurrentUser} />
                                        <p className="mt-1 text-[10px] text-slate-400">
                                            {message.isCurrentUser ? "You" : message.senderName} - {formatDate(message.sentAt)}
                                        </p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={threadEndRef} />
                            </div>

                            <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
                                {replyAttachments.length > 0 && (
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        {replyAttachments.map((attachment, index) => (
                                            <span key={`${attachment.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                                <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                                                <span className="max-w-[160px] truncate">{attachment.name}</span>
                                                <span className="shrink-0 text-slate-400">{formatAttachmentSize(attachment.size)}</span>
                                                <button type="button" onClick={() => setReplyAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="text-slate-400 hover:text-red-500">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-end gap-3">
                                    <textarea
                                        value={reply}
                                        onChange={(event) => setReply(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.shiftKey) {
                                                event.preventDefault();
                                                sendReply();
                                            }
                                        }}
                                        placeholder={`Reply to ${selected.otherName}...`}
                                        rows={2}
                                        className="flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                    />
                                    <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50">
                                        <Paperclip className="h-4 w-4" />
                                        <input
                                            type="file"
                                            multiple
                                            className="hidden"
                                            onChange={async (event) => {
                                                if (event.target.files) {
                                                    const nextAttachments = await filesToAttachments(event.target.files);
                                                    setReplyAttachments((prev) => [...prev, ...nextAttachments].slice(0, 5));
                                                }
                                                event.target.value = "";
                                            }}
                                        />
                                    </label>
                                    <button
                                        onClick={sendReply}
                                        disabled={(!reply.trim() && replyAttachments.length === 0) || sendingReply}
                                        className="flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
                                    >
                                        {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Reply
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showCompose && (
                <ComposeModal
                    recipients={recipients}
                    onClose={() => setShowCompose(false)}
                    onSent={sendNewMessage}
                />
            )}
        </div>
    );
}
