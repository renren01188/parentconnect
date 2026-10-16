"use client";
import React, { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, X, Clock, Paperclip, Send, Upload, CheckCircle, AlertCircle, AlertTriangle, ChevronDown, LoaderCircle } from "lucide-react";
import Sidebar from "../components/Sidebar";
import ParentReportsGuide from "../components/ParentReportsGuide";
import { useNotifContext } from "../context/NotificationContext";
import { DEFAULT_CATEGORIES, CONCERN_PERCENTAGES, computeConcernLevel, type ChatMessage, type Report, type MessageAttachment, type MessageStatus, type ReportStatus } from "../data";
import { UserAvatar } from "@/components/UserAvatar";
import { useReportMessagesRealtime } from "@/hooks/useReportMessagesRealtime";
import { useReportTyping } from "@/hooks/useReportTyping";
import { useStaffConversationTyping } from "@/hooks/useStaffConversationTyping";
import { countParentReportTabs, filterParentReportConversations, sortParentReportConversations } from "@/lib/parentReportList";
import {
  canSubmitConfirmedReport,
  createReportSubmissionConfirmation,
  setReportTermsAccepted,
  updateReportTermsScroll,
} from "./reportSubmissionTerms";

// Only class advisers — parents cannot send directly to the principal
type AdviserRecipient = {
  id: string;
  adviserId: number;
  studentId: string;
  name: string;
  role: string;
  jobTitle: string;
  initials: string;
  color: string;
  studentName: string;
  grade: string;
  section: string;
};

type FilterTab = "All Messages" | "Unread" | "Principal" | "Adviser" | "Guidance";
type ParentReportsPanel = "reports" | "schoolMessages";

type StandaloneStaffMessage = {
  id: number;
  senderRole: "Parent" | "Adviser" | "Guidance" | "Principal" | "ICT";
  senderName: string;
  subject: string;
  message: string;
  attachments?: MessageAttachment[];
  sentAt: string;
  /** Server-provided raw latest reply time; never use a formatted display date for sorting. */
  sortAt?: number;
  unread: boolean;
  replies?: Array<{
    id: number;
    senderRole: "Parent" | "Adviser" | "Guidance" | "Principal" | "ICT";
    senderName: string;
    message: string;
    attachments?: MessageAttachment[];
    sentAt: string;
  }>;
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function standaloneThreadType(role: StandaloneStaffMessage["senderRole"]): ChatMessage["threadType"] {
  if (role === "Principal") return "principal";
  if (role === "Guidance") return "guidance";
  if (role === "Adviser") return "adviser";
  return undefined;
}

function standaloneMessageToReport(message: StandaloneStaffMessage): Report {
  const lastReply = message.replies?.at(-1);
  const last = lastReply ?? message;
  const thread = [message, ...(message.replies ?? [])];
  const latestStaffMessage = [...thread].reverse().find((entry) => entry.senderRole !== "Parent") ?? message;
  const latestStaffRole = standaloneThreadType(latestStaffMessage.senderRole);
  const color = message.senderRole === "Principal" ? "#7c3aed" : message.senderRole === "Guidance" ? "#0ea5e9" : message.senderRole === "Adviser" ? "#f59e0b" : "#334155";
  const toChatMessage = (entry: {
    id: number; senderRole: StandaloneStaffMessage["senderRole"]; senderName: string; message: string; attachments?: MessageAttachment[]; sentAt: string;
  }): ChatMessage => ({
    id: entry.id,
    sender: entry.senderRole === "Parent" ? "parent" : "staff",
    senderName: entry.senderRole === "Parent" ? "You" : entry.senderName,
    timestamp: entry.sentAt,
    text: entry.message,
    threadType: standaloneThreadType(entry.senderRole),
    attachments: entry.attachments ?? [],
  });
  return {
    // Negative client IDs prevent a collision with an actual report ID and
    // make it impossible to accidentally call a report workflow endpoint.
    id: -message.id,
    standaloneMessageId: message.id,
    isStandaloneStaffMessage: true,
    recipientName: message.senderName,
    recipientRole: message.senderRole,
    recipientInitials: message.senderName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "SM",
    recipientColor: color,
    subject: message.subject,
    preview: last.message.trim() || "An attachment was sent.",
    status: message.unread ? "Unread" : "Read",
    reportStatus: null,
    hasReportStatus: false,
    time: last.sentAt,
    lastActivityAt: message.sortAt ?? last.sentAt,
    unread: message.unread,
    messages: [toChatMessage(message), ...(message.replies ?? []).map(toChatMessage)],
    categories: [],
    concernLevel: 0,
    detailsLoaded: true,
    latestStaffRole,
    threadTypes: latestStaffRole ? [latestStaffRole] : [],
  };
}

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

function formatAttachmentSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function reportCooldownMessage(cooldownUntil: string | null, now: number) {
  if (!cooldownUntil) return null;
  const remainingMs = new Date(cooldownUntil).getTime() - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remaining = minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
  return `You can submit another report in ${remaining}.`;
}

function AttachmentChips({ attachments, onRemove }: { attachments?: MessageAttachment[]; onRemove?: (index: number) => void }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => {
        const content = (
          <>
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="max-w-[180px] truncate">{attachment.name}</span>
            <span className="shrink-0 text-slate-400">{formatAttachmentSize(attachment.size)}</span>
          </>
        );
        return onRemove ? (
          <span
            key={`${attachment.name}-${index}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
          >
            {content}
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="ml-1 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <a
            key={`${attachment.name}-${index}`}
            href={attachment.dataUrl}
            download={attachment.name}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

// ── Concern level progress bar ────────────────────────────────────────────────
function ConcernBar({ level }: { level: number }) {
  const color = level >= 100 ? "#ef4444" : level >= 75 ? "#f97316" : level >= 50 ? "#eab308" : "#10b981";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
        <div style={{ width: `${level}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36, textAlign: "right" }}>{level}%</span>
    </div>
  );
}

// ── Priority badge ─────────────────────────────────────────────────────────────
function PriorityBadge({ level }: { level: number }) {
  if (level >= 100) return <span style={{ fontSize: 10, fontWeight: 800, background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 7px" }}>🔴 Urgent</span>;
  if (level >= 75) return <span style={{ fontSize: 10, fontWeight: 800, background: "#fff7ed", color: "#f97316", border: "1px solid #fed7aa", borderRadius: 6, padding: "2px 7px" }}>🟠 High</span>;
  if (level >= 50) return <span style={{ fontSize: 10, fontWeight: 800, background: "#fefce8", color: "#ca8a04", border: "1px solid #fef08a", borderRadius: 6, padding: "2px 7px" }}>🟡 Medium</span>;
  return <span style={{ fontSize: 10, fontWeight: 800, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 6, padding: "2px 7px" }}>🟢 Low</span>;
}

// ── Report status badge ───────────────────────────────────────────────────────
function ReportStatusBadge({ status, label = status }: { status: ReportStatus; label?: string }) {
  const cfg: Record<ReportStatus, { bg: string; color: string; border: string; icon: React.ReactNode }> = {
    "Pending": { bg: "#fefce8", color: "#a16207", border: "#fef08a", icon: <Clock style={{ width: 11, height: 11 }} /> },
    "In Review": { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", icon: <AlertCircle style={{ width: 11, height: 11 }} /> },
    "Replied": { bg: "#eef2ff", color: "#4f46e5", border: "#c7d2fe", icon: <Send style={{ width: 11, height: 11 }} /> },
    "Resolved": { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", icon: <CheckCircle style={{ width: 11, height: 11 }} /> },
    "Escalated": { bg: "#fff1f2", color: "#be123c", border: "#fecdd3", icon: <AlertTriangle style={{ width: 11, height: 11 }} /> },
  };
  const s = cfg[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {s.icon}{label}
    </span>
  );
}

// ── Legacy list badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: MessageStatus }) {
  const styles: Record<MessageStatus, string> = {
    "Pending Response": "bg-amber-100 text-amber-700 border border-amber-300",
    "Resolved": "bg-emerald-100 text-emerald-700 border border-emerald-300",
    "Read": "bg-sky-100 text-sky-600 border border-sky-200",
    "Unread": "bg-slate-100 text-slate-500 border border-slate-200",
  };
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${styles[status]}`}>{status}</span>;
}

function threadLabel(threadType?: ChatMessage["threadType"]) {
  if (threadType === "principal") return "Principal";
  if (threadType === "guidance") return "Guidance";
  if (threadType === "adviser") return "Adviser";
  return "Parent";
}

function threadBadgeStyle(threadType?: ChatMessage["threadType"]) {
  if (threadType === "principal") return "border-violet-200 bg-violet-50 text-violet-700";
  if (threadType === "guidance") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

// ── Status timeline ───────────────────────────────────────────────────────────────────
function StatusTimeline({ status }: { status: ReportStatus }) {
  const STEPS: { key: ReportStatus; label: string; color: string; bg: string }[] = [
    { key: "Pending", label: "Pending", color: "#f59e0b", bg: "#fef3c7" },
    { key: "In Review", label: "In Review", color: "#3b82f6", bg: "#dbeafe" },
    { key: "Replied", label: "Replied", color: "#4f46e5", bg: "#e0e7ff" },
    { key: "Escalated", label: "Escalated", color: "#ef4444", bg: "#fee2e2" },
    { key: "Resolved", label: "Resolved", color: "#10b981", bg: "#d1fae5" },
  ];

  const activeIdx = STEPS.findIndex(s => s.key === status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Report Status</p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        {STEPS.map((step, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          const stepColor = current ? step.color : done ? "#10b981" : "#cbd5e1";
          return (
            <React.Fragment key={step.key}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 52 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: current ? step.bg : done ? "#d1fae5" : "#f1f5f9",
                  border: `2.5px solid ${stepColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.25s",
                }}>
                  {done && <CheckCircle style={{ width: 13, height: 13, color: "#10b981" }} />}
                  {current && <div style={{ width: 8, height: 8, borderRadius: "50%", background: step.color }} />}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: stepColor, whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.3 }}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2.5, marginTop: 11, background: done ? "#10b981" : "#e2e8f0", transition: "all 0.25s", minWidth: 12 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── New Report Modal ──────────────────────────────────────────────────────────
function NewReportModal({ onClose, onSubmit, advisers, advisersLoading, advisersError, onRetryAdvisers, cooldownMessage }: {
  onClose: () => void;
  onSubmit: (data: {
    adviserId: number;
    studentId: string;
    subject: string;
    categories: string[];
    concernLevel: number;
    message: string;
    attachments: MessageAttachment[];
    allowHistoryAccess: boolean;
    termsAccepted: boolean;
  }) => Promise<void>;
  advisers: AdviserRecipient[];
  advisersLoading: boolean;
  advisersError: string;
  onRetryAdvisers: () => void;
  cooldownMessage: string | null;
}) {
  const [adviserIdx, setAdviserIdx] = useState(0);
  const [adviserOpen, setAdviserOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [confirmation, setConfirmation] = useState(() => createReportSubmissionConfirmation());
  const adviserRef = useRef<HTMLDivElement>(null);
  const confirmationDialogRef = useRef<HTMLDivElement>(null);
  const confirmationTermsRef = useRef<HTMLDivElement>(null);
  const confirmationCloseButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationOpenerRef = useRef<HTMLElement | null>(null);
  const adviser = advisers[adviserIdx];

  useEffect(() => {
    setAdviserIdx((current) => Math.min(current, Math.max(0, advisers.length - 1)));
  }, [advisers.length]);

  // Compute concern level silently (used on submit, not shown to parent)
  const allCats = DEFAULT_CATEGORIES.map(n => ({ name: n, pct: CONCERN_PERCENTAGES[n] }));
  const selectedEntries = allCats.filter(c => selectedCats.includes(c.name));
  const concernLevel = computeConcernLevel(selectedEntries);

  useEffect(() => {
    function h(e: MouseEvent) { if (adviserOpen && adviserRef.current && !adviserRef.current.contains(e.target as Node)) setAdviserOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [adviserOpen]);
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showConsent) closeConfirmationModal();
      else onClose();
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, showConsent]);

  useEffect(() => {
    if (!showConsent) return;

    confirmationOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => confirmationCloseButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      confirmationOpenerRef.current?.focus();
    };
  }, [showConsent]);

  useEffect(() => {
    if (!showConsent) return;

    const frame = window.requestAnimationFrame(() => {
      const terms = confirmationTermsRef.current;
      if (!terms) return;
      setConfirmation((current) => updateReportTermsScroll(current, {
        scrollTop: terms.scrollTop,
        clientHeight: terms.clientHeight,
        scrollHeight: terms.scrollHeight,
      }));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [showConsent]);

  function toggleCat(name: string) {
    setSelectedCats(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  }

  function openConfirmationModal() {
    if (cooldownMessage) return;
    setConfirmation(createReportSubmissionConfirmation());
    setShowConsent(true);
  }

  function closeConfirmationModal() {
    setShowConsent(false);
    setConfirmation(createReportSubmissionConfirmation());
  }

  function handleTermsScroll(event: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    setConfirmation((current) => updateReportTermsScroll(current, { scrollTop, clientHeight, scrollHeight }));
  }

  function handleConfirmationKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeConfirmationModal();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(confirmationDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const otherSelected = selectedCats.includes("Other");
  const canSubmit = !cooldownMessage && !!adviser && !isSubmitting && subject.trim() && (message.trim() || attachments.length > 0) && selectedCats.length > 0 && (!otherSelected || otherText.trim());


  async function handleSubmit() {
    // No additional conversation-history permission is collected here. Keep
    // prior conversation history private unless a separate consent flow sets it.
    const allowHistoryAccess = false;
    const termsAccepted = confirmation.termsAccepted;
    if (cooldownMessage || !canSubmit || !adviser || !canSubmitConfirmedReport(confirmation) || !termsAccepted) return;
    // Close the consent prompt immediately; the report submission can continue in the background.
    closeConfirmationModal();
    // Replace generic "Other" with the typed description if provided
    const finalCats = selectedCats.map(c => (c === "Other" && otherText.trim()) ? `Other: ${otherText.trim()}` : c);
    const finalEntries = allCats.filter(c => selectedCats.includes(c.name));
    try {
      setIsSubmitting(true);
      setSubmitError("");
      await onSubmit({
        adviserId: adviser.adviserId,
        studentId: adviser.studentId,
        subject: subject.trim(),
        categories: finalCats,
        concernLevel: computeConcernLevel(finalEntries),
        message: message.trim(),
        attachments,
        allowHistoryAccess,
        termsAccepted,
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to submit report.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!adviser) {
    const message = advisersLoading
      ? "Finding the class adviser linked to your child…"
      : advisersError || "No active class adviser is linked to your children yet.";

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: "min(500px, calc(100vw - 24px))", padding: 24 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>New Report</h2>
              <p role={advisersLoading ? "status" : advisersError ? "alert" : undefined} style={{ fontSize: 13, color: advisersError ? "#b91c1c" : "#64748b", margin: "8px 0 0" }}>{message}</p>
              {!advisersLoading && advisersError && (
                <button type="button" onClick={onRetryAdvisers} style={{ marginTop: 16, padding: "9px 14px", borderRadius: 9, border: "none", background: "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Try Again
                </button>
              )}
            </div>
            <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><X style={{ width: 16, height: 16 }} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} onClick={onClose}>
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: "min(500px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "22px 24px 16px", borderBottom: "1px solid #f1f5f9" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>New Report</h2>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>Submit a concern to your class adviser</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><X style={{ width: 16, height: 16 }} /></button>
        </div>

        {submitted ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px", gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle style={{ width: 28, height: 28, color: "#10b981" }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Report Submitted!</p>
            <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", margin: 0 }}>Your report has been sent to {adviser.name}. You&apos;ll be notified when they respond.</p>
            <button onClick={onClose} style={{ marginTop: 8, padding: "10px 28px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Done</button>
          </div>
        ) : (
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            {cooldownMessage && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800">
                {cooldownMessage} A cancelled report is kept for authorized staff and audit history.
              </div>
            )}
            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700">
                {submitError}
              </div>
            )}
            {/* Adviser selector */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Send To — Class Adviser <span style={{ color: "#ef4444" }}>*</span></label>
              <div className="relative" ref={adviserRef}>
                <button type="button" onClick={() => setAdviserOpen(p => !p)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", textAlign: "left", cursor: "pointer", boxSizing: "border-box" }}>
                  <span style={{ width: 34, height: 34, minWidth: 34, borderRadius: "50%", background: adviser.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{adviser.initials}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>{adviser.name}</p>
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{adviser.jobTitle} • {adviser.role}</p>
                  </div>
                  <ChevronDown style={{ width: 16, height: 16, color: "#94a3b8", transform: adviserOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                </button>
                {adviserOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff", borderRadius: 12, border: "1.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 30, overflow: "hidden" }}>
                    {advisers.map((a, i) => (
                      <button key={a.id} type="button" onMouseDown={e => { e.preventDefault(); setAdviserIdx(i); setAdviserOpen(false); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: adviserIdx === i ? "#eff6ff" : "#fff", border: "none", cursor: "pointer" }}>
                        <span style={{ width: 34, height: 34, minWidth: 34, borderRadius: "50%", background: a.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{a.initials}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0 }}>{a.name}</p>
                          <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{a.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Multi-category selection */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                Categories <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>Select all that apply</span>
              </label>
              {/* Category checkboxes — no percentages shown to parent */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allCats.map(cat => {
                  const checked = selectedCats.includes(cat.name);
                  return (
                    <button key={cat.name} type="button" onClick={() => toggleCat(cat.name)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: checked ? "2px solid #2563eb" : "1.5px solid #e2e8f0", background: checked ? "#eff6ff" : "#fff", color: checked ? "#1d4ed8" : "#64748b", fontSize: 12, fontWeight: checked ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                      <span style={{ width: 13, height: 13, minWidth: 13, borderRadius: 3, border: `2px solid ${checked ? "#2563eb" : "#cbd5e1"}`, background: checked ? "#2563eb" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {checked && <span style={{ width: 6, height: 6, background: "#fff", borderRadius: 1, display: "block" }} />}
                      </span>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              {/* "Other" expand — type your concern */}
              {otherSelected && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    value={otherText}
                    onChange={e => setOtherText(e.target.value)}
                    placeholder="Please describe your concern..."
                    autoFocus
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #2563eb", fontSize: 12, color: "#334155", outline: "none", boxSizing: "border-box", background: "#eff6ff" }}
                  />
                </div>
              )}
            </div>

            {/* Subject */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Concern <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter subject..."
                style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#334155", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Message */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Message <span style={{ color: "#ef4444" }}>*</span></label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your concern or inquiry in detail..." rows={5}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#334155", resize: "none", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Attachments */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Attachments</label>
              <label style={{ border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", background: "#fafafa" }}>
                <Upload style={{ width: 24, height: 24, color: "#cbd5e1" }} />
                <p style={{ fontSize: 13, color: "#64748b", fontWeight: 500, margin: 0 }}>Click to upload or drag and drop</p>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>PDF, DOC, DOCX, JPG, PNG (max. 10MB)</p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={async (event) => {
                    if (event.target.files) {
                      const next = await filesToAttachments(event.target.files);
                      setAttachments((prev) => [...prev, ...next].slice(0, 5));
                    }
                    event.target.value = "";
                  }}
                />
              </label>
              <AttachmentChips attachments={attachments} onRemove={(index) => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
              <button type="button" onClick={onClose}
                style={{ padding: "9px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={openConfirmationModal} disabled={!canSubmit}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 10, border: "none", background: canSubmit ? "#2563eb" : "#93c5fd", color: "#fff", fontSize: 13, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed" }}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" style={{ width: 13, height: 13 }} /> Submitting...
                  </>
                ) : (
                  <>
                    <Send style={{ width: 13, height: 13 }} /> Submit Report
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        {showConsent && !submitted && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
            onClick={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) closeConfirmationModal();
            }}
          >
            <div
              ref={confirmationDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-submission-confirmation-title"
              aria-describedby="report-submission-confirmation-description"
              onKeyDown={handleConfirmationKeyDown}
              className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
                <div>
                  <h2 id="report-submission-confirmation-title" className="text-lg font-extrabold text-slate-900">Confirm report submission</h2>
                  <p id="report-submission-confirmation-description" className="mt-1 text-xs leading-relaxed text-slate-600">Read and accept the report submission terms before submitting.</p>
                </div>
                <button
                  ref={confirmationCloseButtonRef}
                  type="button"
                  onClick={closeConfirmationModal}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  aria-label="Close report submission confirmation"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                <section aria-labelledby="report-submission-terms-title">
                  <h3 id="report-submission-terms-title" className="text-sm font-extrabold text-slate-800">REPORT SUBMISSION TERMS AND CONDITIONS</h3>
                  <div
                    ref={confirmationTermsRef}
                    onScroll={handleTermsScroll}
                    className="mt-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 sm:max-h-60"
                    aria-label="Report submission terms. Scroll to the end to enable acceptance."
                  >
                    <p>The report submission feature of PARENTCONNECT is intended for legitimate school-related concerns. All information provided in a report shall be accurate, relevant, and presented in a clear and respectful manner. Any supporting files or attachments shall be relevant to the concern being reported.</p>
                    <p className="mt-3">Submitted reports may be read, reviewed, and addressed by the assigned adviser and may be monitored by the school principal. When necessary, reports may be referred or escalated to other authorized school personnel for appropriate action. Information contained in submitted reports shall be handled with appropriate confidentiality and accessed only by authorized personnel.</p>
                    <p className="mt-3">Before submission, the report details and attachments should be reviewed carefully to ensure accuracy and completeness.</p>
                    <p className="mt-3">By selecting <strong>&quot;I Agree&quot;</strong> and submitting the report, the reporting party acknowledges having read and understood these Terms and Conditions and confirms that the information provided is accurate to the best of their knowledge.</p>
                  </div>
                  {!confirmation.hasReachedTermsEnd && <p role="status" className="mt-2 text-xs font-medium text-amber-700">Scroll to the end of the terms to enable the agreement checkbox.</p>}
                  <label className={`mt-3 flex items-start gap-3 rounded-xl border p-3 text-xs leading-relaxed ${confirmation.hasReachedTermsEnd ? "border-blue-200 bg-blue-50/60 text-slate-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                    <input
                      type="checkbox"
                      checked={confirmation.termsAccepted}
                      disabled={!confirmation.hasReachedTermsEnd}
                      onChange={(event) => setConfirmation((current) => setReportTermsAccepted(current, event.target.checked))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600 disabled:cursor-not-allowed"
                    />
                    <span>I have read and agree to the Report Submission Terms and Conditions.</span>
                  </label>
                </section>
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeConfirmationModal} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600">Cancel</button>
                  <button type="button" onClick={handleSubmit} disabled={!canSubmitConfirmedReport(confirmation) || isSubmitting} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-300">
                    {isSubmitting ? "Submitting..." : "Yes, Submit Report"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/*
        {false && showConsent && !submitted && (
          <div onClick={e => e.stopPropagation()} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "min(430px, calc(100vw - 48px))", boxSizing: "border-box", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
              {showTerms ? (
                <>
                  <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Terms of Agreement</h3>
                    <p style={{ margin: "0 0 10px" }}>Legacy terms content removed.</p>
                    <p style={{ margin: "0 0 10px" }}>By submitting this report, you understand that it will first be reviewed by your Class Adviser and may be escalated through the school’s reporting process: Adviser, Guidance Counselor, then Principal.</p>
                    <p style={{ margin: "0 0 10px" }}>If you select “Yes,” you consent to higher authorities viewing the previous conversation history between you and the Class Adviser and between you and the Guidance Counselor when the report reaches them. This helps them understand the full context of your concern.</p>
                    <p style={{ margin: 0 }}>If you select “No,” higher authorities will not be shown those previous conversations after escalation. They may still view the report details and messages addressed to them. You may choose either option before accepting these Terms of Agreement.</p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                    <button type="button" onClick={() => setShowTerms(false)} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600 }}>Back</button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Confirm report submission</h3>
                  <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.5, color: "#64748b" }}>Please choose whether higher authorities may read the conversation history if this report is escalated.</p>
                  <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.5, color: "#64748b" }}>Yes, I want higher authorities to read our conversation history if this report is escalated.</p>
                  <label style={{ display: "flex", gap: 9, alignItems: "flex-start", margin: "10px 0 18px", fontSize: 12, color: "#334155", cursor: "pointer" }}>
                    <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
                    <span>I accept the <button type="button" onClick={() => setShowTerms(true)} style={{ border: 0, padding: 0, background: "transparent", color: "#2563eb", fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>Terms of Agreement</button>.</span>
                  </label>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" onClick={() => setShowConsent(false)} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600 }}>Cancel</button>
                    <button type="button" onClick={handleSubmit} disabled={!termsAccepted || isSubmitting} style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: termsAccepted ? "#2563eb" : "#93c5fd", color: "#fff", fontWeight: 700, cursor: termsAccepted ? "pointer" : "not-allowed" }}>Yes, Submit Report</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )} */}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function GuidanceTicketModal({ report, onClose, onSubmitted }: { report: Report; onClose: () => void; onSubmitted: () => Promise<void> }) {
  const [concern] = useState(report.subject);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!concern.trim() || (!message.trim() && !attachments.length) || saving) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/reports/parent-adviser/${report.id}/ticket`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concern, message, attachments }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Unable to submit ticket.");
      await onSubmitted(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to submit ticket."); } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" onClick={onClose}>
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-extrabold text-slate-900">Submit Ticket to Guidance</h2><p className="mt-1 text-sm text-slate-500">This reuses the current report.</p></div><button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button></div>
      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
      <label className="mb-3 block text-sm font-bold text-slate-700">Concern<input value={concern} readOnly aria-readonly="true" className="mt-1.5 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-normal text-slate-600" /></label>
      <label className="mb-3 block text-sm font-bold text-slate-700">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" /></label>
      <label className="mb-5 block cursor-pointer rounded-xl border border-dashed border-slate-300 p-3 text-center text-sm font-bold text-slate-600">Attachments<input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" onChange={async (event) => { const files = Array.from(event.target.files ?? []).filter((file) => file.size <= MAX_ATTACHMENT_BYTES); const next = await filesToAttachments(files); setAttachments((current) => [...current, ...next].slice(0, 5)); event.target.value = ""; }} /><AttachmentChips attachments={attachments} onRemove={(index) => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></label>
      <div className="flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button onClick={submit} disabled={saving || !concern.trim() || (!message.trim() && !attachments.length)} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:bg-sky-300">{saving ? "Submitting…" : "Submit Ticket"}</button></div>
    </div>
  </div>;
}

function CancelReportModal({ report, onClose, onConfirm, cancelling, error }: {
  report: Report;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  cancelling: boolean;
  error: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
      onClick={() => { if (!cancelling) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="cancel-parent-report-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cancel-parent-report-title" className="text-lg font-extrabold text-slate-900">Cancel this report?</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              <strong>{report.subject}</strong> will be removed from your active reports. Authorized school staff will retain it for follow-up and audit history.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-800">After cancellation, you must wait 5 minutes before submitting another report.</p>
          </div>
          <button type="button" onClick={onClose} disabled={cancelling} aria-label="Keep report" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed"><X className="h-5 w-5" /></button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={cancelling} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed">Keep Report</button>
          <button type="button" onClick={() => void onConfirm()} disabled={cancelling} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300">{cancelling ? "Cancelling..." : "Yes, Cancel Report"}</button>
        </div>
      </div>
    </div>
  );
}

function StudentConcernConsent({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-extrabold text-slate-900">Before you start this conversation</h3>
      <p className="mt-3 text-xs font-extrabold text-slate-800">Conversation Visibility</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">The Principal may review this conversation to monitor the student concern.</p>
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-slate-600">
        <input id="student-concern-visibility" type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
        <span>I understand that the Principal can view this conversation.</span>
      </label>
      <button type="button" disabled={!termsAccepted || saving} onClick={async () => {
        if (!termsAccepted) return;
        setSaving(true);
        try { await onConfirm(); } finally { setSaving(false); }
      }} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300">
        {saving ? "Saving..." : "Confirm and Start Conversation"}
      </button>
    </div>
  );
}

function ParentReportsPageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUnreadReportsCount } = useNotifContext();

  const [reports, setReports] = useState<Report[]>([]);
  const [advisers, setAdvisers] = useState<AdviserRecipient[]>([]);
  const [advisersLoading, setAdvisersLoading] = useState(true);
  const [advisersError, setAdvisersError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activePanel, setActivePanel] = useState<ParentReportsPanel>("reports");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All Messages");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancellingReport, setCancellingReport] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [reportSubmissionCooldownUntil, setReportSubmissionCooldownUntil] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [replyText, setReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);
  const markingReadIds = useRef<Set<number>>(new Set());
  const pendingMessagesRef = useRef<Map<number, ChatMessage[]>>(new Map());
  const detailRequestsRef = useRef<Map<number, Promise<void>>>(new Map());
  const detailRefreshQueuedRef = useRef<Set<number>>(new Set());
  const reportListRequestVersion = useRef(0);
  const advisersRequestVersion = useRef(0);
  // Realtime callbacks are registered once by the shared dashboard channel.
  // Keep the current open report in a ref so a Broadcast received immediately
  // after a Parent selects a card cannot be handled with the prior selection.
  const selectedReportIdRef = useRef<number | null>(null);
  // URL selection is an entry point, not a command that should run again
  // after every background list refresh. Without this guard, a stale
  // `reportId` could replace the report the parent just clicked.
  const lastAppliedRouteSelectionRef = useRef<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const lastScrolledConversationRef = useRef<string | null>(null);
  const cooldownMessage = reportCooldownMessage(reportSubmissionCooldownUntil, currentTime);
  const cancelTarget = reports.find((report) => report.id === cancelTargetId) ?? null;
  const parentSubmittedReports = sortParentReportConversations(
    reports.filter((report) => !report.isStandaloneStaffMessage),
  );
  const schoolMessages = sortParentReportConversations(
    reports.filter((report) => report.isStandaloneStaffMessage),
  );

  // All categories derived from all reports (for the pill row)
  const allUsedCategories = Array.from(
    new Set(parentSubmittedReports.flatMap(r => r.categories))
  ).sort();

  const mergePendingMessages = useCallback((nextReports: Report[]) => {
    return nextReports.map((report) => {
      const pending = pendingMessagesRef.current.get(report.id) ?? [];
      if (pending.length === 0) return report;

      const stillPending = pending.filter((pendingMessage) => {
        return !report.messages.some((message) =>
          message.sender === "parent" &&
          message.text === pendingMessage.text &&
          (message.attachments?.length ?? 0) === (pendingMessage.attachments?.length ?? 0)
        );
      });

      if (stillPending.length === 0) {
        pendingMessagesRef.current.delete(report.id);
        return report;
      }

      pendingMessagesRef.current.set(report.id, stillPending);
      return {
        ...report,
        preview: stillPending.at(-1)?.text || report.preview,
        messages: [...report.messages, ...stillPending],
      };
    });
  }, []);

  const loadAdvisers = useCallback(async () => {
    const requestVersion = ++advisersRequestVersion.current;
    setAdvisersLoading(true);
    setAdvisersError("");

    try {
      const response = await fetch("/api/reports/parent-adviser/advisers", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || "Unable to load your child’s class adviser.");
      if (requestVersion !== advisersRequestVersion.current) return;

      setAdvisers((data?.advisers ?? []) as AdviserRecipient[]);
    } catch (error) {
      if (requestVersion !== advisersRequestVersion.current) return;
      setAdvisersError(error instanceof Error ? error.message : "Unable to load your child’s class adviser.");
    } finally {
      if (requestVersion === advisersRequestVersion.current) setAdvisersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!reportSubmissionCooldownUntil) return;
    setCurrentTime(Date.now());
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [reportSubmissionCooldownUntil]);

  const loadReports = useCallback(async () => {
    const requestVersion = ++reportListRequestVersion.current;
    const [res, staffMessagesRes] = await Promise.all([
      fetch("/api/reports/parent-adviser?summary=1", { cache: "no-store" }),
      fetch("/api/reports/staff-messages?role=parent", { cache: "no-store" }),
    ]);
    const [data, staffMessagesData] = await Promise.all([
      res.json().catch(() => null),
      staffMessagesRes.json().catch(() => null),
    ]);
    // The Realtime refresh may have started a newer authorized snapshot while
    // this request was in flight. Never let the older response hide a message
    // that was just delivered to this open Reports page.
    if (requestVersion !== reportListRequestVersion.current) return;
    if (!res.ok) {
      const message = data?.message || "Unable to load reports.";
      setLoadError(message);
      throw new Error(message);
    }
    setReportSubmissionCooldownUntil(
      typeof data?.reportSubmissionCooldownUntil === "string" ? data.reportSubmissionCooldownUntil : null,
    );
    const standaloneMessages = staffMessagesRes.ok
      ? ((staffMessagesData?.messages ?? []) as StandaloneStaffMessage[]).map(standaloneMessageToReport)
      : [];
    const rawReports = mergePendingMessages([
      ...((data.reports ?? []) as Report[]),
      ...standaloneMessages,
    ]);
    // Deduplicate by id in case of race conditions
    const seen = new Set<number>();
    const nextReports = sortParentReportConversations(rawReports.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }));
    setReports((current) => nextReports.map((report) => {
      const loaded = current.find((item) => item.id === report.id);
      // A list refresh carries current badges and status, but it deliberately
      // omits conversation contents. Keep an already open thread intact until
      // its one-report request supplies the canonical persisted messages.
      // Standalone staff conversations are already returned as complete
      // threads by the authorized staff-messages endpoint. Preserve an open
      // report thread until its focused detail request finishes, but always
      // replace a staff conversation so an Adviser or Guidance reply received
      // through Realtime is visible immediately without a page refresh.
      return loaded?.detailsLoaded && !report.isStandaloneStaffMessage
        ? { ...report, messages: loaded.messages, detailsLoaded: true }
        : report;
    }));
    setLoadError("");
    const firstReport = nextReports.find((report) => !report.isStandaloneStaffMessage);
    const firstSchoolMessage = nextReports.find((report) => report.isStandaloneStaffMessage);
    setSelectedId((current) => current ?? firstReport?.id ?? firstSchoolMessage?.id ?? null);
    // If the parent has no report records, show the available direct school
    // conversation rather than rendering an empty Reports Panel beside it.
    if (!firstReport && firstSchoolMessage) setActivePanel("schoolMessages");
  }, [mergePendingMessages]);

  const loadReportDetail = useCallback(async (id: number) => {
    if (id < 0) return;
    const inFlight = detailRequestsRef.current.get(id);
    if (inFlight) {
      // A message can be committed between an initial detail request and its
      // response. Re-read once it settles so the event cannot be overwritten
      // by that older server snapshot.
      detailRefreshQueuedRef.current.add(id);
      return inFlight;
    }

    const request = (async () => {
      do {
        detailRefreshQueuedRef.current.delete(id);
        const res = await fetch(`/api/reports/parent-adviser?reportId=${id}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Unable to load this conversation.");
        const report = (data?.reports?.[0] ?? null) as Report | null;
        if (!report) continue;
        const [mergedReport] = mergePendingMessages([report]);
        setReports((current) => {
          const alreadyInInbox = current.some((item) => item.id === id);
          if (!alreadyInInbox) {
            // A report Broadcast can arrive while the summary request that
            // introduces this conversation is still in flight. Preserve the
            // complete authorized detail snapshot instead of dropping the
            // message and leaving the Parent to refresh manually.
            return sortParentReportConversations([...current, mergedReport]);
          }
          return current.map((item) => item.id === id ? mergedReport : item);
        });
        setSelectedId((current) => current ?? id);
        setLoadError("");
      } while (detailRefreshQueuedRef.current.has(id));
    })();

    detailRequestsRef.current.set(id, request);
    try {
      await request;
    } finally {
      detailRequestsRef.current.delete(id);
      detailRefreshQueuedRef.current.delete(id);
    }
  }, [mergePendingMessages]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      const requestVersion = ++reportListRequestVersion.current;
      try {
        setLoading(true);
        setLoadError("");
        const [reportsRes, staffMessagesRes] = await Promise.all([
          fetch("/api/reports/parent-adviser?summary=1", { cache: "no-store" }),
          fetch("/api/reports/staff-messages?role=parent", { cache: "no-store" }),
        ]);
        const [reportsData, staffMessagesData] = await Promise.all([
          reportsRes.json().catch(() => null),
          staffMessagesRes.json().catch(() => null),
        ]);

        if (!isMounted || requestVersion !== reportListRequestVersion.current) return;

        if (!reportsRes.ok) {
          setLoadError(reportsData?.message || "Unable to load reports.");
        }
        const standaloneMessages = staffMessagesRes.ok
          ? ((staffMessagesData?.messages ?? []) as StandaloneStaffMessage[]).map(standaloneMessageToReport)
          : [];
        const nextReports = sortParentReportConversations(reportsRes.ok
          ? mergePendingMessages([...(reportsData?.reports ?? []) as Report[], ...standaloneMessages])
          : standaloneMessages);
        setReports(nextReports);
        setReportSubmissionCooldownUntil(
          reportsRes.ok && typeof reportsData?.reportSubmissionCooldownUntil === "string"
            ? reportsData.reportSubmissionCooldownUntil
            : null,
        );
        const firstReport = nextReports.find((report) => !report.isStandaloneStaffMessage);
        const firstSchoolMessage = nextReports.find((report) => report.isStandaloneStaffMessage);
        setSelectedId(firstReport?.id ?? firstSchoolMessage?.id ?? null);
        if (!firstReport && firstSchoolMessage) setActivePanel("schoolMessages");
      } catch (error) {
        if (!isMounted) return;
        console.error("Unable to load parent reports:", error);
        setLoadError(error instanceof Error ? error.message : "Unable to load reports.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadAdvisers();
    void loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [loadAdvisers, loadReports, mergePendingMessages]);

  // Sync sidebar Reports badge — only truly unread reports
  useEffect(() => {
    const count = reports.filter(r => r.unread).length;
    setUnreadReportsCount(count);
  }, [reports, setUnreadReportsCount]);

  const markReportRead = useCallback(async (id: number) => {
    if (id < 0) return;
    if (markingReadIds.current.has(id)) return;
    markingReadIds.current.add(id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, unread: false } : r));

    try {
      const res = await fetch(`/api/reports/parent-adviser/${id}/read`, {
        method: "PATCH",
        cache: "no-store",
      });

      if (res.ok) {
        await loadReports();
      }
    } finally {
      markingReadIds.current.delete(id);
    }
  }, [loadReports]);

  const markStandaloneMessageRead = useCallback(async (report: Report) => {
    const messageId = report.standaloneMessageId;
    if (!messageId || markingReadIds.current.has(report.id)) return;
    markingReadIds.current.add(report.id);
    setReports((current) => current.map((item) => item.id === report.id ? { ...item, unread: false, status: "Read" } : item));
    try {
      const res = await fetch("/api/reports/staff-messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "parent", conversationId: `staff-message:${messageId}`, status: "read" }),
      });
      if (res.ok) await loadReports();
    } finally {
      markingReadIds.current.delete(report.id);
    }
  }, [loadReports]);

  // Mark unread staff messages only when the parent deliberately opens the conversation.
  function handleSelect(selected: Report) {
    setActivePanel(selected.isStandaloneStaffMessage ? "schoolMessages" : "reports");
    setSelectedId(selected.id);
    setReplyText("");
    setReplyAttachments([]);

    // Keep the route aligned with the card that was clicked. This is a client
    // replace, so it does not reload the dashboard, and it prevents a prior
    // notification URL from re-selecting a different report after a refresh.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("teacher");
    if (selected.isStandaloneStaffMessage && selected.standaloneMessageId) {
      params.delete("reportId");
      params.set("conversation", `staff-message:${selected.standaloneMessageId}`);
    } else {
      params.delete("conversation");
      params.set("reportId", String(selected.id));
    }
    const nextQuery = params.toString();
    if (nextQuery !== searchParams.toString()) {
      router.replace(`${pathname}?${nextQuery}`, { scroll: false });
    }

    if (selected?.isStandaloneStaffMessage) {
      if (selected.unread) void markStandaloneMessageRead(selected);
      return;
    }
    void loadReportDetail(selected.id).catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Unable to load this conversation.");
    });
    if (!selected?.unread || selected.reportStatus === "Resolved") return;
    markReportRead(selected.id).catch(() => null);
  }

  useEffect(() => {
    const reportIdParam = Number(searchParams.get("reportId"));
    const teacherParam = searchParams.get("teacher");
    const conversationParam = searchParams.get("conversation");
    const standaloneConversationId = /^staff-message:(\d+)$/.exec(conversationParam ?? "")?.[1];
    const routeSelectionKey = standaloneConversationId
      ? `staff-message:${standaloneConversationId}`
      : Number.isSafeInteger(reportIdParam) && reportIdParam > 0
        ? `report:${reportIdParam}`
        : teacherParam
          ? `teacher:${teacherParam.toLowerCase()}`
          : null;
    if (!routeSelectionKey || lastAppliedRouteSelectionRef.current === routeSelectionKey) return;
    const match = standaloneConversationId
      ? reports.find((report) => report.isStandaloneStaffMessage && report.standaloneMessageId === Number(standaloneConversationId))
      : Number.isSafeInteger(reportIdParam) && reportIdParam > 0
      ? reports.find(r => r.id === reportIdParam)
      : teacherParam
        ? reports.find(r => r.recipientName.toLowerCase() === teacherParam.toLowerCase())
        : undefined;
    if (match) {
      lastAppliedRouteSelectionRef.current = routeSelectionKey;
      setActivePanel(match.isStandaloneStaffMessage ? "schoolMessages" : "reports");
      setSelectedId(match.id);
      setReplyText("");
      setReplyAttachments([]);
      if (match.isStandaloneStaffMessage) {
        if (match.unread) void markStandaloneMessageRead(match);
      } else if (match.unread && match.reportStatus !== "Resolved") {
        markReportRead(match.id).catch(() => null);
      }
    }
  }, [reports, searchParams, markReportRead, markStandaloneMessageRead]);

  const selectedReport = reports.find(r => r.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedReport || selectedReport.isStandaloneStaffMessage || selectedReport.detailsLoaded) return;
    void loadReportDetail(selectedReport.id).catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Unable to load this conversation.");
    });
  }, [selectedReport, loadReportDetail]);
  const requiresStudentConcernConsent = Boolean(
    !selectedReport?.isStandaloneStaffMessage &&
    selectedReport?.subject.startsWith("[Student Concern] ") &&
    selectedReport.allowHistoryAccess !== true
  );
  const selectedReportId = selectedReport?.isStandaloneStaffMessage ? null : selectedReport?.id ?? null;
  selectedReportIdRef.current = selectedReportId;
  const selectedStandaloneConversationId = selectedReport?.isStandaloneStaffMessage && selectedReport.standaloneMessageId
    ? `staff-message:${selectedReport.standaloneMessageId}`
    : null;
  const selectedConversationKey = selectedStandaloneConversationId ?? (selectedReportId ? `report:${selectedReportId}` : null);
  const selectedMessageCount = selectedReport?.messages.length ?? 0;
  const reportTyping = useReportTyping(selectedReportId, "parent");
  const staffConversationTyping = useStaffConversationTyping(selectedStandaloneConversationId, "parent");

  const handleLiveReportUpdate = useCallback(async (event: Parameters<typeof reportTyping.onRealtimeEvent>[0]) => {
    reportTyping.onRealtimeEvent(event);
    if (event.kind === "typing") return;
    // Read the selected conversation first. This gives an idle Parent the
    // committed Guidance reply as soon as the report Broadcast arrives; the
    // following summary refresh only reconciles list metadata and badges.
    // The ref avoids a stale callback selecting the previous Panel-1 item.
    const openReportId = selectedReportIdRef.current;
    if (event.reportId !== null && event.reportId === openReportId) {
      await loadReportDetail(event.reportId);
    }
    await loadReports();
  }, [loadReportDetail, loadReports, reportTyping]);

  const handleLiveReportStatusUpdate = useCallback(async (event: Parameters<typeof reportTyping.onRealtimeEvent>[0]) => {
    if (event.kind !== "status") return;
    // A status handoff is not a message preview update. Re-read the Parent's
    // authorized inbox immediately so the selected card, timeline, guidance
    // banner, and reply ownership change together without a page refresh.
    await Promise.all([
      loadReports(),
      event.reportId !== null && event.reportId === selectedReportId ? loadReportDetail(event.reportId) : Promise.resolve(),
    ]);
  }, [loadReportDetail, loadReports, selectedReportId]);

  const handleLiveStaffMessageUpdate = useCallback(async (event: Parameters<typeof staffConversationTyping.onRealtimeEvent>[0]) => {
    staffConversationTyping.onRealtimeEvent(event);
    if (event.kind === "typing") return;
    // The staff endpoint returns an already-authorized, complete standalone
    // thread. Refresh it immediately so an open Parent conversation renders
    // the saved sender and timestamp without waiting for another action.
    await loadReports();
  }, [loadReports, staffConversationTyping]);

  // Matches Contact ICT's lifecycle while applying selected-report updates in
  // place instead of replacing the conversation with an inbox summary.
  const liveUpdateNotice = useReportMessagesRealtime(loadReports, {
    onReportUpdate: handleLiveReportUpdate,
    onReportStatusUpdate: handleLiveReportStatusUpdate,
    onStaffMessageUpdate: handleLiveStaffMessageUpdate,
    onConnectionStatus: (status) => {
      if (status === "CLOSED") {
        reportTyping.clearOtherTyping();
        reportTyping.stopTyping();
        staffConversationTyping.clearOtherTyping();
        staffConversationTyping.stopTyping();
      }
    },
  });

  useEffect(() => {
    if (!selectedConversationKey) return;
    const shouldFollowLatest = lastScrolledConversationRef.current !== selectedConversationKey || wasAtBottomRef.current;
    lastScrolledConversationRef.current = selectedConversationKey;
    if (!shouldFollowLatest) return;
    const timer = window.setTimeout(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
    return () => window.clearTimeout(timer);
  }, [selectedConversationKey, selectedMessageCount]);

  // The two panels share an authorized parent snapshot but must never share
  // a list. Direct staff messages stay out of report workflows and report
  // records stay out of the School Messages Panel.
  const activePanelItems = activePanel === "reports" ? parentSubmittedReports : schoolMessages;
  const filteredPanelItems = sortParentReportConversations(filterParentReportConversations(activePanelItems, {
    tab: activeFilter,
    category: activePanel === "reports" ? categoryFilter : "All",
  }));
  const counts: Record<FilterTab, number> = countParentReportTabs(activePanelItems, {
    category: activePanel === "reports" ? categoryFilter : "All",
  });
  const unreadPanelCount = activePanelItems.filter((item) => item.unread).length;
  const guideHighlight = (target: string) => guideTarget === target
    ? "relative z-[85] pointer-events-none rounded-2xl ring-4 ring-blue-400 ring-offset-4 ring-offset-slate-100"
    : "";

  function selectPanel(panel: ParentReportsPanel) {
    setActivePanel(panel);
    setActiveFilter("All Messages");
    if (panel === "reports") setCategoryFilter("All");
    const panelItems = panel === "reports" ? parentSubmittedReports : schoolMessages;
    // Panel navigation alone is not a read acknowledgement. The current
    // selection changes visually, while handleSelect remains the only place
    // that opens an item and applies its established read-state behavior.
    setSelectedId(panelItems[0]?.id ?? null);
    setReplyText("");
    setReplyAttachments([]);
  }


  async function handleSendReply() {
    if (sendingReply || (!replyText.trim() && replyAttachments.length === 0) || !selectedReport || (!selectedReport.isStandaloneStaffMessage && selectedReport.reportStatus === "Resolved")) return;
    const reportId = selectedReport.id;
    const sentText = replyText.trim();
    const sentAttachments = replyAttachments;

    try {
      setSendingReply(true);
      setReplyText("");
      setReplyAttachments([]);
      reportTyping.stopTyping();
      staffConversationTyping.stopTyping();

      if (selectedReport.isStandaloneStaffMessage) {
        const messageId = selectedReport.standaloneMessageId;
        if (!messageId) throw new Error("Unable to identify this conversation.");
        const res = await fetch("/api/reports/staff-messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "parent",
            conversationId: `staff-message:${messageId}`,
            status: "replied",
            reply: sentText,
            attachments: sentAttachments,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setReplyText(sentText);
          setReplyAttachments(sentAttachments);
          staffConversationTyping.onDraftChange(true);
          throw new Error(data?.message || "Unable to send your reply.");
        }
        await loadReports();
        return;
      }

      const replyThreadType = selectedReport.recipientRole === "Principal" ? "principal" : selectedReport.recipientRole === "Guidance" ? "guidance" : "adviser";

      const res = await fetch(`/api/reports/parent-adviser/${reportId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          body: sentText,
          role: "parent",
          threadType: replyThreadType,
          attachments: sentAttachments,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Unable to send parent report reply:", data?.message || res.statusText);
        setReplyText(sentText);
        setReplyAttachments(sentAttachments);
        reportTyping.onDraftChange(true);
        return;
      }
      // Use the returned, durable row rather than a local timestamped stub.
      // Realtime may have already completed this request; reloading by ID is
      // idempotent and cannot create a duplicate message.
      await Promise.all([loadReports(), loadReportDetail(reportId)]);
    } finally {
      setSendingReply(false);
    }
  }

  async function saveStudentConcernConsent() {
    if (!selectedReport) return;
    const res = await fetch(`/api/reports/parent-adviser/${selectedReport.id}/consent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termsAccepted: true }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || "Unable to save your agreement.");
    setReports((current) => current.map((report) =>
      report.id === selectedReport.id ? { ...report, allowHistoryAccess: true } : report
    ));
  }

  async function handleNewReport(data: {
    adviserId: number;
    studentId: string;
    subject: string;
    categories: string[];
    concernLevel: number;
    message: string;
    attachments: MessageAttachment[];
    allowHistoryAccess: boolean;
    termsAccepted: boolean;
  }) {
    const res = await fetch("/api/reports/parent-adviser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      if (typeof result?.reportSubmissionCooldownUntil === "string") {
        setReportSubmissionCooldownUntil(result.reportSubmissionCooldownUntil);
      }
      throw new Error(result?.message || "Unable to submit report.");
    }
    if (res.ok && result?.report) {
      // Don't optimistically add — let loadReports fetch the fresh list
      // to avoid duplicates when realtime also fires
      await loadReports().catch((error) => {
        console.error("Unable to refresh parent reports after submitting report:", error);
      });
      setActivePanel("reports");
      setSelectedId(result.report.id);
    }
    setShowModal(false);
  }

  async function handleCancelReport() {
    if (!cancelTarget || cancellingReport) return;
    setCancellingReport(true);
    setCancelError("");
    try {
      const res = await fetch(`/api/reports/parent-adviser/${cancelTarget.id}/cancel`, {
        method: "PATCH",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Unable to cancel this report.");

      if (typeof data?.reportSubmissionCooldownUntil === "string") {
        setReportSubmissionCooldownUntil(data.reportSubmissionCooldownUntil);
      }
      setReports((current) => current.filter((report) => report.id !== cancelTarget.id));
      setSelectedId((current) => current === cancelTarget.id ? null : current);
      setCancelTargetId(null);
      setShowTicketModal(false);
      await loadReports().catch((error) => {
        console.error("Unable to refresh parent reports after cancellation:", error);
      });
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Unable to cancel this report.");
    } finally {
      setCancellingReport(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-100 font-sans md:flex-row xl:h-screen xl:overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-3 py-5 pb-8 sm:px-4 md:px-6 md:py-6 xl:overflow-hidden">
        {liveUpdateNotice && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{liveUpdateNotice}</div>}
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Reports &amp; Concerns</h1>
            <p className="text-slate-500 text-sm mt-0.5">Submit and monitor your concerns with your class adviser</p>
            {cooldownMessage && <p role="status" className="mt-2 text-xs font-bold text-amber-700">{cooldownMessage}</p>}
          </div>
          <button onClick={() => { setShowModal(true); void loadAdvisers(); }} disabled={Boolean(cooldownMessage)}
            data-parent-guide="new-report"
            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition-colors sm:w-auto ${guideHighlight("new-report")}`}
            style={{ background: cooldownMessage ? "#93c5fd" : "#2563eb", color: "#fff", cursor: cooldownMessage ? "not-allowed" : "pointer" }}
            onMouseEnter={e => { if (!cooldownMessage) e.currentTarget.style.background = "#1d4ed8"; }}
            onMouseLeave={e => { if (!cooldownMessage) e.currentTarget.style.background = "#2563eb"; }}>
            <Plus className="w-4 h-4" /> {cooldownMessage ? "New Report Unavailable" : "New Report"}
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:min-h-0 xl:flex-1 xl:flex-row xl:overflow-hidden">
          {/* Left panel — report list */}
          <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:w-[420px] xl:flex-shrink-0">
            <div className="border-b border-slate-100 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Parent reports panels">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePanel === "reports"}
                  onClick={() => selectPanel("reports")}
                  className="min-h-12 rounded-xl border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: activePanel === "reports" ? "#2563eb" : "#e2e8f0",
                    background: activePanel === "reports" ? "#eff6ff" : "#fff",
                    color: activePanel === "reports" ? "#1d4ed8" : "#475569",
                  }}
                >
                  <span className="block text-sm font-extrabold">Reports Panel</span>
                  <span className="mt-0.5 block text-[10px] font-semibold opacity-80">{parentSubmittedReports.length} submitted report{parentSubmittedReports.length === 1 ? "" : "s"}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePanel === "schoolMessages"}
                  onClick={() => selectPanel("schoolMessages")}
                  className="min-h-12 rounded-xl border px-3 py-2 text-left transition-colors"
                  style={{
                    borderColor: activePanel === "schoolMessages" ? "#2563eb" : "#e2e8f0",
                    background: activePanel === "schoolMessages" ? "#eff6ff" : "#fff",
                    color: activePanel === "schoolMessages" ? "#1d4ed8" : "#475569",
                  }}
                >
                  <span className="block text-sm font-extrabold">School Messages Panel</span>
                  <span className="mt-0.5 block text-[10px] font-semibold opacity-80">{schoolMessages.length} conversation{schoolMessages.length === 1 ? "" : "s"}</span>
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-xs font-extrabold text-slate-700">{activePanel === "reports" ? "Reports Panel" : "School Messages Panel"}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {activePanel === "reports"
                    ? "Reports submitted through New Report."
                    : "Direct messages from your Adviser, Guidance, or Principal."}
                </p>
                {unreadPanelCount > 0 && <p className="mt-1 text-[10px] font-bold text-blue-700">{unreadPanelCount} unread</p>}
              </div>
            </div>
            {/* Row 1 — Message type tabs */}
            <div
              data-parent-guide="message-filters"
              aria-label={`${activePanel === "reports" ? "Report" : "School message"} filters`}
              className={`flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-2 pt-3 sm:px-4 ${guideHighlight("message-filters")}`}
              style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}
            >
              {(["All Messages", "Unread", "Principal", "Adviser", "Guidance"] as FilterTab[]).map(tab => {
                const isActive = activeFilter === tab;
                return (
                  <button key={tab} onClick={() => setActiveFilter(tab)}
                    className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                    style={{
                      background: isActive ? "#2563eb" : "transparent",
                      color: isActive ? "#fff" : "#64748b",
                    }}>
                    {tab}
                    {counts[tab] > 0 && (
                      <span className="text-[10px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center"
                        style={{ background: isActive ? "rgba(255,255,255,0.25)" : "#e2e8f0", color: isActive ? "#fff" : "#475569" }}>
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Row 2 — Category filter dropdown */}
            {activePanel === "reports" && <div data-parent-guide="category-filter" className={`border-b border-slate-100 px-3 pb-3 ${guideHighlight("category-filter")}`}>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Filter by Category</label>
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border px-3.5 py-2.5 pr-8 text-sm font-semibold outline-none transition-all"
                  style={{
                    border: categoryFilter !== "All" ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0",
                    background: categoryFilter !== "All" ? "#eff6ff" : "#fff",
                    color: categoryFilter !== "All" ? "#1d4ed8" : "#475569",
                  }}>
                  <option value="All">All Categories ({parentSubmittedReports.length})</option>
                  {allUsedCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat} ({parentSubmittedReports.filter(r => r.categories.includes(cat)).length})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: categoryFilter !== "All" ? "#2563eb" : "#94a3b8" }}
                />
              </div>
            </div>}

            {loadError && (
              <div className="mx-3 mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700">
                {loadError}
              </div>
            )}

            {/* Report list */}
            <div className="divide-y divide-slate-50 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              {loading ? (
                <p className="py-12 text-center text-sm text-slate-400">Loading {activePanel === "reports" ? "reports" : "school messages"}...</p>
              ) : filteredPanelItems.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">No {activePanel === "reports" ? "reports" : "school messages"} found.</p>
              ) : filteredPanelItems.map(r => (
                <button key={r.id} onClick={() => handleSelect(r)}
                  className={`w-full text-left px-4 py-3.5 flex flex-col gap-2 transition-colors hover:bg-blue-50/50 ${r.id === selectedId ? "bg-blue-50 border-l-[3px] border-l-blue-500" : "border-l-[3px] border-l-transparent"}`}>
                  <div className="flex items-center gap-2.5">
                    <span style={{ width: 36, height: 36, minWidth: 36, borderRadius: "50%", background: r.recipientColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{r.recipientInitials}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2 mb-0.5">
                        {r.unread && <span style={{ width: 7, height: 7, minWidth: 7, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />}
                        <p className={`min-w-0 flex-1 text-sm truncate ${r.unread ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>{r.subject}</p>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {r.isStandaloneStaffMessage && (
                          <span className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">{r.recipientRole}</span>
                        )}
                        {r.isStudentSubmittedConcern && (
                          <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">Student concern</span>
                        )}
                        <p className="min-w-0 flex-1 text-[11px] text-slate-400 truncate">{r.preview}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{r.time}</span>
                      {r.hasReportStatus !== false && r.reportStatus && (
                        <ReportStatusBadge
                          status={
                            (r.escalatedToPrincipal || r.escalatedToGuidance) && r.reportStatus !== "Resolved"
                              ? "Escalated"
                              : r.reportStatus!
                          }
                          label={
                            r.escalatedToPrincipal && r.reportStatus !== "Resolved"
                              ? "Escalated to Principal"
                              : r.escalatedToGuidance && r.reportStatus !== "Resolved"
                                ? "Escalated to Guidance"
                                : r.reportStatus!
                          }
                        />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right panel — detail */}
          <div data-parent-guide="conversation-detail" className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm max-h-[calc(100dvh-1.5rem)] xl:max-h-none ${guideHighlight("conversation-detail")}`}>
            {!selectedReport ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a conversation</div>
            ) : (
              <>
                {/* Report header */}
                <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <span style={{ width: 46, height: 46, minWidth: 46, borderRadius: "50%", background: selectedReport.recipientColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15 }}>{selectedReport.recipientInitials}</span>
                    <div className="flex-1 min-w-0">
                      <p className="break-words text-base font-extrabold text-slate-800">
                        {selectedReport.isStandaloneStaffMessage ? `School message from ${selectedReport.recipientName}` : selectedReport.recipientName}
                      </p>
                      <p className="break-words text-xs text-slate-400">{selectedReport.recipientRole}{selectedReport.grade && ` • ${selectedReport.grade} - ${selectedReport.section}`}</p>
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
                      {!selectedReport.isStandaloneStaffMessage && !selectedReport.ticketStatus && !selectedReport.escalatedToGuidance && selectedReport.reportStatus !== "Resolved" && (
                        <button type="button" onClick={() => setShowTicketModal(true)} className="min-h-11 flex-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100 sm:flex-none">Submit Ticket to Guidance</button>
                      )}
                      {selectedReport.canCancel && selectedReport.reportStatus !== "Resolved" && (
                        <button type="button" onClick={() => { setCancelError(""); setCancelTargetId(selectedReport.id); }} className="min-h-11 flex-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 sm:flex-none">Cancel Report</button>
                      )}
                    </div>
                    {selectedReport.ticketStatus === "pending" && <span className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Guidance ticket pending review.</span>}
                  </div>

                  <p className="break-words text-sm text-slate-700">
                    <span className="text-slate-400 font-medium">Subject: </span>
                    <span className="font-semibold">{selectedReport.subject}</span>
                  </p>

                  {selectedReport.isStandaloneStaffMessage && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                      Direct school message from <strong>{selectedReport.recipientName}</strong> ({selectedReport.recipientRole}).
                    </div>
                  )}

                  {selectedReport.submittedByRole === "Subject Teacher" && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-slate-700">
                      <p><strong>Submitted by:</strong> {selectedReport.submittedByName} · Subject Teacher</p>
                      <p className="mt-0.5"><strong>Student:</strong> {selectedReport.studentName} · {selectedReport.grade} - {selectedReport.section}</p>
                      <p className="mt-0.5"><strong>Report date:</strong> {selectedReport.submittedAt}</p>
                    </div>
                  )}

                  {selectedReport.isStudentSubmittedConcern && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-slate-700">
                      <p><strong>Student-submitted concern</strong></p>
                      <p className="mt-0.5"><strong>Student:</strong> {selectedReport.studentName} · {selectedReport.grade} - {selectedReport.section}</p>
                      <p className="mt-0.5">This concern was submitted by the student and forwarded to you by the Class Adviser.</p>
                    </div>
                  )}

                  {/* Category tags */}
                  {!selectedReport.isStandaloneStaffMessage && <div className="flex flex-wrap gap-1.5">
                    {selectedReport.categories.map(cat => (
                      <span key={cat} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }}>{cat}</span>
                    ))}
                  </div>}


                  {/* Status timeline */}
                  {selectedReport.hasReportStatus !== false && selectedReport.reportStatus && (() => {
                    // Escalated to guidance or principal → always show "Escalated" step
                    const effectiveStatus: ReportStatus =
                      (selectedReport.escalatedToPrincipal || selectedReport.escalatedToGuidance) &&
                      selectedReport.reportStatus !== "Resolved"
                        ? "Escalated"
                        : selectedReport.reportStatus!;
                    return <StatusTimeline status={effectiveStatus} />;
                  })()}

                  {/* Guidance escalation banner */}
                  {selectedReport.hasReportStatus !== false && selectedReport.escalatedToPrincipal && !selectedReport.parentRepliedAfterPrincipalEscalation && selectedReport.reportStatus !== "Resolved" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "10px 14px" }}>
                      <AlertTriangle style={{ width: 15, height: 15, color: "#7c3aed", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: "#5b21b6", fontWeight: 600, margin: 0 }}>
                        This concern has been escalated to the <strong>Principal</strong>.
                      </p>
                    </div>
                  )}

                  {selectedReport.hasReportStatus !== false && !selectedReport.escalatedToPrincipal && selectedReport.escalatedToGuidance && !selectedReport.guidanceHasReplied && selectedReport.reportStatus !== "Resolved" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 10, padding: "10px 14px" }}>
                      <AlertTriangle style={{ width: 15, height: 15, color: "#be123c", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: "#9f1239", fontWeight: 600, margin: 0 }}>
                        This concern has been escalated to the <strong>Guidance Counselor</strong>. You will be contacted shortly for a follow-up.
                      </p>
                    </div>
                  )}
                  {selectedReport.ticketStatus && (selectedReport.ticketStatus !== "accepted" || !selectedReport.parentRepliedAfterAcceptedGuidanceTicket) && (
                    <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${selectedReport.ticketStatus === "accepted" ? "border-sky-200 bg-sky-50 text-sky-700" : selectedReport.ticketStatus === "rejected" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      Guidance ticket: <strong className="capitalize">{selectedReport.ticketStatus}</strong>
                      {selectedReport.ticketStatus === "rejected" && selectedReport.ticketRejectionReason ? ` — ${selectedReport.ticketRejectionReason}` : ""}
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div
                  ref={messagesRef}
                  onScroll={(event) => {
                    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
                    wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 48;
                  }}
                  className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-6"
                >
                  {[...selectedReport.messages]
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map(msg => {
                      const mine = msg.sender === "parent";
                      return (
                        <div key={msg.id} className={`flex items-start gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                          {!mine && <UserAvatar name={msg.senderName} className="mt-0.5 h-8 w-8 rounded-full" fallbackClassName="bg-slate-500" />}
                          <div className={`flex max-w-[calc(100%-2.75rem)] flex-col sm:max-w-[82%] ${mine ? "items-end" : "items-start"}`}>
                            <div className={`mb-2 flex flex-wrap items-center gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                              <span className="break-words text-sm font-bold text-slate-700">{mine ? "You" : msg.senderName}</span>
                              {msg.sender !== "parent" && (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${threadBadgeStyle(msg.threadType)}`}>
                                  {threadLabel(msg.threadType)}
                                </span>
                              )}
                              <span className="text-xs text-slate-400">{msg.timestamp}</span>
                            </div>
                            <div className={`max-w-full rounded-2xl px-4 py-3 shadow-sm sm:px-5 sm:py-4 ${mine ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm border border-slate-200 bg-white text-slate-700"}`}>
                              {msg.text && <p className="break-words whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>}
                              <div className={mine ? "[&_a]:border-blue-200 [&_a]:bg-white/95 [&_a]:text-slate-700" : ""}>
                                <AttachmentChips attachments={msg.attachments} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="shrink-0 border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
                  {(selectedReport.isStandaloneStaffMessage ? staffConversationTyping.isOtherParticipantTyping : reportTyping.isOtherParticipantTyping) && (
                    <div aria-live="polite" className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="flex gap-1" aria-hidden="true"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" /></span>
                      The other participant is typing…
                    </div>
                  )}
                  {!selectedReport.isStandaloneStaffMessage && requiresStudentConcernConsent ? (
                    <StudentConcernConsent onConfirm={saveStudentConcernConsent} />
                  ) : !selectedReport.isStandaloneStaffMessage && selectedReport.reportStatus === "Resolved" ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                      This report has been resolved. Messaging is unavailable.
                    </div>
                  ) : (
                  <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {replyAttachments.map((attachment, index) => (
                      <div key={`${attachment.name}-${index}`} className="relative flex h-11 max-w-[150px] items-center gap-2 rounded-xl bg-white px-3 pr-7 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{attachment.name}</span>
                        <button
                          type="button"
                          onClick={() => setReplyAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-white transition hover:bg-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                      <textarea value={replyText} onChange={e => {
                        setReplyText(e.target.value);
                        const hasDraft = Boolean(e.target.value.trim());
                        if (selectedReport.isStandaloneStaffMessage) staffConversationTyping.onDraftChange(hasDraft);
                        else reportTyping.onDraftChange(hasDraft);
                      }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply();
                          }
                        }}
                        placeholder={`Reply to ${selectedReport.recipientName}... (Enter to send)`}
                        rows={2}
                        className="w-full px-3.5 pt-2.5 pb-2 text-sm text-slate-700 outline-none resize-none placeholder:text-slate-400 bg-transparent" />
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                    <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100">
                      <Paperclip className="w-4 h-4" />
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={async (event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          if (files.length === 0) return;
                          const validFiles = files.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
                          const next = await filesToAttachments(validFiles);
                          setReplyAttachments((prev) => [...prev, ...next].slice(0, 5));
                        }}
                      />
                    </label>
                    <button onClick={handleSendReply} disabled={sendingReply || (!replyText.trim() && replyAttachments.length === 0)}
                      className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm transition-colors"
                      style={{ background: !sendingReply && (replyText.trim() || replyAttachments.length > 0) ? "#2563eb" : "#93c5fd", color: "#fff", cursor: !sendingReply && (replyText.trim() || replyAttachments.length > 0) ? "pointer" : "not-allowed" }}
                      onMouseEnter={e => { if (!sendingReply && (replyText.trim() || replyAttachments.length > 0)) e.currentTarget.style.background = "#1d4ed8"; }}
                      onMouseLeave={e => { if (!sendingReply && (replyText.trim() || replyAttachments.length > 0)) e.currentTarget.style.background = "#2563eb"; }}>
                      <Send className="w-4 h-4" /> Send Message
                    </button>
                    </div>
                  </div>
                  </>
                  )}
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showModal && <NewReportModal advisers={advisers} advisersLoading={advisersLoading} advisersError={advisersError} onRetryAdvisers={() => { void loadAdvisers(); }} cooldownMessage={cooldownMessage} onClose={() => setShowModal(false)} onSubmit={handleNewReport} />}
      {showTicketModal && selectedReport && <GuidanceTicketModal report={selectedReport} onClose={() => setShowTicketModal(false)} onSubmitted={loadReports} />}
      {cancelTarget && <CancelReportModal report={cancelTarget} cancelling={cancellingReport} error={cancelError} onClose={() => { if (!cancellingReport) setCancelTargetId(null); }} onConfirm={handleCancelReport} />}
      <ParentReportsGuide onStepChange={setGuideTarget} />
    </div>
  );
}

export default function ParentReportsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><ParentReportsPageContent /></Suspense>;
}
