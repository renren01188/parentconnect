"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Loader2, MessageSquare, Monitor, Paperclip, Search, Send, Upload, X } from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { UserAvatar } from "@/components/UserAvatar";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { sortByLatestActivity } from "@/lib/latestActivityOrder";
import { useStaffMessagesRealtime } from "@/hooks/useStaffMessagesRealtime";
import { useStaffConversationTyping } from "@/hooks/useStaffConversationTyping";
import { keyForSubmission, type IdempotencyAttempt } from "@/lib/clientIdempotency";
import { MessageAttachments } from "@/components/MessageAttachments";

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

type CreatedStaffMessage = {
  id: number;
  created_at: string;
  sender_name?: string | null;
};

type AdviserIctMessagesResponse = {
  success: boolean;
  message?: string | CreatedStaffMessage;
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
  if (status === "New") return "bg-emerald-500 text-white";
  if (status === "Replied") return "bg-emerald-100 text-emerald-700";
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

function responseErrorMessage(data: AdviserIctMessagesResponse | null, fallback: string) {
  return typeof data?.message === "string" ? data.message : fallback;
}

// Preserve a saved Realtime reply while a slower, older list request finishes.
// The database IDs make this merge idempotent and keep the active thread live.
function mergeConversations(current: Conversation[], incoming: Conversation[]) {
  const currentById = new Map(current.map((conversation) => [conversation.conversationId, conversation]));
  return sortByLatestActivity(incoming.map((conversation) => {
    const existing = currentById.get(conversation.conversationId);
    if (!existing) return conversation;

    const messages = new Map<string, ThreadMessage>();
    [...existing.thread, ...conversation.thread].forEach((message) => {
      messages.set(String(message.id), message);
    });
    return { ...conversation, thread: Array.from(messages.values()) };
  }));
}

function AttachmentChips({ attachments, mine = false }: { attachments?: MessageAttachment[]; mine?: boolean }) {
  return <MessageAttachments attachments={attachments} mine={mine} className="mt-2 flex max-w-[75%] flex-wrap gap-2" />;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-3 sm:p-5 md:justify-end" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[480px] flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">New Message</h2>
            <p className="mt-1 text-sm text-slate-400">Send a message to ICT personnel</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 sm:px-6 sm:py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-base font-bold text-slate-900">Message Sent</p>
            <p className="text-center text-sm text-slate-400">Your message has been sent to {selected?.name ?? "ICT"}.</p>
            <button onClick={onClose} className="mt-2 rounded-xl bg-emerald-500 px-7 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600">
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Recipient</label>
              <select
                value={recipientId}
                onChange={(event) => setRecipientId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Message</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Type your message..."
                rows={5}
                className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Attachments</label>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/40">
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
              <MessageAttachments
                attachments={attachments}
                onRemove={(index) => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                className="mt-2 flex max-w-full flex-wrap gap-2"
              />
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={onClose} className="w-full rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto sm:py-2.5">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto sm:py-2.5"
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
  const { setIctUnreadCount, clearIctUnreadCount } = useNotifContext();
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
  // Realtime may refresh this list before an older request returns. Keep the
  // most recent snapshot so the new ICT reply cannot be overwritten.
  const messagesRequestVersionRef = useRef(0);
  const newMessageAttemptRef = useRef<IdempotencyAttempt | null>(null);
  const replyAttemptRef = useRef<IdempotencyAttempt | null>(null);
  const openedConversationIdRef = useRef<string | null>(null);

  const selected = conversations.find((conversation) => conversation.conversationId === selectedId) ?? null;
  const conversationTyping = useStaffConversationTyping(selected?.conversationId ?? null, "adviser");
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
    const requestVersion = ++messagesRequestVersionRef.current;
    if (!background) setLoading(true);
    if (!background) setError(null);
    try {
      const { response: res, data } = await fetchJsonWithRetry<AdviserIctMessagesResponse>("/api/adviser-ict/messages", { cache: "no-store" });
      if (!res.ok || !data?.success) throw new Error(responseErrorMessage(data, "Unable to load ICT messages."));

      if (requestVersion !== messagesRequestVersionRef.current) return true;

      const nextConversations = (data.conversations ?? []) as Conversation[];
      setRecipients((data.recipients ?? []) as Recipient[]);
      setConversations((current) => mergeConversations(current, nextConversations));
      setSelectedId((current) => current ?? nextConversations[0]?.conversationId ?? null);
      setError(null);
      return true;
    } catch (err) {
      if (requestVersion !== messagesRequestVersionRef.current) return true;
      if (!background) {
        setError(err instanceof Error ? err.message : "Unable to load ICT messages.");
        setConversations([]);
        setIctUnreadCount(0);
      }
      return false;
    } finally {
      // A Realtime background refresh can supersede the first page-load
      // request. It may populate the conversation list before that original
      // request finishes, but must not leave its foreground loader visible.
      if (!background) setLoading(false);
    }
  }, [setIctUnreadCount]);

  const acknowledgeConversation = useCallback(async (conversation: Conversation) => {
    if (!conversation.isUnread) return;
    setConversations((prev) =>
      prev.map((item) => item.conversationId === conversation.conversationId
        ? { ...item, status: "Read", isUnread: false }
        : item)
    );
    await fetch("/api/adviser-ict/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.conversationId, status: "read" }),
    }).catch(() => null);
    void loadMessages(true);
  }, [loadMessages]);

  useEffect(() => {
    clearIctUnreadCount();
  }, [clearIctUnreadCount]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (selected?.isUnread && openedConversationIdRef.current === selected.conversationId) {
      void acknowledgeConversation(selected);
    }
  }, [acknowledgeConversation, selected?.conversationId, selected?.isUnread]);

  const liveUpdateNotice = useStaffMessagesRealtime(loadMessages, {
    onConversationUpdate: conversationTyping.onRealtimeEvent,
  });

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.thread.length, selectedId]);

  function openConversation(conversation: Conversation) {
    openedConversationIdRef.current = conversation.conversationId;
    setSelectedId(conversation.conversationId);
    void acknowledgeConversation(conversation);
  }

  async function sendNewMessage(payload: { recipientId: string; subject: string; message: string; attachments: MessageAttachment[] }) {
    const idempotencyKey = keyForSubmission(newMessageAttemptRef, payload);
    const res = await fetch("/api/adviser-ict/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null) as AdviserIctMessagesResponse | null;
    if (!res.ok || !data?.success) throw new Error(responseErrorMessage(data, "Unable to send message."));
    newMessageAttemptRef.current = null;

    // The write route returns the saved row. Render it now instead of waiting
    // for the asynchronous Realtime refresh, then reconcile in the background.
    // This also protects the sender from a slow subscription or network fetch.
    if (data.message && typeof data.message !== "string") {
      const recipient = recipients.find((item) => item.id === payload.recipientId);
      if (recipient) {
        const created = data.message;
        const conversationId = `staff-message:${created.id}`;
        const sentMessage: ThreadMessage = {
          id: created.id,
          senderRole: "Adviser",
          senderName: created.sender_name || "Adviser",
          isCurrentUser: true,
          body: payload.message,
          attachments: payload.attachments,
          sentAt: created.created_at,
          status: "Read",
        };
        const conversation: Conversation = {
          id: created.id,
          conversationId,
          recipientId: recipient.id,
          otherRole: "ICT",
          otherName: recipient.name,
          subject: payload.subject,
          body: payload.message,
          sentAt: created.created_at,
          updatedAt: created.created_at,
          status: "Read",
          isUnread: false,
          thread: [sentMessage],
        };

        // Invalidate an older in-flight snapshot before placing the new root
        // at the top of Panel 1 and showing it in the message box.
        messagesRequestVersionRef.current += 1;
        setConversations((current) => sortByLatestActivity([
          conversation,
          ...current.filter((item) => item.conversationId !== conversationId),
        ]));
        setSelectedId(conversationId);
      }
    }
    void loadMessages(true);
  }

  async function sendReply() {
    if (!selected || (!reply.trim() && replyAttachments.length === 0) || sendingReply) return;
    setSendingReply(true);
    try {
      const replyBody = reply.trim();
      const attachments = replyAttachments;
      const payload = {
        conversationId: selected.conversationId,
        recipientId: selected.recipientId,
        message: replyBody,
        attachments,
      };
      const idempotencyKey = keyForSubmission(replyAttemptRef, payload);
      const res = await fetch("/api/adviser-ict/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null) as AdviserIctMessagesResponse | null;
      if (!res.ok || !data?.success) throw new Error(responseErrorMessage(data, "Unable to send reply."));
      replyAttemptRef.current = null;
      setReply("");
      setReplyAttachments([]);
      conversationTyping.stopTyping();

      if (data.message && typeof data.message !== "string") {
        const created = data.message;
        const sentMessage: ThreadMessage = {
          id: created.id,
          senderRole: "Adviser",
          senderName: created.sender_name || "Adviser",
          isCurrentUser: true,
          body: replyBody,
          attachments,
          sentAt: created.created_at,
          status: "Replied",
        };

        messagesRequestVersionRef.current += 1;
        setConversations((current) => sortByLatestActivity(current.map((conversation) => {
          if (conversation.conversationId !== selected.conversationId) return conversation;
          if (conversation.thread.some((message) => message.id === sentMessage.id)) return conversation;
          return {
            ...conversation,
            body: replyBody || conversation.body,
            updatedAt: created.created_at,
            status: "Replied",
            isUnread: false,
            thread: [...conversation.thread, sentMessage],
          };
        })));
      }
      void loadMessages(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send reply.");
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col bg-slate-50 md:h-full">
      <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 shadow-sm">
            <Monitor className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Contact ICT</h1>
            <p className="mt-0.5 text-xs text-slate-400">Messages between advisers and ICT personnel</p>
          </div>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 md:w-auto"
        >
          <Send className="h-3.5 w-3.5" /> New Message
        </button>
      </div>
      {liveUpdateNotice && (
        <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 sm:px-6">
          {liveUpdateNotice}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <div className={`${selected ? "hidden md:flex" : "flex"} h-full min-h-0 w-full shrink-0 flex-col border-b border-slate-100 bg-white md:max-w-[400px] md:border-b-0 md:border-r`}>
          <div className="border-b border-slate-100 px-3 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ICT messages..."
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    selectedId === conversation.conversationId ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500">
                      <Monitor className="h-3.5 w-3.5 text-white" />
                    </div>
                    <p className="flex-1 truncate text-[11px] font-bold text-slate-700">{conversation.subject}</p>
                    {conversation.isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
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

        <div className={`${selected ? "flex" : "hidden md:flex"} min-h-0 flex-1 flex-col overflow-hidden`}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
              <Monitor className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold">Select a message or start a new conversation</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-l-4 border-l-emerald-500 border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="mb-3 inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 md:hidden"
                >
                  ← All conversations
                </button>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-500 text-xs font-bold text-white">
                      {initials(selected.otherName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-extrabold text-slate-900">{selected.otherName}</p>
                        <span className="shrink-0 rounded-full bg-[#274e13] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                          {selected.otherRole}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(selected.status)}`}>{selected.status}</span>
                </div>
                <h2 className="mt-3 text-base font-extrabold text-slate-900">{selected.subject}</h2>
                <p className="mt-0.5 text-xs text-slate-400">{formatDate(selected.sentAt)}</p>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                {selected.thread.map((message) => {
                  const senderName = message.senderName || message.senderRole;
                  const senderRoleClass = message.senderRole === "ICT"
                    ? "bg-[#274e13] text-white shadow-sm"
                    : "bg-emerald-500 text-white shadow-sm";
                  return (
                  <div key={message.id} className={`flex items-start gap-2.5 ${message.isCurrentUser ? "flex-row-reverse" : ""}`}>
                    <UserAvatar
                      name={senderName}
                      className="mt-0.5 h-8 w-8 shrink-0 rounded-full"
                      fallbackClassName={message.isCurrentUser ? "bg-emerald-500" : "bg-slate-500"}
                    />
                    <div className={`flex flex-1 flex-col ${message.isCurrentUser ? "items-end" : "items-start"}`}>
                    <div className={`mb-1 flex max-w-[85%] flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500 sm:max-w-[75%] ${message.isCurrentUser ? "flex-row-reverse" : ""}`}>
                      <span className="break-words">{senderName}</span>
                      <span className={`rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-extrabold ${senderRoleClass}`}>{message.senderRole}</span>
                    </div>
                    {message.body && (
                      <div className={`max-w-[85%] break-words whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] ${
                        message.isCurrentUser
                          ? "rounded-br-sm bg-emerald-500 text-white"
                          : "rounded-bl-sm border border-slate-100 bg-white text-slate-700 shadow-sm"
                      }`}>
                        {message.body}
                      </div>
                    )}
                    <AttachmentChips attachments={message.attachments} mine={message.isCurrentUser} />
                    <p className="mt-1 text-[10px] text-slate-400">{formatDate(message.sentAt)}</p>
                    </div>
                  </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-6 sm:py-4">
                {conversationTyping.isOtherParticipantTyping && (
                  <div aria-live="polite" className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="flex gap-1" aria-hidden="true"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:300ms]" /></span>
                    The other participant is typing…
                  </div>
                )}
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
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                  <textarea
                    value={reply}
                    onChange={(event) => { setReply(event.target.value); conversationTyping.onDraftChange(Boolean(event.target.value.trim())); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder={`Reply to ${selected.otherName}...`}
                    rows={2}
                    className="w-full min-w-0 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 sm:flex-1"
                  />
                  <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                  <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 sm:h-10 sm:w-10">
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
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:flex-none"
                  >
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Reply
                  </button>
                  </div>
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
