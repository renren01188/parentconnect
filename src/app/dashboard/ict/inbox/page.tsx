"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle, Inbox, Loader2, MessageSquare, Paperclip, Plus, Reply, Search, Send, Upload, X } from "lucide-react";
import { useNotifications } from "@/app/dashboard/ict/context/NotificationContext";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useStaffMessagesRealtime } from "@/hooks/useStaffMessagesRealtime";

type Recipient = {
  id: string;
  role: "Adviser" | "Guidance" | "Principal";
  name: string;
  email: string;
  grade?: string;
  section?: string;
};

type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

type ThreadMessage = {
  id?: number;
  senderRole: "Adviser" | "Guidance" | "Principal" | "ICT";
  senderName: string;
  senderEmail: string;
  isCurrentUser: boolean;
  body: string;
  sentAt: string;
  status?: string;
  attachments?: MessageAttachment[];
};

type Conversation = {
  id: number;
  conversationId: string;
  recipientId?: string;
  otherRole: "Adviser" | "Guidance" | "Principal" | "ICT";
  otherName: string;
  otherEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  updatedAt: string;
  status: "New" | "Read" | "Replied";
  isUnread: boolean;
  thread: ThreadMessage[];
};

type StaffApiRecipient = Recipient & {
  type?: "staff";
};

type StaffApiReply = {
  id: number;
  sender: ThreadMessage["senderRole"];
  sender_name: string;
  sender_email: string;
  is_current_user: boolean;
  message: string;
  sent_at: string;
  attachments?: MessageAttachment[];
};

type StaffApiMessage = {
  id: number;
  conversationId: string;
  sender: Conversation["otherRole"];
  sender_name: string;
  sender_email: string;
  message_sender: ThreadMessage["senderRole"];
  message_sender_name: string;
  message_sender_email: string;
  message_sender_is_current: boolean;
  subject: string;
  message: string;
  attachments?: MessageAttachment[];
  sent_at: string;
  status: Conversation["status"];
  replies?: StaffApiReply[];
  sortAt?: number;
};

type StaffMessagesResponse = {
  success: boolean;
  message?: string;
  messages?: StaffApiMessage[];
  recipients?: StaffApiRecipient[];
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

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
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

function statusClass(status: Conversation["status"]) {
  if (status === "New") return "bg-[#274e13] text-white";
  if (status === "Replied") return "bg-emerald-100 text-emerald-700";
  return "bg-gray-200 text-gray-600";
}

function formatAttachmentSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChips({ attachments, mine = false }: { attachments?: MessageAttachment[]; mine?: boolean }) {
  if (!attachments?.length) return null;
  return (
    <div className={`mt-2 flex max-w-full flex-wrap gap-2 ${mine ? "justify-end" : ""}`}>
      {attachments.map((attachment, index) => (
        <a
          key={`${attachment.name}-${index}`}
          href={attachment.dataUrl}
          download={attachment.name}
          className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
            mine
              ? "border-[#274e13]/20 bg-white text-gray-700 hover:bg-gray-50"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="max-w-[140px] truncate sm:max-w-[180px]">{attachment.name}</span>
          <span className="shrink-0 text-gray-400">{formatAttachmentSize(attachment.size)}</span>
        </a>
      ))}
    </div>
  );
}

function roleClass(role: Recipient["role"] | Conversation["otherRole"]) {
  if (role === "Principal") return "bg-violet-50 text-violet-700";
  if (role === "Guidance") return "bg-sky-50 text-sky-700";
  if (role === "Adviser") return "bg-[#274e13]/10 text-[#274e13]";
  return "bg-gray-100 text-gray-600";
}

function recipientMeta(recipient: Recipient) {
  if (recipient.role === "Principal") return recipient.email || "Principal";
  const assignment = [recipient.grade, recipient.section].filter(Boolean).join(" - ");
  return assignment || recipient.email || recipient.role;
}

function normalizeStaffConversation(message: StaffApiMessage): Conversation {
  return {
    id: message.id,
    conversationId: message.conversationId,
    otherRole: message.sender,
    otherName: message.sender_name,
    otherEmail: message.sender_email,
    subject: message.subject,
    body: message.message,
    sentAt: message.sent_at,
    updatedAt: message.sent_at,
    status: message.status,
    isUnread: message.status === "New",
    thread: [
      {
        id: message.id,
        senderRole: message.message_sender,
        senderName: message.message_sender_name,
        senderEmail: message.message_sender_email,
        isCurrentUser: message.message_sender_is_current,
        body: message.message,
        sentAt: message.sent_at,
        status: message.status,
        attachments: message.attachments ?? [],
      },
      ...((message.replies ?? []).map((reply) => ({
        id: reply.id,
        senderRole: reply.sender,
        senderName: reply.sender_name,
        senderEmail: reply.sender_email,
        isCurrentUser: reply.is_current_user,
        body: reply.message,
        sentAt: reply.sent_at,
        attachments: reply.attachments ?? [],
      }))),
    ],
  };
}

function mergeConversations(current: Conversation[], incoming: Conversation[]) {
  const currentById = new Map(current.map((conversation) => [conversation.conversationId, conversation]));
  return incoming.map((conversation) => {
    const existing = currentById.get(conversation.conversationId);
    if (!existing) return conversation;

    // A database event can arrive while the post-response update is being
    // rendered. Stable message IDs make the merge idempotent in either order.
    const messages = new Map<string, ThreadMessage>();
    [...existing.thread, ...conversation.thread].forEach((message) => {
      messages.set(String(message.id ?? `${message.senderEmail}-${message.sentAt}-${message.body}`), message);
    });
    return { ...conversation, thread: Array.from(messages.values()) };
  });
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
  const [recipientSearch, setRecipientSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const filteredRecipients = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) return recipients;
    return recipients.filter((recipient) =>
      [recipient.name, recipient.email, recipient.role, recipient.grade, recipient.section].join(" ").toLowerCase().includes(query)
    );
  }, [recipients, recipientSearch]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:items-start sm:justify-end sm:p-5" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100vh-40px)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">New Message</h2>
            <p className="mt-0.5 text-xs text-gray-400">Send a message to school staff or the principal</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-7 w-7 text-emerald-500" />
            </div>
            <p className="text-base font-bold text-gray-900">Message Sent</p>
            <p className="text-center text-sm text-gray-400">Your message has been sent to {selected?.name ?? "the selected recipient"}.</p>
            <button onClick={onClose} className="mt-2 rounded-xl bg-[#274e13] px-7 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3f0f]">
              Done
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-600">Recipient</label>
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  placeholder="Search school staff or principal..."
                  className="flex-1 text-sm outline-none"
                />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200">
                {filteredRecipients.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs font-semibold text-gray-400">No recipients found.</p>
                ) : filteredRecipients.map((recipient) => (
                  <button
                    key={recipient.id}
                    type="button"
                    onClick={() => setRecipientId(recipient.id)}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-gray-50 ${recipientId === recipient.id ? "bg-[#274e13]/5" : ""}`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#274e13] text-xs font-bold text-white">
                      {initials(recipient.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">{recipient.name}</p>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${roleClass(recipient.role)}`}>
                          {recipient.role === "Guidance" ? "School Staff" : recipient.role}
                        </span>
                        <p className="truncate text-xs text-gray-400">{recipientMeta(recipient)}</p>
                      </div>
                    </div>
                    {recipientId === recipient.id && <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </button>
                ))}
              </div>
              {sendError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{sendError}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-600">Subject</label>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Enter subject..."
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-600">Message</label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                placeholder="Write your message..."
                className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-600">Attachments</label>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-4 transition hover:border-[#274e13]/40 hover:bg-[#274e13]/5">
                <Upload className="h-5 w-5 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">Click to upload files</p>
                <p className="text-xs text-gray-400">Max 10MB per file</p>
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
                    <span key={`${attachment.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
                      <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
                      <span className="max-w-[160px] truncate">{attachment.name}</span>
                      <span className="shrink-0 text-gray-400">{formatAttachmentSize(attachment.size)}</span>
                      <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="text-gray-400 hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
              <button onClick={onClose} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="flex items-center gap-2 rounded-xl bg-[#274e13] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1f3f0f] disabled:cursor-not-allowed disabled:bg-[#274e13]/40"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {sending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ICTInboxPage() {
  const { markInboxSeen } = useNotifications();
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"All" | "Unread" | "Read" | "Replied">("All");
  const [reply, setReply] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((conversation) => conversation.conversationId === selectedId) ?? null;
  const unreadCount = conversations.filter((conversation) => conversation.isUnread).length;

  // Dismiss the sidebar attention badge without changing a thread's read state.
  // A thread is still marked read only by openConversation or a reply.
  useEffect(() => {
    markInboxSeen();
  }, [markInboxSeen]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const matchesSearch = !query || [conversation.otherName, conversation.otherEmail, conversation.subject, conversation.body]
        .join(" ")
        .toLowerCase()
        .includes(query);
      const matchesFilter =
        filterTab === "All" ? true :
        filterTab === "Unread" ? conversation.isUnread :
        conversation.status === filterTab;
      return matchesSearch && matchesFilter;
    });
  }, [conversations, filterTab, search]);

  const loadMessages = useCallback(async (background = false): Promise<boolean> => {
    if (!background) setLoading(true);
    if (!background) setError(null);
    try {
      const { response: res, data } = await fetchJsonWithRetry<StaffMessagesResponse>("/api/reports/staff-messages?role=ict", { cache: "no-store" });
      if (!res.ok || !data?.success) throw new Error(data?.message || "Unable to load staff messages.");

      const nextConversations = ((data.messages ?? []) as StaffApiMessage[]).map(normalizeStaffConversation);
      setRecipients(((data.recipients ?? []) as StaffApiRecipient[]).map((recipient) => ({
        id: recipient.id,
        role: recipient.role,
        name: recipient.name,
        email: recipient.email,
        grade: recipient.grade,
        section: recipient.section,
      })));
      setConversations((current) => mergeConversations(current, nextConversations));
      setSelectedId((current) => current ?? nextConversations[0]?.conversationId ?? null);
      setError(null);
      return true;
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : "Unable to load staff messages.");
        setConversations([]);
      }
      return false;
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const liveUpdateNotice = useStaffMessagesRealtime("ict-inbox-messages", loadMessages);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.thread.length, selectedId]);

  async function openConversation(conversation: Conversation) {
    setSelectedId(conversation.conversationId);
    setMobileThreadOpen(true);
    if (!conversation.isUnread) return;

    setConversations((prev) =>
      prev.map((item) => item.conversationId === conversation.conversationId ? { ...item, status: "Read", isUnread: false } : item)
    );
    await fetch("/api/reports/staff-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "ict", conversationId: conversation.conversationId, status: "read" }),
    }).then((res) => {
      if (!res.ok) throw new Error("Unable to mark this conversation as read.");
    }).catch(() => null);
    void loadMessages(true);
  }

  async function sendNewMessage(payload: { recipientId: string; subject: string; message: string; attachments: MessageAttachment[] }) {
    const res = await fetch("/api/reports/staff-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, role: "ict", categories: ["General"] }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !data.message) throw new Error(data?.message || "Unable to send message.");

    const recipient = recipients.find((item) => item.id === payload.recipientId);
    if (!recipient) {
      void loadMessages(true);
      return;
    }
    const created = data.message as { id: number; created_at: string; sender_name: string; sender_email: string };
    const conversation: Conversation = {
      id: created.id,
      conversationId: `staff-message:${created.id}`,
      recipientId: payload.recipientId,
      otherRole: recipient.role,
      otherName: recipient.name,
      otherEmail: recipient.email,
      subject: payload.subject,
      body: payload.message,
      sentAt: formatDate(created.created_at),
      updatedAt: formatDate(created.created_at),
      status: "Read",
      isUnread: false,
      thread: [{
        id: created.id,
        senderRole: "ICT",
        senderName: created.sender_name || "ICT",
        senderEmail: created.sender_email || "",
        isCurrentUser: true,
        body: payload.message,
        sentAt: formatDate(created.created_at),
        status: "Read",
        attachments: payload.attachments,
      }],
    };
    setConversations((current) => mergeConversations(current, [conversation, ...current]));
    void loadMessages(true);
  }

  async function sendReply() {
    if (!selected || (!reply.trim() && replyAttachments.length === 0) || sendingReply) return;
    setSendingReply(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/reports/staff-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "ict",
          conversationId: selected.conversationId,
          status: "replied",
          reply: reply.trim(),
          attachments: replyAttachments,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data.message) throw new Error(data?.message || "Unable to send reply.");
      const created = data.message as { id: number; created_at: string; sender_name: string; sender_email: string };
      const message: ThreadMessage = {
        id: created.id,
        senderRole: "ICT",
        senderName: created.sender_name || "ICT",
        senderEmail: created.sender_email || "",
        isCurrentUser: true,
        body: reply.trim(),
        sentAt: formatDate(created.created_at),
        status: "Replied",
        attachments: replyAttachments,
      };
      setConversations((current) => current.map((conversation) => {
        if (conversation.conversationId !== selected.conversationId) return conversation;
        if (conversation.thread.some((item) => item.id === message.id)) return conversation;
        return {
          ...conversation,
          status: "Replied",
          isUnread: false,
          updatedAt: message.sentAt,
          thread: [...conversation.thread, message],
        };
      }));
      setReply("");
      setReplyAttachments([]);
      void loadMessages(true);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : "Unable to send reply.");
    } finally {
      setSendingReply(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden bg-gray-50 md:h-[100dvh] md:max-h-[100dvh]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#274e13]/10">
            <Inbox className="h-5 w-5 text-[#274e13]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-gray-900 sm:text-xl">Inbox</h1>
            <p className="mt-0.5 truncate text-xs text-gray-400">School staff and principal message threads</p>
          </div>
        </div>
        <button
          onClick={() => setShowCompose(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#274e13] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1f3f0f] sm:gap-2 sm:px-4 sm:text-sm"
        >
          <Plus className="h-4 w-4" /> New Message
        </button>
      </div>
      {liveUpdateNotice && (
        <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 sm:px-6">
          {liveUpdateNotice}
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside className={`${mobileThreadOpen ? "hidden" : "flex"} w-full max-w-[420px] shrink-0 flex-col border-r border-gray-200 bg-white md:flex`}>
          <div className="space-y-3 border-b border-gray-100 px-4 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search staff messages..."
                className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-700 outline-none focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/10"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 [scrollbar-width:none]">
              {(["All", "Unread", "Read", "Replied"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`min-w-max flex-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    filterTab === tab ? "bg-white text-[#274e13] shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab}{tab === "Unread" && unreadCount > 0 ? ` ${unreadCount}` : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {loading && <p className="py-8 text-center text-sm font-semibold text-gray-400">Loading inbox...</p>}
            {!loading && error && <p className="py-8 text-center text-sm font-semibold text-red-500">{error}</p>}
            {!loading && !error && filteredConversations.length === 0 && (
              <div className="mt-10 flex flex-col items-center gap-2 text-gray-400">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs font-semibold">No staff messages found</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.conversationId}
                  onClick={() => openConversation(conversation)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    selectedId === conversation.conversationId ? "border-[#274e13]/20 bg-[#274e13]/5" : "border-gray-100 bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="mb-1.5 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#274e13] text-xs font-bold text-white">
                      {initials(conversation.otherName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-bold text-gray-900">{conversation.otherName}</p>
                        {conversation.isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#274e13]" />}
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-[#274e13]">{conversation.otherRole}</p>
                      <p className="truncate text-xs font-semibold text-gray-700">{conversation.subject}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2 pl-[52px]">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(conversation.status)}`}>
                      {conversation.status}
                    </span>
                    <span className="truncate text-[10px] text-gray-400">{formatDate(conversation.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className={`${mobileThreadOpen ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-hidden md:flex`}>
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <Inbox className="mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold">Select a message or create a new staff thread</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
                <button
                  type="button"
                  onClick={() => setMobileThreadOpen(false)}
                  className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50 md:hidden"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Inbox
                </button>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#274e13] text-sm font-bold text-white">
                      {initials(selected.otherName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="break-words text-base font-bold text-gray-900">{selected.otherName}</p>
                        <span className="rounded-full bg-[#274e13]/10 px-2 py-0.5 text-[10px] font-bold text-[#274e13]">
                          {selected.otherRole}
                        </span>
                      </div>
                      <p className="mt-0.5 break-all text-xs text-gray-400">{selected.otherEmail}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(selected.status)}`}>{selected.status}</span>
                </div>
                <h2 className="mt-4 break-words text-lg font-extrabold leading-tight text-gray-900 sm:text-xl">{selected.subject}</h2>
                <p className="mt-1 text-xs text-gray-400">{formatDate(selected.sentAt)}</p>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                {selected.thread.map((message, index) => (
                  <div key={`${message.id ?? "thread-message"}-${message.sentAt}-${index}`} className={`flex gap-2.5 ${message.isCurrentUser ? "flex-row-reverse" : ""}`}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#274e13] text-[10px] font-bold text-white">
                      {initials(message.senderName)}
                    </div>
                    <div className={`flex min-w-0 max-w-[76%] flex-col ${message.isCurrentUser ? "items-end" : "items-start"}`}>
                      <div className={`flex max-w-full flex-wrap items-center gap-1.5 text-[10px] font-semibold text-gray-500 ${message.isCurrentUser ? "flex-row-reverse" : ""}`}>
                        <span className="break-words">{message.senderName || message.senderRole}</span>
                        <span className={`rounded-full px-1.5 py-0.5 ${roleClass(message.senderRole)}`}>{message.senderRole}</span>
                      </div>
                      {message.body && (
                        <div className={`max-w-full break-words whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          message.isCurrentUser
                            ? "rounded-br-sm bg-[#274e13] text-white"
                            : "rounded-bl-sm border border-gray-100 bg-white text-gray-700 shadow-sm"
                        }`}>
                          {message.body}
                        </div>
                      )}
                      <AttachmentChips attachments={message.attachments} mine={message.isCurrentUser} />
                      <p className="mt-1 text-[10px] text-gray-400">
                        {formatDate(message.sentAt)}
                      </p>
                      </div>
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Reply className="h-3.5 w-3.5" /> Reply to {selected.otherName}
                </div>
                {replyError && <p role="alert" className="mb-2 text-xs font-semibold text-red-600">{replyError}</p>}
                {replyAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {replyAttachments.map((attachment, index) => (
                      <span key={`${attachment.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">
                        <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="max-w-[160px] truncate">{attachment.name}</span>
                        <span className="shrink-0 text-gray-400">{formatAttachmentSize(attachment.size)}</span>
                        <button type="button" onClick={() => setReplyAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="text-gray-400 hover:text-red-500">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex min-w-0 items-end gap-2 sm:gap-3">
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder="Write your reply..."
                    rows={2}
                    className="min-w-0 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/10 sm:px-3.5"
                  />
                  <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50">
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
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#274e13] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#1f3f0f] disabled:cursor-not-allowed disabled:bg-[#274e13]/40 sm:gap-2 sm:px-4 sm:text-sm"
                  >
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {sendingReply ? "Sending..." : "Reply"}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>
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
