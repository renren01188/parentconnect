"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Search, Send, Inbox, ChevronDown, X, Plus,
  Filter, CheckCircle, Clock, Users, Shield,
  Monitor, Mail, Paperclip, Upload, RefreshCw,
  ArrowLeft, MoreHorizontal, Trash2, Archive,
  Reply, Eye, EyeOff, AlertCircle,
} from "lucide-react";
import { useNotifications } from "@/app/dashboard/ict/context/NotificationContext";
import {
  MOCK_MESSAGES,
  InboxMessage as Message,
  MessageStatus,
  SenderRole,
  ThreadMessage,
} from "@/app/dashboard/ict/inbox/data";

// ─── Helpers ──────────────────────────────────────────────────
const PRIMARY = "#274e13";

type FilterTab = "All" | "Unread" | "Principal" | "Adviser";

// ─── Mock recipients for compose ─────────────────────────────
const PRINCIPALS = [
  { id: "p1", name: "Principal Reinalyn Muralla", email: "principal@santiagoes.edu.ph", initials: "RM" },
];

const ADVISERS = [
  { id: "a1", name: "Ana Cruz",     email: "ana.cruz@santiagoes.edu.ph",     initials: "AC", grade: "Grade 4", section: "Rizal"     },
  { id: "a2", name: "Jose Reyes",   email: "jose.reyes@santiagoes.edu.ph",   initials: "JR", grade: "Grade 5", section: "Bonifacio" },
  { id: "a3", name: "Maria Santos", email: "maria.santos@santiagoes.edu.ph", initials: "MS", grade: "Grade 3", section: "Mabini"    },
  { id: "a4", name: "Liza Tan",     email: "liza.tan@santiagoes.edu.ph",     initials: "LT", grade: "Grade 6", section: "Aguinaldo" },
  { id: "a5", name: "Ben Flores",   email: "ben.flores@santiagoes.edu.ph",   initials: "BF", grade: "Grade 1", section: "Rizal"     },
  { id: "a6", name: "Carla Diaz",   email: "carla.diaz@santiagoes.edu.ph",   initials: "CD", grade: "Grade 2", section: "Bonifacio" },
  { id: "a7", name: "Rosa Garcia",  email: "rosa.garcia@santiagoes.edu.ph",  initials: "RG", grade: "Grade 3", section: "Luna"      },
  { id: "a8", name: "Mario Cruz",   email: "mario.cruz@santiagoes.edu.ph",   initials: "MC", grade: "Grade 1", section: "Mabini"    },
];

function getAvatarColor(role: SenderRole) {
  return role === "Principal" ? "bg-violet-600" : "bg-[#274e13]";
}

function statusPill(status: MessageStatus) {
  switch (status) {
    case "Unread":   return "bg-emerald-500 text-white";
    case "Read":     return "bg-slate-200 text-slate-600";
    case "Replied":  return "bg-blue-100 text-blue-700";
    case "Archived": return "bg-gray-100 text-gray-400";
  }
}

function rolePill(role: SenderRole) {
  return role === "Principal"
    ? "bg-violet-100 text-violet-700"
    : "bg-[#274e13]/10 text-[#274e13]";
}

// ─── Compose Modal ────────────────────────────────────────────
type ComposeRecipientType = "Principal" | "Adviser" | null;

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: (msg: Message) => void }) {
  const [recipientType, setRecipientType] = useState<ComposeRecipientType>(null);
  const [recipientId,   setRecipientId]   = useState("");
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [subject,       setSubject]       = useState("");
  const [body,          setBody]          = useState("");
  const [sending,       setSending]       = useState(false);
  const [sent,          setSent]          = useState(false);
  const dropRef    = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);

  const allRecipients = recipientType === "Principal" ? PRINCIPALS : recipientType === "Adviser" ? ADVISERS : [];

  const filteredRecipients = useMemo(() => {
    const q = recipientSearch.toLowerCase().trim();
    if (!q) return allRecipients;
    return allRecipients.filter(r =>
      r.name.toLowerCase().includes(q) ||
      ("grade"   in r && (r as any).grade.toLowerCase().includes(q)) ||
      ("section" in r && (r as any).section.toLowerCase().includes(q)) ||
      r.email.toLowerCase().includes(q)
    );
  }, [allRecipients, recipientSearch]);

  const selected = allRecipients.find(r => r.id === recipientId);
  const canSend  = recipientId && subject.trim() && body.trim();

  useEffect(() => {
    function h(e: MouseEvent) {
      if (recipientOpen && dropRef.current && !dropRef.current.contains(e.target as Node))
        setRecipientOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [recipientOpen]);

  function handleSend() {
    if (!canSend || !selected) return;
    setSending(true);
    setTimeout(() => {
      const newMsg: Message = {
        id: Date.now(),
        senderRole: recipientType === "Principal" ? "Principal" : "Adviser",
        senderName: selected.name,
        senderInitials: selected.initials,
        senderEmail: selected.email,
        grade:   "grade"   in selected ? (selected as any).grade   : undefined,
        section: "section" in selected ? (selected as any).section : undefined,
        subject,
        body: `[Sent by ICT] ${body}`,
        sentAt: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + " · Just now",
        status: "Read",
        thread: [{ id: 1, from: "ict", senderName: "ICT Dept.", body, sentAt: "Just now" }],
      };
      onSent(newMsg);
      setSending(false);
      setSent(true);
    }, 1200);
  }

  if (sent && selected) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-emerald-500"/>
        </div>
        <h3 className="text-base font-bold text-gray-800 mb-1">Message Sent!</h3>
        <p className="text-sm text-gray-500 mb-5">Your message has been sent to <strong>{selected.name}</strong>.</p>
        <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${PRIMARY}18` }}>
              <Mail className="w-5 h-5" style={{ color: PRIMARY }}/>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">New Message</h2>
              <p className="text-xs text-gray-400 mt-0.5">Send to a Principal or Adviser</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4"/></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">

          {/* Recipient type toggle */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Send To <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(["Principal", "Adviser"] as ComposeRecipientType[]).map(type => (
                <button key={type!} type="button"
                  onClick={() => { setRecipientType(type); setRecipientId(""); setRecipientSearch(""); }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition ${
                    recipientType === type
                      ? type === "Principal"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-[#274e13] bg-[#274e13]/5 text-[#274e13]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}>
                  {type === "Principal"
                    ? <Shield className="w-4 h-4"/>
                    : <Users className="w-4 h-4"/>}
                  {type}
                </button>
              ))}
            </div>

            {/* Recipient dropdown */}
            {recipientType && (
              <div className="relative" ref={dropRef}>
                <button type="button" onClick={() => setRecipientOpen(v => !v)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-left hover:border-gray-300 transition">
                  {selected ? (
                    <>
                      <div className={`w-8 h-8 rounded-full ${getAvatarColor(recipientType)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{selected.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{selected.name}</p>
                        <p className="text-xs text-gray-400">{selected.email}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 flex-1">Select {recipientType}...</p>
                  )}
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${recipientOpen ? "rotate-180" : ""}`}/>
                </button>

                {recipientOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden">
                    {/* Search inside dropdown */}
                    <div className="px-3 pt-3 pb-2 border-b border-gray-100">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
                        <input
                          ref={searchRef}
                          autoFocus
                          value={recipientSearch}
                          onChange={e => setRecipientSearch(e.target.value)}
                          placeholder={`Search ${recipientType}...`}
                          onMouseDown={e => e.stopPropagation()}
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-700 placeholder-gray-400"
                        />
                        {recipientSearch && (
                          <button
                            onMouseDown={e => { e.preventDefault(); setRecipientSearch(""); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3"/>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Results */}
                    <div className="max-h-48 overflow-y-auto">
                      {filteredRecipients.length === 0 ? (
                        <div className="py-6 text-center text-xs text-gray-400">No results found</div>
                      ) : filteredRecipients.map(r => (
                        <button key={r.id} type="button"
                          onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); setRecipientSearch(""); }}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-gray-50 transition ${recipientId === r.id ? (recipientType === "Principal" ? "bg-violet-50" : "bg-[#274e13]/5") : ""}`}>
                          <div className={`w-8 h-8 rounded-full ${getAvatarColor(recipientType!)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{r.initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                            <p className="text-xs text-gray-400">
                              {"grade" in r ? `${(r as any).grade} — ${(r as any).section}` : r.email}
                            </p>
                          </div>
                          {recipientId === r.id && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0"/>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Subject <span className="text-red-500">*</span></label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter subject..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 outline-none focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/15 transition"/>
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Message <span className="text-red-500">*</span></label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
              placeholder="Type your message here..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 resize-none outline-none focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/15 transition"/>
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1.5">Attachment <span className="text-[10px] font-normal text-gray-400">(optional)</span></label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-[#274e13]/30 hover:bg-[#274e13]/5 transition">
              <Upload className="w-5 h-5 text-gray-300 shrink-0"/>
              <div>
                <p className="text-sm font-medium text-gray-500">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-400">PDF, DOC, DOCX, JPG, PNG (max. 10MB)</p>
              </div>
            </div>
          </div>

          {/* Sender badge */}
          <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium" style={{ background: `${PRIMARY}10`, color: PRIMARY }}>
            <Monitor className="w-3.5 h-3.5 shrink-0"/>
            Sending as <strong>ICT Department · Rolan Bautista</strong>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={handleSend} disabled={!canSend || sending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-40 hover:opacity-90"
            style={{ background: PRIMARY }}>
            {sending
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Sending…</>
              : <><Send className="w-4 h-4"/>Send Message</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Inbox Page ──────────────────────────────────────────
export default function ICTInboxPage() {
  const [messages,      setMessages]      = useState<Message[]>(MOCK_MESSAGES);
  const [selected,      setSelected]      = useState<Message | null>(MOCK_MESSAGES[0]);
  const [filterTab,     setFilterTab]     = useState<FilterTab>("All");
  const [search,        setSearch]        = useState("");
  const [replyText,     setReplyText]     = useState("");
  const [replying,      setReplying]      = useState(false);
  const [replySent,     setReplySent]     = useState(false);
  const [showCompose,   setShowCompose]   = useState(false);

  // Sync unread count to sidebar badge via context
  const { setInboxUnreadCount } = useNotifications();

  // Counts
  const unreadCount    = messages.filter(m => m.status === "Unread").length;
  const principalCount = messages.filter(m => m.senderRole === "Principal" && m.status === "Unread").length;
  const adviserCount   = messages.filter(m => m.senderRole === "Adviser"   && m.status === "Unread").length;

  // Push count to sidebar whenever messages change
  useEffect(() => {
    setInboxUnreadCount(unreadCount);
  }, [unreadCount, setInboxUnreadCount]);

  // Filtered list
  const filtered = useMemo(() => {
    return messages.filter(m => {
      if (m.status === "Archived") return filterTab === "All" ? false : false; // hide archived from main list unless explicitly filtered
      const q = search.toLowerCase();
      const matchSearch = !q || m.senderName.toLowerCase().includes(q) || m.subject.toLowerCase().includes(q);
      const matchTab =
        filterTab === "All"       ? true :
        filterTab === "Unread"    ? m.status === "Unread" :
        filterTab === "Principal" ? m.senderRole === "Principal" :
        filterTab === "Adviser"   ? m.senderRole === "Adviser" : true;
      return matchSearch && matchTab;
    }).sort((a, b) => {
      // Unread first, then by id descending
      if (a.status === "Unread" && b.status !== "Unread") return -1;
      if (a.status !== "Unread" && b.status === "Unread") return 1;
      return b.id - a.id;
    });
  }, [messages, search, filterTab]);

  function handleSelect(msg: Message) {
    // Mark as read when opened
    setMessages(prev => prev.map(m => m.id === msg.id && m.status === "Unread" ? { ...m, status: "Read" } : m));
    setSelected({ ...msg, status: msg.status === "Unread" ? "Read" : msg.status });
    setReplyText("");
    setReplySent(false);
  }

  function handleSendReply() {
    if (!replyText.trim() || !selected) return;
    setReplying(true);
    setTimeout(() => {
      const newThread: ThreadMessage = {
        id: Date.now(), from: "ict", senderName: "ICT Dept.",
        body: replyText, sentAt: "Just now",
      };
      const updated = {
        ...selected,
        status: "Replied" as MessageStatus,
        thread: [...(selected.thread || []), newThread],
      };
      setMessages(prev => prev.map(m => m.id === selected.id ? updated : m));
      setSelected(updated);
      setReplying(false);
      setReplyText("");
      setReplySent(true);
      setTimeout(() => setReplySent(false), 3000);
    }, 900);
  }

  function handleArchive(id: number) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: "Archived" } : m));
    if (selected?.id === id) setSelected(null);
  }

  function handleComposeSent(msg: Message) {
    setMessages(prev => [msg, ...prev]);
    setShowCompose(false);
  }

  const FILTER_TABS: { key: FilterTab; label: string; badge?: number }[] = [
    { key: "All",       label: "All",       badge: unreadCount    },
    { key: "Unread",    label: "Unread",    badge: unreadCount    },
    { key: "Principal", label: "Principal", badge: principalCount },
    { key: "Adviser",   label: "Adviser",   badge: adviserCount   },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Inbox className="w-5 h-5" style={{ color: PRIMARY }}/> Inbox
            {unreadCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: PRIMARY }}>{unreadCount}</span>
            )}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Messages from Principals and Advisers</p>
        </div>
        <button onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-95"
          style={{ background: PRIMARY }}>
          <Plus className="w-4 h-4"/> New Message
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: message list ── */}
        <div className="w-[340px] xl:w-[380px] shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">

          {/* Search */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search messages..."
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-800"/>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex border-b border-gray-100 shrink-0 px-2 pt-1">
            {FILTER_TABS.map(tab => (
              <button key={tab.key} onClick={() => setFilterTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-bold transition border-b-2 relative ${
                  filterTab === tab.key ? "border-[#274e13] text-[#274e13]" : "border-transparent text-gray-400 hover:text-gray-600"
                }`}>
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                    style={{ background: filterTab === tab.key ? PRIMARY : "#e5e7eb", color: filterTab === tab.key ? "white" : "#6b7280" }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Message list */}
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Inbox className="w-10 h-10 text-gray-200 mb-3"/>
                <p className="text-sm font-medium">No messages found</p>
              </div>
            ) : filtered.map(msg => {
              const isActive  = selected?.id === msg.id;
              const isUnread  = msg.status === "Unread";
              return (
                <button key={msg.id} onClick={() => handleSelect(msg)}
                  className={`w-full text-left px-4 py-4 border-b border-gray-50 transition relative ${
                    isActive ? "bg-[#274e13]/5 border-l-[3px] border-l-[#274e13]" : "border-l-[3px] border-l-transparent hover:bg-gray-50"
                  }`}>
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getAvatarColor(msg.senderRole)}`}>
                      {msg.senderInitials}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className={`text-sm truncate ${isUnread ? "font-bold text-gray-900" : "font-semibold text-gray-700"}`}>
                          {msg.senderName}
                        </p>
                        <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">{msg.sentAt.split("·")[0].trim()}</span>
                      </div>

                      {/* Badges row */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${rolePill(msg.senderRole)}`}>
                          {msg.senderRole === "Principal" ? "🏫 Principal" : "👩‍🏫 Adviser"}
                        </span>
                        {msg.grade && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{msg.grade}</span>}
                        {msg.priority === "High" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">High</span>}
                      </div>

                      {/* Subject */}
                      <p className={`text-xs truncate ${isUnread ? "font-semibold text-gray-800" : "text-gray-600"}`}>{msg.subject}</p>

                      {/* Status + unread dot */}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${statusPill(msg.status)}`}>{msg.status}</span>
                        {isUnread && <span className="w-2 h-2 rounded-full bg-[#274e13] shrink-0"/>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: message detail ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Inbox className="w-7 h-7 text-gray-300"/>
              </div>
              <p className="text-sm font-medium">Select a message to read</p>
            </div>
          ) : (
            <>
              {/* Message header */}
              <div className="px-6 py-4 border-b border-gray-200 shrink-0 bg-white">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${getAvatarColor(selected.senderRole)}`}>
                      {selected.senderInitials}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-bold text-gray-900">{selected.senderName}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rolePill(selected.senderRole)}`}>
                          {selected.senderRole === "Principal" ? "🏫 Principal" : "👩‍🏫 Adviser"}
                        </span>
                        {selected.priority === "High" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">🔴 High Priority</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{selected.senderEmail}</p>
                      {selected.grade && <p className="text-xs text-gray-400">{selected.grade} — {selected.section}</p>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusPill(selected.status)}`}>{selected.status}</span>
                    <button onClick={() => handleArchive(selected.id)}
                      title="Archive"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
                      <Archive className="w-4 h-4"/>
                    </button>
                  </div>
                </div>

                <h2 className="text-lg font-extrabold text-gray-800 leading-tight">{selected.subject}</h2>
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
                  <Clock className="w-3 h-3"/>{selected.sentAt}
                </p>
              </div>

              {/* Thread + body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[#fafbfc]">

                {/* Original message */}
                <div className={`rounded-2xl border p-5 ${selected.senderRole === "Principal" ? "bg-violet-50/50 border-violet-100" : "bg-[#274e13]/5 border-[#274e13]/15"}`}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getAvatarColor(selected.senderRole)}`}>
                      {selected.senderInitials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{selected.senderName}</p>
                      <p className="text-xs text-gray-400">{selected.sentAt}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.body}</p>
                  {selected.attachment && (
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg px-3 py-2 w-fit cursor-pointer hover:bg-gray-50 transition text-gray-600">
                      <Paperclip className="w-3.5 h-3.5"/>{selected.attachment}
                    </div>
                  )}
                </div>

                {/* Thread replies */}
                {(selected.thread || []).map(t => (
                  <div key={t.id} className={`flex ${t.from === "ict" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      t.from === "ict"
                        ? "bg-[#274e13] text-white rounded-br-sm"
                        : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                    }`}>
                      <p className={`text-[10px] font-semibold mb-1 ${t.from === "ict" ? "text-white/70" : "text-gray-400"}`}>
                        {t.senderName} · {t.sentAt}
                      </p>
                      {t.body}
                    </div>
                  </div>
                ))}

                {replySent && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl">
                    <CheckCircle className="w-4 h-4 shrink-0"/>Reply sent successfully.
                  </div>
                )}
              </div>

              {/* Reply box */}
              {selected.status !== "Archived" && (
                <div className="px-6 py-4 border-t border-gray-200 bg-white shrink-0">
                  <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                    <Reply className="w-3.5 h-3.5"/> Reply to {selected.senderName}
                  </p>
                  <div className="flex gap-3 items-end">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={3}
                      placeholder={`Write your reply to ${selected.senderRole === "Principal" ? "the Principal" : selected.senderName}...`}
                      className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 resize-none outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition placeholder-gray-400 bg-gray-50"
                    />
                    <button onClick={handleSendReply} disabled={!replyText.trim() || replying}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white transition disabled:opacity-40 hover:opacity-90 shrink-0"
                      style={{ background: PRIMARY }}>
                      {replying
                        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                        : <Send className="w-4 h-4"/>}
                      {replying ? "Sending…" : "Reply"}
                    </button>
                  </div>
                </div>
              )}

              {selected.status === "Archived" && (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Archive className="w-3.5 h-3.5"/>
                    This message has been archived.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} onSent={handleComposeSent}/>}
    </div>
  );
}