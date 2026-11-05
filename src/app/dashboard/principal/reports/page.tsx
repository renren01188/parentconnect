"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle,
  ChevronRight,
  Eye,
  FileDown,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  Shield,
  Star,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { type Report, type ReportStatus } from "../../adviser/data";
import { UserAvatar } from "@/components/UserAvatar";
import { ConcernExportModal } from "@/components/reports/ConcernExportModal";
import { MessageAttachments } from "@/components/MessageAttachments";
import { ResolveConfirmationModal } from "@/components/ResolveConfirmationModal";
import { useReportMessagesRealtime } from "@/hooks/useReportMessagesRealtime";
import { useReportTyping } from "@/hooks/useReportTyping";
import { useStaffConversationTyping } from "@/hooks/useStaffConversationTyping";
import { sortByLatestActivity } from "@/lib/latestActivityOrder";
import { isPrincipalReportUnread, markPrincipalReportRead } from "@/lib/principalReportReadState.cjs";
import PrincipalReportsGuide from "../components/PrincipalReportsGuide";
import {
  detailPanelLayout,
  findSelectedParentGroup,
  isReportsPanelVisible,
  principalReportStatusLabel,
  reportGroupKey,
} from "./layoutState.cjs";

type MainTab = "Escalated" | "Monitoring" | "Messages";
type FilterTab = "All" | "Pending" | "Ongoing" | "Escalated" | "Resolved";
type MonitoringPriority = "low" | "medium" | "high";
type MonitoringStatus = "Pending" | "Under Review" | "Accepted Ticket" | "Escalated to Guidance" | "Escalated to Principal" | "Resolved";
type MonitoringSourceFilter = "All" | "Parent" | "Student";
type MonitoringStatusFilter = "All" | MonitoringStatus;
type MonitoringEntry = {
  id: string;
  /** Immutable database timestamp used for sorting, filtering, and export. */
  occurredAt: string;
  date: string;
  from: { name: string; role: string; initials: string };
  to: { name: string; role: string; initials: string };
  category: string;
  concern: string;
  student: string;
  priority: MonitoringPriority;
  status: MonitoringStatus;
};

const MONITORING_STATUS_OPTIONS: MonitoringStatus[] = [
  "Pending",
  "Under Review",
  "Accepted Ticket",
  "Escalated to Guidance",
  "Escalated to Principal",
  "Resolved",
];

type PrincipalStudentReport = {
  id: number;
  student_id: string;
  student_name: string;
  grade: string;
  section: string;
  adviser_id: number;
  adviser_name: string;
  adviser_email: string;
  parent_email: string | null;
  parent_name: string | null;
  contact: string | null;
  category: string;
  title: string;
  description: string;
  status: string;
  notified_parent: boolean;
  created_at: string;
  updated_at: string;
};

interface ParentGroup {
  key: string;
  displayName: string;
  profilePicture?: string | null;
  studentName: string;
  initials: string;
  reports: Report[];
  unread: number;
  maxConcernLevel: number;
}

type PrincipalReply = {
  sender: string;
  senderName?: string;
  senderRole?: "parent" | "adviser" | "guidance" | "principal" | "subject_teacher";
  message: string;
  sent_at: string;
  attachments: MessageAttachment[];
  profilePicture?: string | null;
};

type ConversationSender = {
  id: string;
  name: string;
  role: "Guidance" | "Adviser" | "Parent" | "ICT";
  initials: string;
  type: "staff" | "parent";
  student?: string;
  gradeSection?: string;
};

type ConversationMessage = {
  id: string;
  sender: "them" | "principal";
  body: string;
  sentAt: string;
  attachments?: MessageAttachment[];
};

type Conversation = {
  id: string;
  sender: ConversationSender;
  subject: string;
  category: string;
  status: "New Message" | "Unread" | "Read" | "Sent" | "Replied" | null;
  lastMessageAt: string;
  messages: ConversationMessage[];
};

type NewMessagePayload = {
  recipient: Recipient;
  subject: string;
  categories: string[];
  body: string;
  attachments: MessageAttachment[];
};

type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

type StaffRecipient = {
  id: string;
  name: string;
  email: string;
  role: "Guidance" | "Adviser";
  type: "staff";
  grade?: string;
  section?: string;
};

type ParentRecipient = {
  id: string;
  parentId: number;
  parentEmail: string;
  name: string;
  actualParentName: string;
  studentId: string;
  student: string;
  gradeLevel: string;
  section: string;
  type: "parent";
};

type Recipient = StaffRecipient | ParentRecipient;

type MessageCategory = { name: string; pct: number };

const MESSAGE_CATEGORIES: MessageCategory[] = [
  { name: "Academic Concern", pct: 100 },
  { name: "Health/Medical", pct: 90 },
  { name: "Behavioral Issue", pct: 80 },
  { name: "Attendance", pct: 75 },
  { name: "Directive", pct: 65 },
  { name: "Permission Request", pct: 35 },
  { name: "General Inquiry", pct: 15 },
  { name: "Other", pct: 50 },
];

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

function AttachmentChips({ attachments, mine = false }: { attachments?: MessageAttachment[]; mine?: boolean }) {
  return <MessageAttachments attachments={attachments} mine={mine} className="mt-2 flex max-w-[78%] flex-wrap gap-2" />;
}

type ResolvedReportParentMessage = {
  id: number;
  sender: "principal" | "parent";
  senderName: string;
  message: string;
  attachments: MessageAttachment[];
  sentAt: string;
};

function PrincipalReportParentMessages({
  messages,
  loading,
}: {
  messages: ResolvedReportParentMessage[];
  loading: boolean;
}) {
  return (
    <section className="border-b border-violet-100 bg-violet-50/50 px-4 py-3 sm:px-6" aria-label="Principal messages to Parent">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-violet-600" />
        <h3 className="text-xs font-extrabold text-violet-900">Principal Messages to Parent</h3>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-violet-700">Separate School Messages for this resolved report. They do not reopen the locked report conversation.</p>
      {loading ? (
        <p className="mt-3 text-xs font-semibold text-violet-500">Loading messages…</p>
      ) : messages.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-violet-200 bg-white/70 px-3 py-2 text-xs font-semibold text-violet-700">No separate Principal message has been sent to the Parent.</p>
      ) : (
        <div className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
          {messages.map((entry) => {
            const mine = entry.sender === "principal";
            return (
              <div key={entry.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-sm shadow-sm ${mine ? "rounded-tr-none bg-violet-600 text-white" : "rounded-tl-none border border-violet-100 bg-white text-slate-700"}`}>
                  <div className={`mb-1 flex items-center gap-2 text-[10px] font-semibold ${mine ? "text-violet-100" : "text-slate-400"}`}>
                    <span>{mine ? "You" : entry.senderName}</span>
                    <span>{entry.sentAt}</span>
                  </div>
                  {entry.message && <p className="whitespace-pre-wrap leading-relaxed">{entry.message}</p>}
                  <MessageAttachments attachments={entry.attachments} mine={mine} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ResolvedReportParentMessageModal({
  report,
  onClose,
  onSubmit,
}: {
  report: Report;
  onClose: () => void;
  onSubmit: (message: string, attachments: MessageAttachment[]) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const addAttachments = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;
    const oversize = selected.find((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (oversize) {
      setError(`“${oversize.name}” is over the 10 MB attachment limit.`);
      return;
    }
    if (attachments.length + selected.length > 5) {
      setError("You can attach up to 5 files.");
      return;
    }
    try {
      const next = await Promise.all(selected.map(fileToAttachment));
      setAttachments((current) => [...current, ...next]);
      setError(null);
    } catch {
      setError("One of the attachments could not be read. Please try again.");
    }
  };

  const submit = async () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError("Enter a message for the Parent.");
      return;
    }
    if (sending) return;
    try {
      setSending(true);
      setError(null);
      await onSubmit(trimmedMessage, attachments);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to send the message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={() => !sending && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-parent-message-title"
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="send-parent-message-title" className="text-lg font-extrabold text-slate-900">Send Message to Parent</h2>
            <p className="mt-1 text-sm text-slate-500">This sends a separate School Message and does not reopen the resolved report conversation.</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close Send Message to Parent" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}

          <label className="block text-sm font-bold text-slate-700">
            Concern
            <input value={report.subject} readOnly aria-readonly="true" className="mt-1.5 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-600" />
          </label>

          <label className="block text-sm font-bold text-slate-700">
            Message <span className="text-red-500">*</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              maxLength={10_000}
              placeholder="Write a message for the Parent…"
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 font-normal text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <div>
            <p className="mb-1.5 text-sm font-bold text-slate-700">Attachment <span className="font-normal text-slate-400">(optional, max. 10 MB each)</span></p>
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/40 p-4 text-center transition hover:border-violet-400 hover:bg-violet-50">
              <Upload className="h-5 w-5 text-violet-500" />
              <span className="text-sm font-semibold text-violet-800">Choose attachment</span>
              <span className="text-xs text-violet-600">PDF, DOC, DOCX, JPG, or PNG · up to 5 files</span>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                className="hidden"
                onChange={async (event) => {
                  await addAttachments(event.target.files ?? []);
                  event.target.value = "";
                }}
              />
            </label>
            <MessageAttachments
              attachments={attachments}
              onRemove={(index) => setAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index))}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={sending} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
          <button type="button" onClick={submit} disabled={sending || !message.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300">
            <Send className="h-4 w-4" /> {sending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}


function parentDisplayName(report: Report) {
  return report.parent_name?.trim() || `${report.student_name} Parent's`;
}

function canSendResolvedReportParentMessage(report: Report | null) {
  return report?.status === "Resolved" && (report.resolvedByRole === "Adviser" || report.resolvedByRole === "Guidance");
}

function getInitials(name: string) {
  return name
    .replace(/Parent's$/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getAvatarColor(name: string) {
  const colors = ["bg-violet-600", "bg-fuchsia-600", "bg-blue-600", "bg-sky-600", "bg-rose-600", "bg-emerald-600"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function reportActivityTime(report: Report) {
  const timestamp = Date.parse(report.lastActivityAt ?? report.createdAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestReportFirst(a: Report, b: Report) {
  return reportActivityTime(b) - reportActivityTime(a) || b.id - a.id;
}

function newestGroupFirst(a: ParentGroup, b: ParentGroup) {
  return newestReportFirst(a.reports[0]!, b.reports[0]!);
}

function favoriteFirstReport(favoriteReportIds: Set<number>) {
  return (a: Report, b: Report) =>
    Number(favoriteReportIds.has(b.id)) - Number(favoriteReportIds.has(a.id))
    || newestReportFirst(a, b);
}

function groupHasFavorite(group: ParentGroup, favoriteReportIds: Set<number>) {
  return group.reports.some((report) => favoriteReportIds.has(report.id));
}

function ParentAvatar({ name, profilePicture, initials, className }: { name: string; profilePicture?: string | null; initials: string; className: string }) {
  void profilePicture;
  return (
    <div className={`${className} ${getAvatarColor(name)} overflow-hidden flex items-center justify-center text-white font-extrabold shrink-0`}>
      {initials}
    </div>
  );
}

function getStatusStyle(status: ReportStatus) {
  switch (status) {
    case "New": return "bg-sky-500 text-white";
    case "Read": return "bg-slate-200 text-slate-600";
    case "Ongoing": return "bg-blue-100 text-blue-700";
    case "Replied": return "bg-indigo-100 text-indigo-700";
    case "Resolved": return "bg-emerald-100 text-emerald-700";
    case "Escalated": return "bg-red-100 text-red-600";
  }
}

function principalReportStatusClass(report: Report) {
  if (report.status === "Resolved") return "bg-emerald-100 text-emerald-700";
  if (report.escalatedToPrincipal) return "bg-red-100 text-red-700";
  if (report.escalatedToGuidance) return "bg-violet-100 text-violet-700";
  return report.ticketStatus === "accepted" && !report.escalatedToPrincipal
    ? "bg-sky-100 text-sky-700"
    : getStatusStyle(report.status);
}

function principalHistoryRoleStyle(role?: PrincipalReply["senderRole"]) {
  switch (role) {
    case "parent": return "border-sky-200 bg-sky-50 text-sky-700";
    case "guidance": return "border-blue-700 bg-blue-700 text-white";
    case "adviser": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "principal": return "border-violet-200 bg-violet-50 text-violet-700";
    case "subject_teacher": return "border-amber-200 bg-amber-50 text-amber-800";
    default: return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function monitoringPriorityClass(priority: MonitoringPriority) {
  if (priority === "high") return "bg-red-600 text-white";
  if (priority === "medium") return "bg-yellow-400 text-white";
  return "bg-sky-500 text-white";
}

function monitoringStatusClass(status: MonitoringStatus) {
  if (status === "Escalated to Principal") return "bg-red-600 text-white";
  if (status === "Accepted Ticket") return "bg-sky-600 text-white";
  if (status === "Escalated to Guidance") return "bg-violet-600 text-white";
  if (status === "Resolved") return "bg-emerald-100 text-emerald-700";
  if (status === "Under Review") return "bg-blue-100 text-blue-700";
  return "bg-amber-50 text-amber-700 border border-amber-200";
}

function monitoringStatusFromReport(report: Report): MonitoringStatus {
  if (report.escalatedToPrincipal) return "Escalated to Principal";
  if (report.ticketStatus === "accepted") return "Accepted Ticket";
  if (report.escalatedToGuidance) return "Escalated to Guidance";
  if (report.status === "Resolved") return "Resolved";
  if (report.status === "Ongoing" || report.status === "Read") return "Under Review";
  return "Pending";
}

function monitoringPriorityFromLevel(level: number): MonitoringPriority {
  if (level >= 75) return "high";
  if (level >= 35) return "medium";
  return "low";
}

function reportsToMonitoringEntries(reports: Report[]): MonitoringEntry[] {
  return reports.map((report) => {
    const fromName = parentDisplayName(report);
    const occurredAt = report.createdAt || report.submitted_at;
    const destination = report.escalatedToPrincipal
      ? { name: "School Principal", role: "Principal", initials: "SP" }
      : report.ticketStatus === "accepted" || report.escalatedToGuidance
        ? { name: "Guidance Office", role: "Guidance", initials: "GO" }
        : { name: "Class Adviser", role: "Adviser", initials: "CA" };
    return {
      id: `parent:${report.id}`,
      occurredAt,
      date: formatManilaTimestamp(occurredAt) || report.submitted_at,
      from: { name: fromName, role: "Parent", initials: getInitials(fromName) },
      to: destination,
      category: report.categories[0] ?? report.category,
      concern: report.subject,
      student: report.student_name,
      priority: monitoringPriorityFromLevel(report.concernLevel),
      status: monitoringStatusFromReport(report),
    };
  });
}

function studentReportStatus(status: string): MonitoringStatus {
  const normalized = status.toLowerCase();
  if (normalized === "resolved") return "Resolved";
  if (normalized === "escalated") return "Escalated to Principal";
  if (normalized === "ongoing") return "Under Review";
  return "Pending";
}

function studentReportsToMonitoringEntries(reports: PrincipalStudentReport[]): MonitoringEntry[] {
  return reports.map((report) => {
    const status = studentReportStatus(report.status);
    const destination = status === "Escalated to Principal"
      ? { name: "School Principal", role: "Principal", initials: "SP" }
      : { name: report.adviser_name || "Class Adviser", role: "Adviser", initials: getInitials(report.adviser_name || "Class Adviser") };
    return {
      id: `student:${report.id}`,
      occurredAt: report.created_at,
      date: formatManilaTimestamp(report.created_at),
      from: { name: report.student_name, role: "Student", initials: getInitials(report.student_name) },
      to: destination,
      category: report.category || "Other",
      concern: report.description ? `${report.title}: ${report.description}` : report.title,
      student: `${report.student_name} (${report.grade} - ${report.section})`,
      priority: "medium",
      status,
    };
  });
}

function conversationStatusClass(status: Conversation["status"]) {
  if (status === "New Message" || status === "Unread") return "bg-violet-600 text-white";
  if (status === "Sent") return "bg-violet-50 text-violet-700";
  if (status === "Replied") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-200 text-slate-600";
}

function formatManilaTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function manilaDateKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function monitoringEntryTimestamp(entry: MonitoringEntry) {
  const timestamp = Date.parse(entry.occurredAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** The parent and student feeds are independent, so dedupe only an exact,
 * source-qualified record ID. Distinct reports with similar titles remain. */
function dedupeMonitoringEntries(entries: MonitoringEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function monitoringDateRangeLabel(startDate: string, endDate: string) {
  if (startDate && endDate) return `${startDate} to ${endDate}`;
  if (startDate) return `From ${startDate}`;
  if (endDate) return `Through ${endDate}`;
  return "All dates";
}

function MonitoringPerson({ person }: { person: MonitoringEntry["from"] }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[11px] font-extrabold text-violet-700 ring-1 ring-violet-100">
        {person.initials}
      </div>
      <div>
        <p className="text-sm font-extrabold leading-tight text-slate-800">{person.name}</p>
        <p className="mt-0.5 text-xs font-medium text-slate-400">{person.role}</p>
      </div>
    </div>
  );
}

function ConversationAvatar({ sender }: { sender: ConversationSender }) {
  if (sender.type === "staff") {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600">
        <Shield className="h-4 w-4 text-white" />
      </div>
    );
  }

  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${getAvatarColor(sender.name)} text-xs font-extrabold text-white`}>
      {sender.initials}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "selected";
}

function monitoringExportRows(items: MonitoringEntry[]) {
  return items.map((entry) => ({
    recordId: entry.id,
    date: entry.date,
    fromName: entry.from.name,
    fromRole: entry.from.role,
    toName: entry.to.name,
    toRole: entry.to.role,
    category: entry.category,
    concern: entry.concern,
    student: entry.student,
    priority: entry.priority.toUpperCase(),
    status: entry.status,
  }));
}

async function exportMonitoringToExcel(
  items: MonitoringEntry[],
  filterSummary: string,
  filename = `principal_report_monitoring_${manilaDateKey(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)}.xlsx`,
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ParentConnect";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Report Monitoring");
  sheet.columns = [
    { header: "Report ID", key: "recordId", width: 16 },
    { header: "Submitted (PHT)", key: "date", width: 24 },
    { header: "From", key: "fromName", width: 24 },
    { header: "From Role", key: "fromRole", width: 15 },
    { header: "To", key: "toName", width: 23 },
    { header: "To Role", key: "toRole", width: 15 },
    { header: "Student", key: "student", width: 28 },
    { header: "Category", key: "category", width: 22 },
    { header: "Concern", key: "concern", width: 48 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Status", key: "status", width: 28 },
  ];
  // Keep a compact context block above the data. The header is deliberately
  // frozen and filtered so a long export remains easy to scan.
  sheet.spliceRows(1, 0, [], [], [], []);
  sheet.addRows(monitoringExportRows(items));

  sheet.mergeCells("A1:K1");
  sheet.getCell("A1").value = "ParentConnect - Report Monitoring";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF522081" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.mergeCells("A2:K2");
  sheet.getCell("A2").value = `Filters: ${filterSummary}`;
  sheet.getCell("A3").value = `Generated (PHT): ${formatManilaTimestamp(new Date())}`;
  sheet.getCell("K3").value = `Total records: ${items.length}`;
  sheet.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };
  sheet.getRow(3).font = { color: { argb: "FF64748B" } };
  sheet.getCell("K3").alignment = { horizontal: "right" };
  sheet.getRow(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  sheet.getRow(5).alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(5).height = 24;
  sheet.autoFilter = { from: "A5", to: `K${Math.max(5, items.length + 5)}` };
  sheet.views = [{ state: "frozen", ySplit: 5 }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
    if (rowNumber > 5) row.height = 34;
  });

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 5 && rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}

function pdfSafe(value: string) {
  return value.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7E]/g, " ");
}

function makePdfText(text: string, x: number, y: number, size = 10, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfSafe(text)}) Tj ET`;
}

function makePdfRect(x: number, y: number, width: number, height: number, gray = 0.96) {
  return `q ${gray} g ${x} ${y} ${width} ${height} re f Q`;
}

function makePdfLine(x1: number, y1: number, x2: number, y2: number, gray = 0.82) {
  return `q ${gray} G ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function compactPdfText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function wrapPdfText(value: string, maxLength: number, maxLines: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return ["-"];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const segments = word.length > maxLength
      ? word.match(new RegExp(`.{1,${maxLength}}`, "g")) ?? [word]
      : [word];
    for (const segment of segments) {
      const next = line ? `${line} ${segment}` : segment;
      if (next.length <= maxLength || !line) {
        line = next;
        continue;
      }
      lines.push(line);
      line = segment;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = compactPdfText(visible[maxLines - 1], Math.max(4, maxLength - 3)) + "...";
  return visible;
}

function createMonitoringPdf(items: MonitoringEntry[], filterSummary: string) {
  const pageWidth = 792;
  const pageHeight = 612;
  const left = 36;
  const right = 756;
  const rowHeight = 54;
  const rowsPerPage = 7;
  const pages = items.length
    ? Array.from({ length: Math.ceil(items.length / rowsPerPage) }, (_, index) => items.slice(index * rowsPerPage, (index + 1) * rowsPerPage))
    : [[]];
  const columns = [
    { label: "Submitted", x: left + 6, width: 82, maxLength: 18, maxLines: 3 },
    { label: "Source -> Recipient", x: left + 88, width: 138, maxLength: 29, maxLines: 3 },
    { label: "Student", x: left + 226, width: 104, maxLength: 21, maxLines: 3 },
    { label: "Category", x: left + 330, width: 82, maxLength: 16, maxLines: 3 },
    { label: "Concern", x: left + 412, width: 188, maxLength: 38, maxLines: 3 },
    { label: "Priority / Status", x: left + 600, width: 120, maxLength: 24, maxLines: 3 },
  ];
  const pageBodies = pages.map((pageRows, pageIndex) => {
    const commands: string[] = [];
    commands.push(makePdfRect(0, pageHeight - 70, pageWidth, 70, 0.95));
    commands.push(makePdfText("ParentConnect", left, 572, 9, true));
    commands.push(makePdfText("Report Monitoring", left, 550, 17, true));
    wrapPdfText(`Filters: ${filterSummary}`, 116, 2).forEach((line, lineIndex) => {
      commands.push(makePdfText(line, left, 532 - lineIndex * 10, 8));
    });
    commands.push(makePdfText(`Generated (PHT): ${formatManilaTimestamp(new Date())}`, 510, 558, 8));

    if (pageIndex === 0) {
      commands.push(makePdfText(`${items.length} matching report${items.length === 1 ? "" : "s"}`, left, 498, 9, true));
      commands.push(makePdfText(`${items.filter((entry) => entry.from.role === "Parent").length} parent`, left + 150, 498, 9));
      commands.push(makePdfText(`${items.filter((entry) => entry.from.role === "Student").length} student`, left + 250, 498, 9));
      commands.push(makePdfText(`${items.filter((entry) => entry.status === "Escalated to Principal").length} escalated to principal`, left + 350, 498, 9));
    }

    const tableHeaderY = pageIndex === 0 ? 462 : 510;
    commands.push(makePdfRect(left, tableHeaderY - 15, right - left, 23, 0.88));
    columns.forEach((column) => commands.push(makePdfText(column.label, column.x + 4, tableHeaderY - 1, 7, true)));
    columns.slice(1).forEach((column) => commands.push(makePdfLine(column.x, tableHeaderY - 15, column.x, tableHeaderY + 8, 0.78)));
    let rowTop = tableHeaderY - 15;

    pageRows.forEach((entry, index) => {
      const rowBottom = rowTop - rowHeight;
      if (index % 2 === 0) commands.push(makePdfRect(left, rowBottom, right - left, rowHeight, 0.985));
      const cells = [
        entry.date,
        `${entry.from.role}: ${entry.from.name} -> ${entry.to.role}: ${entry.to.name}`,
        entry.student,
        entry.category,
        entry.concern,
        `${entry.priority.toUpperCase()} | ${entry.status}`,
      ];
      cells.forEach((value, cellIndex) => {
        const column = columns[cellIndex];
        wrapPdfText(value, column.maxLength, column.maxLines).forEach((line, lineIndex) => {
          commands.push(makePdfText(line, column.x + 4, rowTop - 12 - lineIndex * 10, 7, cellIndex === columns.length - 1));
        });
      });
      columns.slice(1).forEach((column) => commands.push(makePdfLine(column.x, rowBottom, column.x, rowTop, 0.9)));
      commands.push(makePdfLine(left, rowBottom, right, rowBottom, 0.9));
      rowTop = rowBottom;
    });

    commands.push(makePdfLine(left, 46, right, 46, 0.82));
    commands.push(makePdfText("Confidential report monitoring export", left, 28, 8));
    commands.push(makePdfText(`Page ${pageIndex + 1} of ${pages.length}`, 690, 28, 8));
    return commands.join("\n");
  });

  const pageObjectNumbers = pageBodies.map((_, index) => 3 + index * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageBodies.length} >>`,
  ];
  pageBodies.forEach((body, index) => {
    const pageObjectNumber = pageObjectNumbers[index];
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function exportMonitoringToPdf(
  items: MonitoringEntry[],
  filterSummary: string,
  filename = `principal_report_monitoring_${manilaDateKey(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)}.pdf`,
) {
  downloadBlob(createMonitoringPdf(items, filterSummary), filename);
}

function ExportMonitoringModal({ items, filterSummary, onClose }: { items: MonitoringEntry[]; filterSummary: string; onClose: () => void }) {
  return (
    <ConcernExportModal
      title="Export Concerns"
      description="Choose a file type and which report monitoring records to include."
      theme="violet"
      allLabel="All Concerns"
      recordNoun="monitoring concern"
      options={items.map((entry) => ({
        id: entry.id,
        label: `${entry.student} - ${entry.concern}`,
      }))}
      filters={filterSummary.split(" · ")}
      onClose={onClose}
      onExport={async ({ format, scope, selectedId }) => {
        const selected = selectedId ? items.find((entry) => entry.id === selectedId) ?? null : null;
        const exportItems = scope === "all" ? items : selected ? [selected] : [];
        if (exportItems.length === 0) throw new Error("There are no matching concerns to export.");

        const scopeLabel = scope === "all" ? "All matching report monitoring results" : "Selected monitoring concern";
        const exportSummary = `${filterSummary} · Scope: ${scopeLabel}`;
        const date = manilaDateKey(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10);
        const filename = scope === "all"
          ? `principal_all_concerns_${date}.${format === "excel" ? "xlsx" : "pdf"}`
          : `principal_concern_${safeFilePart(selected?.concern ?? "selected")}.${format === "excel" ? "xlsx" : "pdf"}`;

        if (format === "excel") await exportMonitoringToExcel(exportItems, exportSummary, filename);
        else exportMonitoringToPdf(exportItems, exportSummary, filename);
      }}
    />
  );
}

function computeMessageLevel(categories: string[]) {
  return Math.min(100, MESSAGE_CATEGORIES.filter((category) => categories.includes(category.name)).reduce((sum, category) => sum + category.pct, 0));
}

function RecipientAvatar({ recipient }: { recipient: Recipient }) {
  if (recipient.type === "staff") {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600">
        <Shield className="h-4 w-4 text-white" />
      </div>
    );
  }

  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${getAvatarColor(recipient.name)} text-xs font-bold text-white`}>
      {getInitials(recipient.name)}
    </div>
  );
}

function priorityLabel(level: number) {
  if (level >= 100) return "Urgent / Serious";
  if (level >= 75) return "High Priority";
  if (level >= 50) return "Medium Priority";
  return "Low Priority";
}

function priorityClass(level: number) {
  if (level >= 100) return "bg-red-600 text-white";
  if (level >= 75) return "bg-orange-500 text-white";
  if (level >= 50) return "bg-yellow-400 text-white";
  return "bg-sky-500 text-white";
}

function PriorityBadge({ level, large = false, compact = false }: { level: number; large?: boolean; compact?: boolean }) {
  return (
    <span className={`${large ? "px-3 py-1.5 text-xs" : compact ? "px-2 py-1 text-[10px] leading-none" : "px-2 py-0.5 text-[11px]"} rounded-full font-extrabold ${priorityClass(level)}`}>
      {priorityLabel(level)}
    </span>
  );
}

function ConcernBar({ level }: { level: number }) {
  const color = level >= 100 ? "#dc2626" : level >= 75 ? "#f97316" : level >= 50 ? "#eab308" : "#0ea5e9";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full transition-all" style={{ width: `${level}%`, background: color }} />
      </div>
      <span className="min-w-9 text-right text-[11px] font-extrabold" style={{ color }}>{level}%</span>
    </div>
  );
}

function StatusSummaryPills({ reports }: { reports: Report[] }) {
  const counts: Partial<Record<ReportStatus, number>> = {};
  reports.forEach((report) => { counts[report.status] = (counts[report.status] ?? 0) + 1; });

  const config: Record<ReportStatus, { dot: string; cls: string }> = {
    New: { dot: "bg-sky-500", cls: "bg-sky-50 text-sky-800 border border-sky-200" },
    Read: { dot: "bg-slate-400", cls: "bg-slate-50 text-slate-700 border border-slate-200" },
    Ongoing: { dot: "bg-amber-400", cls: "bg-amber-50 text-amber-800 border border-amber-200" },
    Replied: { dot: "bg-indigo-500", cls: "bg-indigo-50 text-indigo-800 border border-indigo-200" },
    Escalated: { dot: "bg-rose-500", cls: "bg-rose-50 text-rose-800 border border-rose-200" },
    Resolved: { dot: "bg-emerald-400", cls: "bg-emerald-50 text-emerald-800 border border-emerald-200" },
  };

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {(["Escalated", "Ongoing", "New", "Read", "Resolved"] as ReportStatus[])
        .filter((status) => counts[status])
        .map((status) => (
          <span key={status} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config[status].cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${config[status].dot}`} />
            {counts[status]} {status}
          </span>
        ))}
    </div>
  );
}

function NewMessageModal({
  onClose,
  onMessageSent,
  staffRecipients,
  parentRecipients,
}: {
  onClose: () => void;
  onMessageSent?: (payload: NewMessagePayload) => Promise<void> | void;
  staffRecipients: StaffRecipient[];
  parentRecipients: ParentRecipient[];
}) {
  const [recipientId, setRecipientId] = useState("");
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [gradeLevel, setGradeLevel] = useState("");
  const [section, setSection] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const recipientRef = useRef<HTMLDivElement>(null);

  const allRecipients: Recipient[] = [...staffRecipients, ...parentRecipients];
  const selectedRecipient = allRecipients.find((recipient) => recipient.id === recipientId);
  const gradeLevels = Array.from(new Set(parentRecipients.map((parent) => parent.gradeLevel).filter(Boolean))).sort();
  const availableSections = Array.from(new Set(parentRecipients.filter((parent) => parent.gradeLevel === gradeLevel).map((parent) => parent.section))).sort();
  const filteredParents = parentRecipients.filter((parent) => {
    const query = parentSearch.trim().toLowerCase();
    return parent.gradeLevel === gradeLevel &&
      parent.section === section &&
      (!query || parent.name.toLowerCase().includes(query) || parent.student.toLowerCase().includes(query));
  });
  const concernLevel = computeMessageLevel(selectedCats);
  const otherSelected = selectedCats.includes("Other");
  // This is a direct-message composer, so it never collects report-only
  // category or concern-level metadata.
  const isMessageMode = true;
  const canSubmit = !!recipientId && !!subject.trim() && (isMessageMode || (selectedCats.length > 0 && (!otherSelected || !!otherText.trim()))) && (!!message.trim() || attachments.length > 0) && !sending;
  const barColor = concernLevel >= 100 ? "#dc2626" : concernLevel >= 75 ? "#f97316" : concernLevel >= 50 ? "#eab308" : "#0ea5e9";

  function toggleCategory(name: string) {
    setSelectedCats((prev) => prev.includes(name) ? prev.filter((category) => category !== name) : [...prev, name]);
  }

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (recipientOpen && recipientRef.current && !recipientRef.current.contains(event.target as Node)) setRecipientOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [recipientOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-3 sm:justify-end sm:p-5" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[500px] flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900">Send a Concern</h2>
            <p className="mt-1 text-sm text-slate-400">Send a message about a monitored or escalated report</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
              <CheckCircle className="h-7 w-7 text-violet-600" />
            </div>
            <p className="text-base font-bold text-slate-900">Message Sent!</p>
            <p className="text-center text-sm text-slate-400">Your message has been sent to {selectedRecipient?.name}.</p>
            <button onClick={onClose} className="mt-2 rounded-xl bg-violet-600 px-7 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700">Done</button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-4 sm:gap-5 sm:px-6 sm:py-5">
            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {submitError}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Send To <span className="text-red-500">*</span></label>
              <div className="relative" ref={recipientRef}>
                <button
                  type="button"
                  onClick={() => setRecipientOpen((prev) => !prev)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left transition hover:border-violet-300"
                >
                  {selectedRecipient ? (
                    <>
                      <RecipientAvatar recipient={selectedRecipient} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{selectedRecipient.type === "parent" ? selectedRecipient.student : selectedRecipient.name}</p>
                        <p className="text-xs text-slate-400">{selectedRecipient.type === "staff" ? `${selectedRecipient.role} · ${selectedRecipient.email}` : `Parent: ${selectedRecipient.name}`}</p>
                      </div>
                    </>
                  ) : (
                    <p className="flex-1 text-sm text-slate-400">Select a recipient...</p>
                  )}
                  <ChevronRight className={`h-4 w-4 shrink-0 rotate-90 text-slate-400 transition-transform ${recipientOpen ? "-rotate-90" : ""}`} />
                </button>

                {recipientOpen && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">School Staff</p>
                    </div>
                    {staffRecipients.length === 0 && (
                      <p className="px-3.5 py-4 text-center text-xs font-semibold text-slate-400">No staff accounts found.</p>
                    )}
                    {staffRecipients.map((recipient) => (
                      <button
                        key={recipient.id}
                        type="button"
                        onMouseDown={(event) => { event.preventDefault(); setRecipientId(recipient.id); setRecipientOpen(false); }}
                        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-slate-50 ${recipientId === recipient.id ? "bg-violet-50" : ""}`}
                      >
                        <RecipientAvatar recipient={recipient} />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{recipient.name}</p>
                          <p className="text-xs text-slate-400">{recipient.role} · {recipient.email}</p>
                        </div>
                        {recipientId === recipient.id && <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-violet-600" />}
                      </button>
                    ))}

                    <div className="border-y border-slate-100 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Parents</p>
                    </div>
                    <div className="flex flex-col gap-2.5 border-b border-slate-100 bg-white p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Grade Level</span>
                          <select
                            value={gradeLevel}
                            onChange={(event) => {
                              setGradeLevel(event.target.value);
                              setSection("");
                              if (selectedRecipient?.type === "parent") setRecipientId("");
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                          >
                            <option value="">Choose grade</option>
                            {gradeLevels.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Section</span>
                          <select
                            value={section}
                            disabled={!gradeLevel}
                            onChange={(event) => {
                              setSection(event.target.value);
                              if (selectedRecipient?.type === "parent") setRecipientId("");
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-300"
                          >
                            <option value="">Choose section</option>
                            {availableSections.map((item) => <option key={item} value={item}>{item}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                        <Search className="h-3.5 w-3.5 text-slate-400" />
                        <input
                          value={parentSearch}
                          onChange={(event) => setParentSearch(event.target.value)}
                          disabled={!gradeLevel || !section}
                          placeholder="Search parent or student..."
                          className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 disabled:text-slate-300"
                        />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {!gradeLevel || !section ? (
                        <p className="px-3.5 py-4 text-center text-xs font-semibold text-slate-400">Choose a grade level and section to show parents.</p>
                      ) : filteredParents.length === 0 ? (
                        <p className="px-3.5 py-4 text-center text-xs font-semibold text-slate-400">No parents found for this section.</p>
                      ) : (
                        filteredParents.map((parent) => (
                          <button
                            key={parent.id}
                            type="button"
                            onMouseDown={(event) => { event.preventDefault(); setRecipientId(parent.id); setRecipientOpen(false); }}
                            className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-slate-50 ${recipientId === parent.id ? "bg-violet-50" : ""}`}
                          >
                            <RecipientAvatar recipient={parent} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-800">{parent.student}</p>
                              <p className="truncate text-xs text-slate-400">Parent: {parent.name}</p>
                            </div>
                            {recipientId === parent.id && <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-violet-600" />}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Subject <span className="text-red-500">*</span></label>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Enter subject..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            {!isMessageMode && <div>
              <label className="mb-2 block text-xs font-bold text-slate-700">Concern Categories <span className="text-red-500">*</span> <span className="text-[11px] font-normal text-slate-400">Select all that apply</span></label>
              <div className="mb-3 flex flex-wrap gap-2">
                {MESSAGE_CATEGORIES.map((category) => {
                  const checked = selectedCats.includes(category.name);
                  return (
                    <button
                      key={category.name}
                      type="button"
                      onClick={() => toggleCategory(category.name)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${checked ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                    >
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${checked ? "border-violet-500 bg-violet-600" : "border-slate-300 bg-white"}`}>
                        {checked && <span className="block h-1.5 w-1.5 rounded-sm bg-white" />}
                      </span>
                      {category.name}
                    </button>
                  );
                })}
              </div>

              {otherSelected && (
                <input
                  value={otherText}
                  onChange={(event) => setOtherText(event.target.value)}
                  placeholder="Please describe your concern..."
                  autoFocus
                  className="mb-3 w-full rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs text-violet-700 outline-none"
                />
              )}

              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="mb-1.5 flex justify-between">
                  <span className="text-[11px] font-bold text-slate-500">Concern Level</span>
                  <span className="text-[11px] font-extrabold" style={{ color: barColor }}>{concernLevel}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full transition-all" style={{ width: `${concernLevel}%`, background: barColor }} />
                </div>
                {concernLevel >= 100 && <p className="mt-1 text-[11px] font-semibold text-red-500">Maximum concern level reached</p>}
              </div>
            </div>}

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Message <span className="text-red-500">*</span></label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Type your message..."
                rows={5}
                className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-700">Attachments</label>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-5 transition hover:border-violet-300 hover:bg-violet-50/30">
                <Upload className="h-6 w-6 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Click to upload or drag and drop</p>
                <p className="text-xs text-slate-400">PDF, DOC, DOCX, JPG, PNG (max. 10MB)</p>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async (event) => {
                    if (event.target.files) {
                      const nextAttachments = await filesToAttachments(event.target.files);
                      setAttachments((prev) => [...prev, ...nextAttachments]);
                    }
                    event.target.value = "";
                  }}
                />
              </label>
              <MessageAttachments
                attachments={attachments}
                onRemove={(index) => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
              />
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={onClose} className="min-h-11 w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto">Cancel</button>
              <button
                onClick={async () => {
                  if (!canSubmit || !selectedRecipient) return;
                  try {
                    setSending(true);
                    setSubmitError("");
                    await onMessageSent?.({
                      recipient: selectedRecipient,
                      subject: subject.trim(),
                      categories: isMessageMode
                        ? ["Message"]
                        : selectedCats.map((cat) => cat === "Other" && otherText.trim() ? `Other: ${otherText.trim()}` : cat),
                      body: message.trim(),
                      attachments,
                    });
                    setSubmitted(true);
                  } catch (error) {
                    setSubmitError(error instanceof Error ? error.message : "Unable to send message.");
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={!canSubmit}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition sm:w-auto ${canSubmit ? "bg-violet-600 hover:bg-violet-700" : "cursor-not-allowed bg-violet-300"}`}
              >
                <Send className="h-3.5 w-3.5" /> {sending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function groupByStudentParent(reports: Report[]): ParentGroup[] {
  const map: Record<string, ParentGroup> = {};
  reports.forEach((report) => {
    const displayName = parentDisplayName(report);
    const key = reportGroupKey(report);
    if (!map[key]) {
      map[key] = {
        key,
        displayName,
        profilePicture: report.parent_profile_picture,
        studentName: report.student_name,
        initials: getInitials(displayName),
        reports: [],
        unread: 0,
        maxConcernLevel: 0,
      };
    }
    map[key].reports.push(report);
    // Workflow labels such as "Escalated" are shared state. Only the
    // Principal-specific read receipt may drive this Principal's red badge.
    if (isPrincipalReportUnread(report)) map[key].unread++;
    map[key].maxConcernLevel = Math.max(map[key].maxConcernLevel, report.concernLevel);
  });

  return Object.values(map).map((group) => ({
    ...group,
    reports: [...group.reports].sort(newestReportFirst),
  }));
}

function PrincipalReportsPageContent() {
  const searchParams = useSearchParams();
  const requestedReportId = Number(searchParams.get("reportId"));
  const [guideTarget, setGuideTarget] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("Escalated");
  const [filterTab, setFilterTab] = useState<FilterTab>("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  // Store only a durable selection token. ParentGroup is derived from the
  // latest report snapshot so a poll or realtime update cannot clear the
  // middle column by replacing a stale object.
  const [selectedParentKey, setSelectedParentKey] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [viewStep, setViewStep] = useState<"list" | "reports" | "detail">("list");
  const [reports, setReports] = useState<Report[]>([]);
  const [favoriteReportIds, setFavoriteReportIds] = useState<Set<number>>(new Set());
  const [favoriteSavingReportIds, setFavoriteSavingReportIds] = useState<Set<number>>(new Set());
  const [studentReports, setStudentReports] = useState<PrincipalStudentReport[]>([]);
  const [staffRecipients, setStaffRecipients] = useState<StaffRecipient[]>([]);
  const [parentRecipients, setParentRecipients] = useState<ParentRecipient[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const statusOverridesRef = useRef<Record<number, { status: ReportStatus; at: number }>>({});
  const reportDetailRequestsRef = useRef<Map<number, Promise<void>>>(new Map());
  const favoriteRequestVersionRef = useRef(0);
  const favoriteSaveInFlightRef = useRef<Set<number>>(new Set());
  const reportParentMessagesRequestVersionRef = useRef<Record<number, number>>({});
  // A Realtime message can arrive before the first Reports-message snapshot
  // resolves. Only allow the newest snapshot to replace the selected thread.
  const principalMessagesRequestVersionRef = useRef(0);
  const [principalReplies, setPrincipalReplies] = useState<Record<number, PrincipalReply[]>>({});
  const [reportParentMessages, setReportParentMessages] = useState<Record<number, ResolvedReportParentMessage[]>>({});
  const [loadingReportParentMessageId, setLoadingReportParentMessageId] = useState<number | null>(null);
  const [sendParentMessageReport, setSendParentMessageReport] = useState<Report | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showExportMonitoring, setShowExportMonitoring] = useState(false);
  const [monitoringSearch, setMonitoringSearch] = useState("");
  const [monitoringSourceFilter, setMonitoringSourceFilter] = useState<MonitoringSourceFilter>("All");
  const [monitoringStatusFilter, setMonitoringStatusFilter] = useState<MonitoringStatusFilter>("All");
  const [monitoringCategoryFilter, setMonitoringCategoryFilter] = useState("All");
  const [monitoringStartDate, setMonitoringStartDate] = useState("");
  const [monitoringEndDate, setMonitoringEndDate] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [conversationReply, setConversationReply] = useState("");
  const [conversationReplyAttachments, setConversationReplyAttachments] = useState<File[]>([]);
  const [sendingConversationReply, setSendingConversationReply] = useState(false);
  const conversationMessagesRef = useRef<HTMLDivElement>(null);
  const reportMessagesRef = useRef<HTMLDivElement>(null);
  const openedConversationIdRef = useRef<string | null>(null);
  const reportWasAtBottomRef = useRef(true);
  const lastScrolledReportIdRef = useRef<number | null>(null);
  const openedNotificationReportRef = useRef<number | null>(null);
  const [resolveTargetId, setResolveTargetId] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);

  const escalatedReports = reports.filter((report) => report.escalatedToPrincipal || report.ticketStatus === "accepted");
  // The Principal's report list is a monitoring inbox, not an escalation-only
  // queue. Every report visible to its parent remains available here.
  const currentReports = reports;
  const parentGroups = useMemo(
    () => groupByStudentParent(currentReports)
      .sort((a, b) =>
        Number(groupHasFavorite(b, favoriteReportIds)) - Number(groupHasFavorite(a, favoriteReportIds))
        || newestGroupFirst(a, b))
      .map((group) => ({ ...group, reports: [...group.reports].sort(favoriteFirstReport(favoriteReportIds)) })),
    [currentReports, favoriteReportIds],
  );
  const selectedParent = useMemo(
    () => findSelectedParentGroup(parentGroups, selectedParentKey, selectedReport?.id ?? null) as ParentGroup | null,
    [parentGroups, selectedParentKey, selectedReport?.id]
  );
  const allCategories = Array.from(new Set(currentReports.flatMap((report) => report.categories))).sort();
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const unreadMessageCount = conversations.filter((conversation) => conversation.status === "New Message" || conversation.status === "Unread").length;
  const selectedConversationMessageCount = selectedConversation?.messages.length ?? 0;
  const selectedReportId = selectedReport?.id ?? null;
  const selectedReportReplies = selectedReport ? (principalReplies[selectedReport.id] ?? []) : [];
  const reportTyping = useReportTyping(selectedReportId, "principal");
  const staffConversationTyping = useStaffConversationTyping(
    selectedConversationId?.startsWith("staff-message:") ? selectedConversationId : null,
    "principal",
  );
  const guideHighlight = (target: string) => guideTarget === target
    ? "relative z-[85] rounded-2xl ring-4 ring-violet-400 ring-offset-4 ring-offset-slate-50"
    : "";

  useEffect(() => {
    if (mainTab !== "Messages" || !selectedConversationId) return;
    requestAnimationFrame(() => {
      const el = conversationMessagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [mainTab, selectedConversationId, selectedConversationMessageCount]);

  useEffect(() => {
    if (!selectedReportId) return;
    const shouldFollowLatest = lastScrolledReportIdRef.current !== selectedReportId || reportWasAtBottomRef.current;
    lastScrolledReportIdRef.current = selectedReportId;
    if (!shouldFollowLatest) return;
    requestAnimationFrame(() => {
      const el = reportMessagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [selectedReportId, selectedReportReplies.length]);
  const monitoringEntries = useMemo(
    () => dedupeMonitoringEntries([
      ...reportsToMonitoringEntries(reports),
      ...studentReportsToMonitoringEntries(studentReports),
    ]).sort((a, b) => monitoringEntryTimestamp(b) - monitoringEntryTimestamp(a)),
    [reports, studentReports]
  );
  const monitoringCategories = useMemo(
    () => Array.from(new Set(monitoringEntries.map((entry) => entry.category).filter(Boolean))).sort(),
    [monitoringEntries],
  );
  const filteredMonitoringEntries = useMemo(() => {
    const searchTerm = monitoringSearch.trim().toLowerCase();
    return monitoringEntries.filter((entry) => {
      const entryDate = manilaDateKey(entry.occurredAt);
      if (monitoringSourceFilter !== "All" && entry.from.role !== monitoringSourceFilter) return false;
      if (monitoringStatusFilter !== "All" && entry.status !== monitoringStatusFilter) return false;
      if (monitoringCategoryFilter !== "All" && entry.category !== monitoringCategoryFilter) return false;
      if (monitoringStartDate && (!entryDate || entryDate < monitoringStartDate)) return false;
      if (monitoringEndDate && (!entryDate || entryDate > monitoringEndDate)) return false;
      if (!searchTerm) return true;
      return [
        entry.date,
        entry.from.name,
        entry.from.role,
        entry.to.name,
        entry.to.role,
        entry.student,
        entry.category,
        entry.concern,
        entry.status,
      ].some((value) => value.toLowerCase().includes(searchTerm));
    });
  }, [monitoringEntries, monitoringSearch, monitoringSourceFilter, monitoringStatusFilter, monitoringCategoryFilter, monitoringStartDate, monitoringEndDate]);
  const monitoringTotals = {
    parentReports: filteredMonitoringEntries.filter((entry) => entry.from.role === "Parent").length,
    studentReports: filteredMonitoringEntries.filter((entry) => entry.from.role === "Student").length,
    escalatedToPrincipal: filteredMonitoringEntries.filter((entry) => entry.status === "Escalated to Principal").length,
    escalatedToGuidance: filteredMonitoringEntries.filter((entry) => entry.status === "Escalated to Guidance").length,
    acceptedGuidanceTickets: filteredMonitoringEntries.filter((entry) => entry.status === "Accepted Ticket").length,
  };
  const monitoringCategoryTotals = monitoringCategories.map((name) => ({
    name,
    count: filteredMonitoringEntries.filter((entry) => entry.category === name).length,
  })).filter((category) => category.count > 0);
  const monitoringFilterSummary = [
    monitoringSourceFilter === "All" ? "All sources" : `${monitoringSourceFilter} reports`,
    monitoringStatusFilter === "All" ? "All statuses" : monitoringStatusFilter,
    monitoringCategoryFilter === "All" ? "All categories" : monitoringCategoryFilter,
    monitoringDateRangeLabel(monitoringStartDate, monitoringEndDate),
    monitoringSearch.trim() ? `Search: ${monitoringSearch.trim()}` : null,
  ].filter((value): value is string => Boolean(value)).join(" · ");

  const loadPrincipalReports = useCallback(async () => {
    const [parentRes, studentRes] = await Promise.all([
      fetch("/api/reports/parent-adviser?role=principal&summary=1", { cache: "no-store" }),
      fetch("/api/student-reports?role=principal", { cache: "no-store" }),
    ]);
    const [parentData, studentData] = await Promise.all([
      parentRes.json().catch(() => null),
      studentRes.json().catch(() => null),
    ]);
    if (!parentRes.ok) {
      console.error("Unable to load parent reports:", parentData?.message || parentRes.statusText);
    } else {
      const nextReports = ((parentData?.reports ?? []) as Report[]).map((report) => {
        const override = statusOverridesRef.current[report.id];
        if (!override) return report;
        if (report.status === override.status || Date.now() - override.at > 10_000) {
          delete statusOverridesRef.current[report.id];
          return report;
        }
        // A realtime refresh can arrive before the status PATCH response.
        // Preserve the successful local transition instead of reverting it.
        return { ...report, status: override.status };
      }).sort(newestReportFirst);
      setReports((current) => nextReports.map((report) => {
        const loaded = current.find((item) => item.id === report.id);
        // A live Guidance escalation changes what the Principal is allowed to
        // read. Never retain a previously loaded detail across that boundary.
        return loaded?.detailsLoaded && loaded.conversationAvailable === report.conversationAvailable
          ? { ...report, message: loaded.message, attachments: loaded.attachments, replies: loaded.replies, detailsLoaded: true }
          : report;
      }));
      setPrincipalReplies((current) => Object.fromEntries(nextReports.map((report) => [
        report.id,
        report.conversationAvailable && (current[report.id]?.length ?? 0) > 0
          ? current[report.id]
          : (report.replies ?? []).map((reply) => ({ ...reply, attachments: reply.attachments ?? [] })),
      ])));
      setSelectedReport((current) => {
        if (!current) return current;
        const summary = nextReports.find((report) => report.id === current.id);
        if (!summary) return current;
        return current.detailsLoaded && current.conversationAvailable === summary.conversationAvailable
          ? { ...summary, message: current.message, attachments: current.attachments, replies: current.replies, detailsLoaded: true }
          : summary;
      });
      // The parent-report list is ready even if the optional student feed is
      // still waiting on a separate database request.
      setLoadingReports(false);
    }
    if (!studentRes.ok) {
      // Student reports are an optional feed; keep the dashboard usable when
      // the database/API is temporarily unreachable instead of triggering the
      // Next.js development error overlay.
      console.warn("Student reports are temporarily unavailable:", studentData?.message || studentRes.statusText);
    } else {
      setStudentReports((studentData?.reports ?? []) as PrincipalStudentReport[]);
    }
  }, []);

  const loadFavoriteReportIds = useCallback(async () => {
    const requestVersion = ++favoriteRequestVersionRef.current;
    const res = await fetch("/api/reports/principal/favorites", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (requestVersion !== favoriteRequestVersionRef.current) return;
    if (!res.ok) throw new Error(data?.message || "Unable to load report favorites.");
    setFavoriteReportIds(new Set(
      (data?.reportIds ?? [])
        .map((reportId: unknown) => Number(reportId))
        .filter((reportId: number) => Number.isSafeInteger(reportId) && reportId > 0),
    ));
  }, []);

  const loadReportDetail = useCallback(async (id: number) => {
    const inFlight = reportDetailRequestsRef.current.get(id);
    if (inFlight) return inFlight;

    const request = (async () => {
      const res = await fetch(`/api/reports/parent-adviser?role=principal&reportId=${id}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Unable to load this conversation.");
      const report = (data?.reports?.[0] ?? null) as Report | null;
      if (!report) return;
      setReports((current) => current.map((item) => item.id === id ? report : item));
      setPrincipalReplies((current) => ({
        ...current,
        [id]: (report.replies ?? []).map((reply) => ({ ...reply, attachments: reply.attachments ?? [] })),
      }));
      setSelectedReport((current) => current?.id === id ? report : current);
    })();

    reportDetailRequestsRef.current.set(id, request);
    try {
      await request;
    } finally {
      reportDetailRequestsRef.current.delete(id);
    }
  }, []);

  const loadResolvedReportParentMessages = useCallback(async (reportId: number) => {
    const requestVersion = (reportParentMessagesRequestVersionRef.current[reportId] ?? 0) + 1;
    reportParentMessagesRequestVersionRef.current[reportId] = requestVersion;
    setLoadingReportParentMessageId(reportId);
    try {
      const res = await fetch(`/api/reports/principal/${reportId}/parent-message`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Unable to load Principal messages for this report.");
      if (reportParentMessagesRequestVersionRef.current[reportId] !== requestVersion) return;
      setReportParentMessages((current) => ({
        ...current,
        [reportId]: (data?.messages ?? []) as ResolvedReportParentMessage[],
      }));
    } finally {
      if (reportParentMessagesRequestVersionRef.current[reportId] === requestVersion) {
        setLoadingReportParentMessageId((current) => current === reportId ? null : current);
      }
    }
  }, []);

  const refreshReportDetailAfterInFlight = useCallback(async (id: number) => {
    // The initial detail request can still be running when its first
    // Realtime message arrives. Waiting for that stale snapshot and then
    // starting a fresh request guarantees the new row is not lost until the
    // Principal interacts with the composer or reloads the page.
    const inFlight = reportDetailRequestsRef.current.get(id);
    if (inFlight) {
      try {
        await inFlight;
      } catch {
        // The targeted request below is the authoritative recovery path.
      }
    }
    await loadReportDetail(id);
  }, [loadReportDetail]);

  const loadPrincipalMessages = useCallback(async (preferredConversationId?: string) => {
    const requestVersion = ++principalMessagesRequestVersionRef.current;
    const res = await fetch("/api/reports/principal-messages", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Keep the reports screen usable when the optional messages feed is
      // temporarily unavailable (for example during a backend timeout).
      // This is recoverable and should not trigger Next's console error overlay.
      console.warn("Principal messages are temporarily unavailable:", data?.message || res.statusText);
      return;
    }
    // An older initial fetch must never erase a row loaded after a message
    // invalidation; otherwise an idle Principal would only see it after a
    // manual refresh or a reply.
    if (requestVersion !== principalMessagesRequestVersionRef.current) return;
    setStaffRecipients((data?.staff ?? []) as StaffRecipient[]);
    setParentRecipients((data?.parents ?? []) as ParentRecipient[]);
    // Parent-report conversations belong in Escalated Reports, while the
    // dedicated Contact ICT page owns all Principal–ICT conversations.
    const nextConversations = sortByLatestActivity(
      ((data?.inbox ?? []) as Conversation[]).filter(
        (conversation) =>
          !conversation.id.startsWith("parent-report:") &&
          conversation.sender.role !== "ICT",
      ),
    );
    setConversations(nextConversations);
    setSelectedConversationId((current) => {
      const requested = preferredConversationId ?? current;
      return requested && nextConversations.some((conversation) => conversation.id === requested)
        ? requested
        : nextConversations[0]?.id ?? null
    });
  }, []);

  const sendResolvedReportParentMessage = useCallback(async (
    report: Report,
    message: string,
    attachments: MessageAttachment[],
  ) => {
    const res = await fetch(`/api/reports/principal/${report.id}/parent-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, attachments }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || "Unable to send the Principal message to the Parent.");

    const created = data?.message as ResolvedReportParentMessage | undefined;
    if (created?.id) {
      setReportParentMessages((current) => ({
        ...current,
        [report.id]: [...(current[report.id] ?? []).filter((entry) => entry.id !== created.id), created],
      }));
    }
    // The normal Principal inbox also receives this staff-message event, but
    // updating it now makes the sender's screen coherent before Realtime
    // reaches the current browser.
    void loadPrincipalMessages();
  }, [loadPrincipalMessages]);

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      try {
        setLoadingReports(true);
        await Promise.all([loadPrincipalReports(), loadFavoriteReportIds(), loadPrincipalMessages()]);
      } finally {
        if (mounted) setLoadingReports(false);
      }
    }
    loadInitial().catch((error) => {
      console.error("Unable to load principal reports:", error);
      if (mounted) setLoadingReports(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadFavoriteReportIds, loadPrincipalMessages, loadPrincipalReports]);

  const handleLiveReportUpdate = useCallback(async (event: Parameters<typeof reportTyping.onRealtimeEvent>[0]) => {
    reportTyping.onRealtimeEvent(event);
    if (event.kind === "typing") return;
    // The list refresh updates monitoring/status badges. The detailed fetch is
    // limited to the selected report, keeping this conversation mounted.
    await Promise.all([
      loadPrincipalReports(),
      event.reportId !== null && event.reportId === selectedReportId
        ? refreshReportDetailAfterInFlight(event.reportId)
        : Promise.resolve(),
    ]);
  }, [loadPrincipalReports, refreshReportDetailAfterInFlight, reportTyping, selectedReportId]);

  const refreshPrincipalInbox = useCallback(async () => {
    await Promise.all([
      loadPrincipalReports(),
      loadPrincipalMessages(),
      canSendResolvedReportParentMessage(selectedReport)
        ? loadResolvedReportParentMessages(selectedReport!.id)
        : Promise.resolve(),
    ]);
  }, [loadPrincipalMessages, loadPrincipalReports, loadResolvedReportParentMessages, selectedReport]);

  const handleLiveStaffMessageUpdate = useCallback(async (event: Parameters<typeof staffConversationTyping.onRealtimeEvent>[0]) => {
    staffConversationTyping.onRealtimeEvent(event);
    if (event.kind === "typing") return;
    // This source has already excluded Contact ICT rows. Fetch it straight
    // away so a staff New Message or reply appears in the open Reports panel.
    // A report-linked Principal follow-up also reloads its separate panel
    // without opening or altering the resolved report conversation.
    await Promise.all([
      loadPrincipalMessages(),
      event.reportId && selectedReport?.id === event.reportId && canSendResolvedReportParentMessage(selectedReport)
        ? loadResolvedReportParentMessages(event.reportId)
        : Promise.resolve(),
    ]);
  }, [loadPrincipalMessages, loadResolvedReportParentMessages, selectedReport, staffConversationTyping]);

  const liveUpdateNotice = useReportMessagesRealtime(refreshPrincipalInbox, {
    onReportUpdate: handleLiveReportUpdate,
    onStaffMessageUpdate: handleLiveStaffMessageUpdate,
    // Student concerns share the Principal monitoring panel but are a
    // different protected endpoint from parent-report conversations.
    onStudentReportUpdate: loadPrincipalReports,
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
    if (!selectedReport || selectedReport.detailsLoaded) return;
    void loadReportDetail(selectedReport.id).catch((error) => {
      setReplyError(error instanceof Error ? error.message : "Unable to load this conversation.");
    });
  }, [selectedReport, loadReportDetail]);

  useEffect(() => {
    const report = selectedReport;
    if (!report || !canSendResolvedReportParentMessage(report)) return;
    void loadResolvedReportParentMessages(report.id).catch((error) => {
      console.warn("Unable to load separate Principal messages for this report:", error);
    });
  }, [loadResolvedReportParentMessages, selectedReport]);

  useEffect(() => {
    if (!Number.isSafeInteger(requestedReportId) || openedNotificationReportRef.current === requestedReportId) return;
    const report = reports.find((item) => item.id === requestedReportId);
    if (!report) return;
    const parent = groupByStudentParent(reports).find((group) => group.reports.some((item) => item.id === report.id));
    if (!parent) return;

    openedNotificationReportRef.current = requestedReportId;
    setMainTab("Escalated");
    setSelectedParentKey(parent.key);
    setSelectedReport(report);
    setReplyText("");
    setReplyAttachments([]);
    setViewStep("detail");
    // Opening either a read-only monitoring report or an escalated
    // conversation acknowledges it for this Principal only.
    if (isPrincipalReportUnread(report)) markReportStatus(report.id, "Read").catch(() => null);
  }, [reports, requestedReportId]);


  const filteredGroups = (() => {
    const term = search.trim().toLowerCase();
    return groupByStudentParent(currentReports)
      .filter((group) => {
        if (term && ![group.displayName, group.studentName, ...group.reports.map((report) => report.subject)].some((value) => value.toLowerCase().includes(term))) return false;
        if (filterTab === "Pending" && !group.reports.some((report) => report.status === "New" || report.status === "Read")) return false;
        if (filterTab === "Ongoing" && !group.reports.some((report) => report.status === "Ongoing")) return false;
        if (filterTab === "Escalated" && !group.reports.some((report) => report.escalatedToPrincipal)) return false;
        if (filterTab === "Resolved" && !group.reports.some((report) => report.status === "Resolved")) return false;
        if (categoryFilter !== "All" && !group.reports.some((report) => report.categories.includes(categoryFilter))) return false;
        return true;
      })
      .sort((a, b) =>
        Number(groupHasFavorite(b, favoriteReportIds)) - Number(groupHasFavorite(a, favoriteReportIds))
        || newestGroupFirst(a, b))
      .map((group) => ({ ...group, reports: [...group.reports].sort(favoriteFirstReport(favoriteReportIds)) }));
  })();

  const showReportsPanel = isReportsPanelVisible(viewStep, Boolean(selectedParent), true);
  const showReportsPanelOnMobile = isReportsPanelVisible(viewStep, Boolean(selectedParent), false);
  const { position: detailPosition, width: detailWidth } = detailPanelLayout(Boolean(selectedParent));

  function panelClass(visible: boolean, bg: string, width: string, position = "left-0", mobileVisible = visible) {
    const desktopPosition = position === "left-[420px]"
      ? "md:left-[420px]"
      : position === "left-[300px]" ? "md:left-[300px]" : "md:left-0";
    const desktopWidth = width === "right-0 w-auto"
      ? "md:right-0 md:w-auto"
      : width.includes("max-w-[860px]")
        ? "md:w-full md:max-w-[860px]"
        : width.includes("max-w-[300px]")
          ? "md:w-full md:max-w-[300px]"
        : "md:w-full md:max-w-[420px]";

    return `relative h-full w-full max-w-none flex-col overflow-hidden ${bg} ${mobileVisible ? "flex" : "hidden"} md:absolute md:inset-y-0 ${desktopPosition} ${desktopWidth} md:flex md:border-r md:border-slate-100 md:shadow-sm md:transition-all md:duration-200 md:ease-out ${visible ? "md:opacity-100 md:translate-y-0 md:scale-100 md:pointer-events-auto" : "md:opacity-0 md:translate-y-2 md:scale-[0.99] md:pointer-events-none"
      }`;
  }

  async function toggleReportFavorite(reportId: number) {
    if (favoriteSaveInFlightRef.current.has(reportId)) return;

    const wasFavorite = favoriteReportIds.has(reportId);
    const mutationVersion = ++favoriteRequestVersionRef.current;
    favoriteSaveInFlightRef.current.add(reportId);
    setFavoriteSavingReportIds((current) => new Set(current).add(reportId));
    setFavoriteReportIds((current) => {
      const next = new Set(current);
      if (wasFavorite) next.delete(reportId);
      else next.add(reportId);
      return next;
    });

    try {
      const res = await fetch("/api/reports/principal/favorites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, favorite: !wasFavorite }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || "Unable to save report favorite.");
    } catch (error) {
      console.error("Unable to save principal report favorite:", error);
      if (mutationVersion === favoriteRequestVersionRef.current) {
        setFavoriteReportIds((current) => {
          const next = new Set(current);
          if (wasFavorite) next.add(reportId);
          else next.delete(reportId);
          return next;
        });
      }
    } finally {
      favoriteSaveInFlightRef.current.delete(reportId);
      setFavoriteSavingReportIds((current) => {
        const next = new Set(current);
        next.delete(reportId);
        return next;
      });
    }
  }

  async function markReportStatus(id: number, status: ReportStatus) {
    const isReadReceipt = status === "Read";
    if (isReadReceipt) {
      // Clear Panel 1 immediately. The API persists the receipt and restores
      // the server state if the write fails.
      setReports((prev) => prev.map((report) => report.id === id ? markPrincipalReportRead(report) : report));
      setSelectedReport((prev) => prev?.id === id ? markPrincipalReportRead(prev) : prev);
    } else {
      statusOverridesRef.current[id] = { status, at: Date.now() };
      setReports((prev) => prev.map((report) => report.id === id ? { ...report, status } : report));
      setSelectedReport((prev) => prev?.id === id ? { ...prev, status } : prev);
    }

    try {
      const res = await fetch(`/api/reports/principal/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Unable to update principal report status:", data?.message || res.statusText);
        if (!isReadReceipt) delete statusOverridesRef.current[id];
        await loadPrincipalReports().catch(() => null);
        return false;
      }
      if (data?.report) {
        const updated = data.report as Report;
        setReports((prev) => prev.map((report) => report.id === id ? updated : report));
        setSelectedReport((prev) => prev?.id === id ? updated : prev);
        setPrincipalReplies((prev) => ({
          ...prev,
          [id]: (updated.replies ?? []).map((reply) => ({ ...reply, attachments: reply.attachments ?? [] })),
        }));
      }
      if (status === "Resolved") await loadPrincipalReports();
      return true;
    } catch (error) {
      console.error("Unable to update principal report status:", error);
      if (!isReadReceipt) delete statusOverridesRef.current[id];
      await loadPrincipalReports().catch(() => null);
      return false;
    }
  }

  async function confirmResolve() {
    if (resolveTargetId === null || resolving) return;
    setResolving(true);
    try {
      if (await markReportStatus(resolveTargetId, "Resolved")) setResolveTargetId(null);
    } finally {
      setResolving(false);
    }
  }

  function selectParent(group: ParentGroup) {
    setSelectedParentKey(group.key);
    setSelectedReport(null);
    setReplyText("");
    setReplyAttachments([]);
    setViewStep("reports");
  }

  function selectReport(report: Report) {
    setSelectedReport(report);
    setReplyText("");
    setReplyAttachments([]);
    setReplyError(null);
    setViewStep("detail");
    void loadReportDetail(report.id).catch((error) => {
      setReplyError(error instanceof Error ? error.message : "Unable to load this conversation.");
    });
    if (isPrincipalReportUnread(report)) markReportStatus(report.id, "Read").catch(() => null);
  }

  useEffect(() => {
    if (viewStep !== "detail" || !selectedReport || !isPrincipalReportUnread(selectedReport)) return;
    void markReportStatus(selectedReport.id, "Read");
  }, [selectedReport?.id, selectedReport?.hasUnreadForPrincipal, viewStep]);

  async function sendReply() {
    if (sendingReply || !selectedReport || selectedReport.status === "Resolved" || !selectedReport.canReply) return;
    const message = replyText.trim();
    if (!message && replyAttachments.length === 0) return;

    setSendingReply(true);
    setReplyError(null);
    try {
      const validFiles = replyAttachments.filter(f => f.size <= MAX_ATTACHMENT_BYTES);
      const cleanedAttachments = await filesToAttachments(validFiles);
      const reportId = selectedReport.id;
      const res = await fetch(`/api/reports/parent-adviser/${reportId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          body: message,
          role: "principal",
          threadType: "principal",
          attachments: cleanedAttachments,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Reply failed.");
      }
      const latestActivityAt = new Date().toISOString();
      setReports((current) => current.map((report) => report.id === reportId
        ? { ...report, lastActivityAt: latestActivityAt }
        : report).sort(newestReportFirst));
      setSelectedReport((current) => current?.id === reportId
        ? { ...current, lastActivityAt: latestActivityAt }
        : current);
      setReplyText("");
      setReplyAttachments([]);
      reportTyping.stopTyping();
      // Do not keep the reply interaction pending just because the
      // authoritative report refresh has not completed yet.
      void Promise.all([loadPrincipalReports(), loadReportDetail(reportId)]).catch((refreshError) => {
        console.warn("Unable to refresh the principal report after replying:", refreshError);
      });
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Your reply could not be sent. Please try again.");
    } finally {
      setSendingReply(false);
    }
  }

  function switchMainTab(tab: MainTab) {
    setMainTab(tab);
    setSelectedParentKey(null);
    setSelectedReport(null);
    setViewStep("list");
    setFilterTab("All");
    setCategoryFilter("All");
    setReplyText("");
    setReplyAttachments([]);
    setConversationReply("");
    setConversationReplyAttachments([]);
    setMobileConversationOpen(false);
    if (tab === "Messages" && !selectedConversationId) setSelectedConversationId(conversations[0]?.id ?? null);
  }

  async function markConversationRead(conversationId: string) {
    const isStandaloneStaffConversation = conversationId.startsWith("staff-message:");
    const res = await fetch(isStandaloneStaffConversation ? "/api/reports/staff-messages" : "/api/reports/principal-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isStandaloneStaffConversation
        ? { role: "principal", conversationId, status: "read" }
        : { conversationId, status: "read" }),
    });
    if (!res.ok) throw new Error("Unable to mark message as read.");
  }

  function selectConversation(conversation: Conversation) {
    openedConversationIdRef.current = conversation.id;
    setSelectedConversationId(conversation.id);
    setMobileConversationOpen(true);
    setConversationReply("");
    setConversationReplyAttachments([]);
    if (conversation.status === "New Message" || conversation.status === "Unread") {
      setConversations((prev) => prev.map((item) => item.id === conversation.id ? { ...item, status: "Read" } : item));
      markConversationRead(conversation.id).catch((error) => {
        console.error(error);
        loadPrincipalMessages().catch(() => null);
      });
    }
  }

  useEffect(() => {
    if (
      mainTab !== "Messages"
      || !selectedConversation
      || openedConversationIdRef.current !== selectedConversation.id
      || (selectedConversation.status !== "New Message" && selectedConversation.status !== "Unread")
    ) return;
    setConversations((prev) => prev.map((item) => item.id === selectedConversation.id ? { ...item, status: "Read" } : item));
    markConversationRead(selectedConversation.id).catch((error) => {
      console.error(error);
      loadPrincipalMessages().catch(() => null);
    });
  }, [mainTab, selectedConversation?.id, selectedConversation?.status]);

  async function sendConversationReply() {
    const body = conversationReply.trim();
    if (sendingConversationReply || !selectedConversation || (!body && conversationReplyAttachments.length === 0)) return;

    const pendingFiles = conversationReplyAttachments;
    const validFiles = pendingFiles.filter(f => f.size <= MAX_ATTACHMENT_BYTES);
    const cleanedAttachments = await filesToAttachments(validFiles);
    const categories = selectedConversation.category.split(",").map((c) => c.trim()).filter(Boolean);
    const optimisticTimestamp = formatManilaTimestamp(new Date());

    // Render immediately, then replace the temporary timestamp with the
    // stored server timestamp below. This keeps the panel responsive without
    // treating a standalone message as a report reply.
    const optimisticMsg = {
      id: `principal-${Date.now()}`,
      sender: "principal" as const,
      body,
      sentAt: optimisticTimestamp,
      attachments: cleanedAttachments,
    };
    setConversations((prev) => sortByLatestActivity(prev.map((conv) =>
      conv.id !== selectedConversation.id ? conv : {
        ...conv,
        status: "Sent" as const,
        lastMessageAt: optimisticTimestamp,
        messages: [...conv.messages, optimisticMsg],
      }
    )));
    setConversationReply("");
    setConversationReplyAttachments([]);
    setSendingConversationReply(true);

    try {
      const isStandaloneStaffConversation = selectedConversation.id.startsWith("staff-message:");
      const res = await fetch(isStandaloneStaffConversation ? "/api/reports/staff-messages" : "/api/reports/principal-messages", {
        method: isStandaloneStaffConversation ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isStandaloneStaffConversation ? {
          role: "principal",
          conversationId: selectedConversation.id,
          status: "replied",
          reply: body,
          attachments: cleanedAttachments,
        } : {
          recipientId: selectedConversation.sender.id,
          conversationId: selectedConversation.id,
          subject: selectedConversation.subject,
          categories: categories.length > 0 ? categories : ["General Inquiry"],
          message: body,
          attachments: cleanedAttachments,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Send failed:", data?.message);
        setConversationReply(body);
        setConversationReplyAttachments(pendingFiles);
        await loadPrincipalMessages();
        return;
      }
      if (isStandaloneStaffConversation) staffConversationTyping.stopTyping();
      // This is an in-place inbox refresh, not a page refresh. It replaces
      // the optimistic timestamp with the saved timestamp and also covers a
      // browser that missed its own Broadcast while reconnecting.
      await loadPrincipalMessages();
    } catch (error) {
      console.error("Send error:", error);
      setConversationReply(body);
      setConversationReplyAttachments(pendingFiles);
      await loadPrincipalMessages();
    } finally {
      setSendingConversationReply(false);
    }
  }

  async function handleNewMessageSent(payload: NewMessagePayload) {
    const res = await fetch("/api/reports/staff-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "principal",
        recipientId: payload.recipient.id,
        subject: payload.subject,
        message: payload.body,
        attachments: payload.attachments,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || "Unable to send message.");

    setMainTab("Messages");
    const conversationId = data?.message?.id ? `staff-message:${data.message.id}` : undefined;
    if (conversationId) setSelectedConversationId(conversationId);
    // Update only the Message Panel, then render the stored record and its
    // server-generated Asia/Manila timestamp. Parent Reports receives the
    // matching Realtime invalidation from the same committed write.
    await loadPrincipalMessages(conversationId);
  }

  function renderTopTabs(mobile = false) {
    return (
      <div
        data-parent-guide="principal-reports-tabs"
        className={`${mobile ? "flex items-center gap-1 overflow-x-auto px-3 py-2" : "hidden flex-col gap-2 px-3 pb-2 pt-4 md:flex"} ${guideHighlight("principal-reports-tabs")}`}
      >
        <button
          onClick={() => switchMainTab("Escalated")}
          className={`flex shrink-0 items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mainTab === "Escalated" ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="flex items-center gap-2.5"><Shield className="h-4 w-4" /> Parent Reports</span>
          {escalatedReports.filter(r => r.status === "Escalated" || r.status === "New").length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-extrabold ${mainTab === "Escalated" ? "bg-violet-600 text-white" : "bg-red-500 text-white"}`}>
              {escalatedReports.filter(r => r.status === "Escalated" || r.status === "New").length}
            </span>
          )}
        </button>
        <button
          onClick={() => switchMainTab("Monitoring")}
          className={`flex shrink-0 items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mainTab === "Monitoring" ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="flex items-center gap-2.5"><Eye className="h-4 w-4" /> Report Monitoring</span>
        </button>
        <button
          onClick={() => switchMainTab("Messages")}
          className={`flex shrink-0 items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mainTab === "Messages" ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="flex items-center gap-2.5"><MessageSquare className="h-4 w-4" /> Messages</span>
          {unreadMessageCount > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-extrabold ${mainTab === "Messages" ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-600"}`}>{unreadMessageCount}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 font-sans">
      {liveUpdateNotice && <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 sm:px-6">{liveUpdateNotice}</div>}
      <div className="flex shrink-0 flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-0.5 text-xs text-slate-400">Monitor parent concerns and reports escalated to the principal</p>
        </div>
        <div
          data-parent-guide="principal-reports-new-message"
          className={`flex flex-wrap items-center gap-2 ${guideHighlight("principal-reports-new-message")}`}
        >
          <span className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700">
            {escalatedReports.length} Escalated
          </span>
          <span className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-extrabold text-sky-700">
            {reports.filter((report) => report.status !== "Resolved").length} Active
          </span>
          <button
            onClick={() => setShowNewMessage(true)}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700"
          >
            <MessageSquare className="h-3.5 w-3.5" /> New Message
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-slate-100 bg-white md:hidden">
        {renderTopTabs(true)}
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full min-w-0 w-full">
          {mainTab === "Messages" ? (
            <div className="grid h-full min-w-0 grid-cols-1 md:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
              <div className={`${mobileConversationOpen ? "hidden" : "flex"} h-full min-w-0 flex-col overflow-hidden bg-white md:flex md:border-r md:border-slate-100 md:shadow-sm`}>
                {renderTopTabs()}
                <div className="mx-3 h-px bg-slate-100" />
                <div className="px-4 py-4">
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-violet-700">School Messages</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">Direct conversations with parents and school staff.</p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-4">
                  {conversations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center">
                      <MessageSquare className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                      <p className="text-xs font-bold text-slate-500">No messages yet.</p>
                    </div>
                  ) : conversations.map((conversation) => {
                    const isActive = selectedConversation?.id === conversation.id;
                    const latestMessage = conversation.messages[conversation.messages.length - 1];
                    const latestSenderName = latestMessage?.sender === "principal" ? "You" : conversation.sender.name;
                    const latestSenderRole = latestMessage?.sender === "principal" ? "Principal" : conversation.sender.role;
                    return (
                      <button
                        key={conversation.id}
                        onClick={() => selectConversation(conversation)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${isActive ? "border-violet-200 bg-violet-50" : conversation.status === "New Message" || conversation.status === "Unread" ? "border-violet-100 bg-white shadow-sm shadow-violet-100/60 hover:bg-violet-50/60" : "border-slate-100 bg-white hover:bg-slate-50"}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <ConversationAvatar sender={conversation.sender} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-extrabold text-slate-900">{conversation.sender.name}</p>
                                <p className="truncate text-[11px] font-semibold text-slate-400">
                                  {conversation.sender.role}{conversation.sender.student ? ` · ${conversation.sender.student}` : ""}
                                </p>
                              </div>
                              {conversation.status && (
                                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${conversationStatusClass(conversation.status)}`}>{conversation.status === "Unread" ? "New Message" : conversation.status}</span>
                              )}
                            </div>
                            <p className="mt-2 truncate text-sm font-extrabold leading-snug text-slate-800">{conversation.subject}</p>
                            <p className="mt-1 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-500">
                              <span className="font-bold text-slate-600">{latestSenderName} · {latestSenderRole}:</span>{" "}
                              {latestMessage?.body || (latestMessage?.attachments?.length ? "Attachment" : "No message content")}
                            </p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{conversation.category}</span>
                              <span className="text-[10px] font-semibold text-slate-400">{conversation.lastMessageAt}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`${mobileConversationOpen ? "flex" : "hidden"} h-full min-w-0 w-full flex-col overflow-hidden bg-slate-50 md:flex`}>
                {selectedConversation ? (
                  <>
                    <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <button
                            type="button"
                            onClick={() => setMobileConversationOpen(false)}
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-violet-50 hover:text-violet-600 md:hidden"
                            aria-label="Back to messages"
                          >
                            <ChevronRight className="h-4 w-4 rotate-180" />
                          </button>
                          <ConversationAvatar sender={selectedConversation.sender} />
                          <div className="min-w-0">
                            <h2 className="truncate text-base font-extrabold leading-snug text-slate-900">{selectedConversation.subject}</h2>
                            <p className="mt-1 text-sm font-bold text-slate-600">
                              {selectedConversation.sender.name} · {selectedConversation.sender.role}
                            </p>
                            {selectedConversation.sender.gradeSection && (
                              <p className="mt-0.5 text-xs font-medium text-slate-400">{selectedConversation.sender.student} · {selectedConversation.sender.gradeSection}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div ref={conversationMessagesRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                      {selectedConversation.messages.map((message) => {
                        const mine = message.sender === "principal";
                        return (
                          <div key={message.id} className={`mb-4 flex items-start gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                            {mine ? (
                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-extrabold text-white">Me</div>
                            ) : (
                              <ConversationAvatar sender={selectedConversation.sender} />
                            )}
                            <div className={`flex min-w-0 flex-1 flex-col ${mine ? "items-end" : "items-start"}`}>
                              <div className="mb-1 flex items-center gap-2">
                                <p className="text-xs font-bold text-slate-800">{mine ? "You" : selectedConversation.sender.name}</p>
                                <span className="text-[10px] text-slate-400">{message.sentAt}</span>
                              </div>
                              <div className={`max-w-[78%] min-w-0 break-words rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${mine ? "rounded-tr-none bg-violet-600 text-white" : "rounded-tl-none border border-slate-100 bg-white text-slate-700"}`}>
                                {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                                {!!message.attachments?.length && (
                                  <div className="[&>div]:max-w-none">
                                    <AttachmentChips attachments={message.attachments} mine={mine} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="shrink-0 min-w-0 border-t border-slate-100 bg-white px-4 py-4 sm:px-6">
                      {staffConversationTyping.isOtherParticipantTyping && (
                        <div aria-live="polite" aria-label="The other participant is typing…" className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span className="flex gap-1" aria-hidden="true"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" /></span>
                          The other participant is typing…
                        </div>
                      )}
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {conversationReplyAttachments.map((file, index) => (
                          <div key={`${file.name}-${index}`} className="relative flex h-11 max-w-[150px] items-center gap-2 rounded-xl bg-white px-3 pr-7 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            <span className="truncate">{file.name}</span>
                            <button
                              type="button"
                              onClick={() => setConversationReplyAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-white transition hover:bg-red-500"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end sm:gap-3">
                        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                          <textarea
                            value={conversationReply}
                            onChange={(event) => { setConversationReply(event.target.value); staffConversationTyping.onDraftChange(Boolean(event.target.value.trim())); }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                sendConversationReply();
                              }
                            }}
                            placeholder={`Reply to ${selectedConversation.sender.name}...`}
                            rows={2}
                            className="min-h-[52px] min-w-0 w-full resize-none bg-transparent px-3.5 pb-2 pt-2.5 text-sm text-slate-700 outline-none"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2 sm:contents">
                        <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100">
                          <Paperclip className="h-4 w-4" />
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            className="absolute inset-0 cursor-pointer opacity-0"
                            onChange={(event) => {
                              const captured = Array.from(event.target.files ?? []);
                              event.target.value = "";
                              const valid = captured.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
                              if (valid.length > 0) {
                                setConversationReplyAttachments((prev) => [...prev, ...valid].slice(0, 5));
                              }
                            }}
                          />
                        </label>
                        <button
                          onClick={sendConversationReply}
                            disabled={sendingConversationReply || (!conversationReply.trim() && conversationReplyAttachments.length === 0)}
                            aria-label="Send message"
                            className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl transition ${!sendingConversationReply && (conversationReply.trim() || conversationReplyAttachments.length > 0) ? "bg-violet-600 text-white hover:bg-violet-700" : "cursor-not-allowed bg-slate-100 text-slate-300"}`}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
                    <MessageSquare className="h-10 w-10 opacity-30" />
                    <p className="text-sm font-semibold">Select a message to read</p>
                  </div>
                )}
              </div>
            </div>
          ) : mainTab === "Monitoring" ? (
            <div className="grid h-full min-w-0 grid-cols-1 md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
              <aside className="hidden min-w-0 flex-col overflow-hidden border-r border-slate-100 bg-white shadow-sm md:flex">
                {renderTopTabs()}
                <div className="mx-3 h-px bg-slate-100" />
                <div className="px-4 py-4">
                  <p className="text-sm font-extrabold text-slate-800">Report Monitoring</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Review report flow, current status, and escalation activity across the school.
                  </p>
                </div>
              </aside>

              <div className="min-w-0 overflow-y-auto bg-slate-50 p-3 sm:p-4 md:p-6">
                <section className="min-h-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 sm:p-5 md:min-h-[690px] md:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-lg font-extrabold text-slate-900">Report Monitoring</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        Showing {filteredMonitoringEntries.length} of {monitoringEntries.length} report{monitoringEntries.length === 1 ? "" : "s"}.
                      </p>
                    </div>
                    <div className="flex">
                      <button
                        onClick={() => setShowExportMonitoring(true)}
                        disabled={filteredMonitoringEntries.length === 0}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300 sm:w-auto"
                      >
                        <FileDown className="h-4 w-4" /> Export
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 border-y border-slate-100 py-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="relative sm:col-span-2 lg:col-span-3">
                      <span className="sr-only">Search monitoring reports</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={monitoringSearch}
                        onChange={(event) => setMonitoringSearch(event.target.value)}
                        placeholder="Search reports"
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Source</span>
                      <select value={monitoringSourceFilter} onChange={(event) => setMonitoringSourceFilter(event.target.value as MonitoringSourceFilter)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
                        <option value="All">All sources</option>
                        <option value="Parent">Parents</option>
                        <option value="Student">Students</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Status</span>
                      <select value={monitoringStatusFilter} onChange={(event) => setMonitoringStatusFilter(event.target.value as MonitoringStatusFilter)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
                        <option value="All">All statuses</option>
                        {MONITORING_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Category</span>
                      <select value={monitoringCategoryFilter} onChange={(event) => setMonitoringCategoryFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
                        <option value="All">All categories</option>
                        {monitoringCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">From date</span>
                      <input
                        type="date"
                        value={monitoringStartDate}
                        max={monitoringEndDate || undefined}
                        onChange={(event) => {
                          const nextStart = event.target.value;
                          setMonitoringStartDate(nextStart);
                          if (monitoringEndDate && nextStart && nextStart > monitoringEndDate) setMonitoringEndDate(nextStart);
                        }}
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Through date</span>
                      <input
                        type="date"
                        value={monitoringEndDate}
                        min={monitoringStartDate || undefined}
                        onChange={(event) => setMonitoringEndDate(event.target.value)}
                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                      />
                    </label>
                    {(monitoringSearch || monitoringSourceFilter !== "All" || monitoringStatusFilter !== "All" || monitoringCategoryFilter !== "All" || monitoringStartDate || monitoringEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setMonitoringSearch("");
                          setMonitoringSourceFilter("All");
                          setMonitoringStatusFilter("All");
                          setMonitoringCategoryFilter("All");
                          setMonitoringStartDate("");
                          setMonitoringEndDate("");
                        }}
                        className="flex min-h-11 items-center justify-center gap-1.5 self-end rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 lg:col-span-3"
                      >
                        <X className="h-3.5 w-3.5" /> Clear filters
                      </button>
                    )}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
                    {[
                      { label: "Parent reports", value: monitoringTotals.parentReports },
                      { label: "Student reports", value: monitoringTotals.studentReports },
                      { label: "To principal", value: monitoringTotals.escalatedToPrincipal },
                      { label: "To guidance", value: monitoringTotals.escalatedToGuidance },
                      { label: "Accepted tickets", value: monitoringTotals.acceptedGuidanceTickets },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{item.label}</p>
                        <p className="mt-1 text-2xl font-extrabold text-slate-800">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {monitoringCategoryTotals.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Categories</span>
                      {monitoringCategoryTotals.map((category) => (
                        <span key={category.name} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {category.name} ({category.count})
                        </span>
                      ))}
                    </div>
                  )}

                  {filteredMonitoringEntries.length > 0 && (
                    <div className="mt-5 space-y-3 md:hidden">
                      {filteredMonitoringEntries.map((entry) => (
                        <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-slate-800">{entry.concern}</p>
                              <p className="mt-1 text-xs font-medium text-slate-400">{entry.date}</p>
                            </div>
                            <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold capitalize ${monitoringPriorityClass(entry.priority)}`}>{entry.priority}</span>
                          </div>
                          <p className="mt-3 text-xs font-semibold text-slate-600">{entry.student}</p>
                          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">From</p>
                              <p className="mt-0.5 truncate font-semibold text-slate-700">{entry.from.name}</p>
                              <p className="text-slate-400">{entry.from.role}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">To</p>
                              <p className="mt-0.5 truncate font-semibold text-slate-700">{entry.to.name}</p>
                              <p className="text-slate-400">{entry.to.role}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{entry.category}</span>
                            <span className={`rounded-lg px-2 py-1 text-[10px] font-extrabold ${monitoringStatusClass(entry.status)}`}>{entry.status}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {filteredMonitoringEntries.length === 0 && (
                    <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center md:hidden">
                      <Eye className="h-9 w-9 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-500">No reports match these filters.</p>
                      <p className="text-xs text-slate-400">Try clearing a filter or changing your search.</p>
                    </div>
                  )}

                  <div className="mt-5 hidden max-w-full overflow-x-auto rounded-xl border border-slate-200 md:block">
                    {filteredMonitoringEntries.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
                        <Eye className="h-9 w-9 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-500">No reports match these filters.</p>
                        <p className="text-xs text-slate-400">Try clearing a filter or changing your search.</p>
                      </div>
                    ) : (
                      <table className="w-full min-w-[960px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            {["Date", "From → To", "Student", "Concern", "Category", "Priority", "Status"].map((h) => (
                              <th key={h} className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredMonitoringEntries.map((entry) => (
                            <tr key={entry.id} className="transition-colors hover:bg-violet-50/40">
                              {/* Date */}
                              <td className="px-4 py-4 align-middle">
                                <p className="whitespace-nowrap text-xs font-bold text-slate-700">{entry.date}</p>
                              </td>

                              {/* From → To — single compact inline row */}
                              <td className="px-4 py-4 align-middle">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* From */}
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[9px] font-extrabold text-violet-700">
                                      {entry.from.initials}
                                    </div>
                                    <div>
                                      <p className="whitespace-nowrap text-[11px] font-bold text-slate-800">{entry.from.name}</p>
                                      <p className="text-[10px] text-slate-400">{entry.from.role}</p>
                                    </div>
                                  </div>
                                  {/* Arrow */}
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                  {/* To */}
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-extrabold text-slate-500">
                                      {entry.to.initials}
                                    </div>
                                    <div>
                                      <p className="whitespace-nowrap text-[11px] font-bold text-slate-700">{entry.to.name}</p>
                                      <p className="text-[10px] text-slate-400">{entry.to.role}</p>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Student */}
                              <td className="px-4 py-4 align-middle">
                                <p className="whitespace-nowrap text-xs font-semibold text-slate-700">{entry.student}</p>
                              </td>

                              <td className="px-4 py-4 align-middle">
                                <p className="max-w-[230px] text-xs leading-5 text-slate-600">{entry.concern}</p>
                              </td>

                              {/* Category */}
                              <td className="px-4 py-4 align-middle">
                                <span className="inline-block whitespace-nowrap rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                                  {entry.category}
                                </span>
                              </td>

                              {/* Priority */}
                              <td className="px-4 py-4 align-middle">
                                <span className={`inline-block whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-extrabold capitalize ${monitoringPriorityClass(entry.priority)}`}>
                                  {entry.priority}
                                </span>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-4 align-middle">
                                <span className={`inline-block whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold ${monitoringStatusClass(entry.status)}`}>
                                  {entry.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>


                </section>
              </div>

            </div>
          ) : (
            <>
              <div className={panelClass(viewStep === "list", "bg-white", "w-full max-w-[420px]")}>
                {renderTopTabs()}

                <div className="mx-3 h-px bg-slate-100" />

                <div
                  data-parent-guide="principal-reports-filters"
                  className={`space-y-2 px-3 py-3 ${guideHighlight("principal-reports-filters")}`}
                >
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search parent, student, or subject..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(["All", "Pending", "Ongoing", "Escalated", "Resolved"] as FilterTab[]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setFilterTab(filter)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${filterTab === filter ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-7 text-xs font-semibold text-slate-600 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                    >
                      <option value="All">All Categories ({currentReports.length})</option>
                      {allCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 rotate-90 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div
                  data-parent-guide="principal-reports-list"
                  className={`flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2 ${guideHighlight("principal-reports-list")}`}
                >
                  {loadingReports ? (
                    <p className="mt-8 text-center text-xs text-slate-400">Loading reports...</p>
                  ) : filteredGroups.length === 0 && (
                    <p className="mt-8 text-center text-xs text-slate-400">No reports found.</p>
                  )}
                  {filteredGroups.map((group) => {
                    const isActive = selectedParent?.key === group.key;
                    const allResolved = group.reports.every((report) => report.status === "Resolved");
                    const activeReports = group.reports.filter((report) => report.status !== "Resolved");
                    const activeLevel = allResolved ? 0 : Math.max(...activeReports.map((report) => report.concernLevel), 0);
                    const hasEscalatedFromGuidance = group.reports.some((report) => report.escalatedToPrincipal);
                    const hasEscalatedToGuidance = group.reports.some((report) => report.escalatedToGuidance && !report.escalatedToPrincipal);
                    const hasAcceptedGuidanceTicket = group.reports.some((report) => report.ticketStatus === "accepted");
                    const hasSubmittedToAdviser = group.reports.some((report) =>
                      principalReportStatusLabel(report) === "Submitted report to Adviser"
                    );

                    return (
                      <button
                        key={group.key}
                        onClick={() => selectParent(group)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${isActive ? "border-violet-200 bg-violet-50" : hasEscalatedFromGuidance ? "border-red-100 bg-red-50 hover:bg-red-100" : hasEscalatedToGuidance ? "border-violet-100 bg-violet-50 hover:bg-violet-100" : hasAcceptedGuidanceTicket ? "border-sky-100 bg-sky-50 hover:bg-sky-100" : "border-slate-100 bg-white hover:bg-slate-50"}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <ParentAvatar name={group.displayName} profilePicture={group.profilePicture} initials={group.initials} className="h-9 w-9 rounded-full text-xs" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-bold text-slate-800">{group.displayName}</p>
                              {group.unread > 0 && <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">{group.unread}</span>}
                            </div>
                            <p className="truncate text-[11px] text-slate-400">Student Name: {group.studentName}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          {allResolved && (
                            <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">All Resolved</span>
                          )}
                          <span className="text-[10px] text-slate-400">{group.reports.length} report{group.reports.length === 1 ? "" : "s"}</span>
                        </div>
                          {hasEscalatedFromGuidance && !allResolved && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600">
                            <TriangleAlert className="h-3 w-3" />
                            Escalated from Guidance
                          </div>
                        )}
                        {!hasEscalatedFromGuidance && hasEscalatedToGuidance && !allResolved && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-violet-700">
                            <TriangleAlert className="h-3 w-3" />
                            Escalated to Guidance
                          </div>
                        )}
                        {!hasEscalatedFromGuidance && !hasEscalatedToGuidance && hasAcceptedGuidanceTicket && !allResolved && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-sky-700">
                            <Shield className="h-3 w-3" />
                            Guidance ticket accepted · Read only
                          </div>
                        )}
                        {!hasEscalatedFromGuidance && !hasEscalatedToGuidance && !hasAcceptedGuidanceTicket && hasSubmittedToAdviser && !allResolved && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-sky-700">
                            <Send className="h-3 w-3" />
                            Submitted report to Adviser
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={panelClass(showReportsPanel, "bg-white", "w-full max-w-[420px]", "left-0", showReportsPanelOnMobile)}>
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 pb-1 pt-3">
                  <button
                    onClick={() => { setSelectedParentKey(null); setSelectedReport(null); setViewStep("list"); }}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-violet-50 hover:text-violet-600"
                  >
                    <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Back
                  </button>
                  <span className="truncate text-xs font-semibold text-slate-700">{selectedParent?.displayName ?? ""}</span>
                </div>

                {selectedParent ? (
                  (() => {
                    const unresolvedReports = selectedParent.reports.filter((report) => report.status !== "Resolved");
                    const selectedParentResolved = unresolvedReports.length === 0;
                    const selectedParentLevel = selectedParentResolved ? 0 : Math.max(...unresolvedReports.map((report) => report.concernLevel), 0);

                    return (
                      <>
                        <div className="border-b border-slate-100 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ParentAvatar name={selectedParent.displayName} profilePicture={selectedParent.profilePicture} initials={selectedParent.initials} className="h-10 w-10 rounded-full text-sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-slate-900">{selectedParent.displayName}</p>
                              <p className="truncate text-xs text-slate-400">Student Name: {selectedParent.studentName}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
                          {selectedParent.reports.map((report) => {
                            const isActive = selectedReport?.id === report.id;
                            const isResolvedReport = report.status === "Resolved";
                            const isEscalatedFromGuidance = Boolean(report.escalatedToPrincipal);
                            const isAcceptedGuidanceTicket = report.ticketStatus === "accepted";
                            const isFavorite = favoriteReportIds.has(report.id);
                            const isSavingFavorite = favoriteSavingReportIds.has(report.id);
                            return (
                              <div key={report.id} className="relative">
                                <button
                                  onClick={() => selectReport(report)}
                                  className={`w-full rounded-xl border px-3.5 py-3.5 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 ${isActive ? "border-violet-300 bg-violet-50 shadow-violet-100 ring-1 ring-violet-100" : isResolvedReport ? "border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50" : isEscalatedFromGuidance ? "border-red-100 bg-red-50 hover:bg-red-100" : isAcceptedGuidanceTicket ? "border-sky-100 bg-sky-50 hover:bg-sky-100" : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40"}`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="min-w-0 flex-1 break-words text-sm font-extrabold leading-snug text-slate-800">{report.subject}</p>
                                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold leading-none ${principalReportStatusClass(report)}`}>
                                      {principalReportStatusLabel(report)}
                                    </span>
                                  </div>
                                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                                    {report.categories.map((category) => (
                                      <span key={category} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold leading-none text-slate-600">{category}</span>
                                    ))}
                                  </div>
                                  {/* ConcernBar removed per UX request */}
                                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
                                    {!isResolvedReport && <PriorityBadge level={report.concernLevel} compact />}
                                    <p className="mr-8 shrink-0 text-right text-[10px] font-medium leading-none text-slate-400">{report.submitted_at}</p>
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  aria-pressed={isFavorite}
                                  aria-label={isFavorite ? "Remove report from favorites" : "Add report to favorites"}
                                  title={isFavorite ? "Remove report from favorites" : "Add report to favorites"}
                                  disabled={isSavingFavorite}
                                  onClick={() => { void toggleReportFavorite(report.id); }}
                                  className={`absolute bottom-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-lg border transition disabled:cursor-wait disabled:opacity-60 ${isFavorite ? "border-amber-200 bg-amber-100 text-amber-500 hover:bg-amber-200" : "border-slate-100 bg-white text-slate-300 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-500"}`}
                                >
                                  <Star className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
                    <MessageSquare className="h-8 w-8 opacity-30" />
                    <p className="text-xs font-semibold">No selection</p>
                  </div>
                )}
              </div>

              <div className={panelClass(viewStep === "detail", "bg-slate-50", detailWidth, detailPosition)}>
                <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-3 py-2">
                  <button
                    onClick={() => { setSelectedReport(null); setViewStep(selectedParent ? "reports" : "list"); }}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-violet-50 hover:text-violet-600"
                  >
                    <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Back
                  </button>
                  <span className="truncate text-xs font-semibold text-slate-700">{selectedReport?.subject ?? ""}</span>
                </div>

                {selectedReport ? (() => {
                  const replies = principalReplies[selectedReport.id] ?? [];
                  const isResolved = selectedReport.status === "Resolved";
                  const hasPrincipalReply = replies.some((reply) => reply.sender === "Principal");
                  const canReply = Boolean(selectedReport.canReply);
                  const escalatedFromGuidance = Boolean(selectedReport.escalatedToPrincipal);
                  const showEscalationBanner = escalatedFromGuidance && !isResolved;
                  // This comes only from the Principal API, where it is
                  // derived from parent_adviser_reports.escalated_to_principal.
                  // Treat a missing value as locked while an older snapshot is
                  // being replaced by the authoritative server response.
                  const conversationAvailable = selectedReport.conversationAvailable === true;
                  const canSendParentMessage = canSendResolvedReportParentMessage(selectedReport);
                  const parentMessages = reportParentMessages[selectedReport.id] ?? [];
                  const parentMessagesPanel = canSendParentMessage ? (
                    <PrincipalReportParentMessages
                      messages={parentMessages}
                      loading={loadingReportParentMessageId === selectedReport.id}
                    />
                  ) : null;
                  const sendParentMessageButton = canSendParentMessage ? (
                    <button
                      type="button"
                      onClick={() => setSendParentMessageReport(selectedReport)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-violet-700"
                    >
                      <Send className="h-3.5 w-3.5" /> Send Message to Parent
                    </button>
                  ) : null;

                  if (!conversationAvailable) {
                    return (
                      <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="border-b border-slate-100 bg-white px-6 py-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">Conversation locked</span>
                              <h2 className="mt-2 text-base font-extrabold leading-snug text-slate-900">{selectedReport.subject}</h2>
                              <p className="mt-0.5 text-xs text-slate-400">{selectedReport.submitted_at}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {selectedReport.categories.map((category) => (
                                  <span key={category} className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{category}</span>
                                ))}
                              </div>
                            </div>
                            {sendParentMessageButton}
                          </div>
                        </div>

                        {parentMessagesPanel}

                        <div className="relative flex-1 overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
                          <div aria-hidden="true" className="flex flex-col gap-4 blur-[7px] select-none pointer-events-none">
                            <div className="flex items-start gap-3">
                              <ParentAvatar name={parentDisplayName(selectedReport)} profilePicture={selectedReport.parent_profile_picture} initials={getInitials(parentDisplayName(selectedReport))} className="mt-0.5 h-9 w-9 rounded-full text-xs" />
                              <div className="flex-1">
                                <div className="mb-2 h-3 w-36 rounded-full bg-slate-200" />
                                <div className="rounded-2xl rounded-tl-none border border-slate-100 bg-white px-4 py-4 shadow-sm">
                                  <div className="mb-2 h-3 w-full rounded-full bg-slate-200" />
                                  <div className="mb-2 h-3 w-5/6 rounded-full bg-slate-200" />
                                  <div className="h-3 w-2/3 rounded-full bg-slate-200" />
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60 p-4 backdrop-blur-[2px] sm:p-6">
                            <div role="status" className="max-w-sm rounded-2xl border border-slate-200 bg-white px-6 py-6 text-center shadow-xl sm:px-8 sm:py-7">
                              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
                                <Shield className="h-7 w-7 text-violet-600" />
                              </div>
                              <p className="mt-3 text-sm font-extrabold text-slate-900">Conversation unavailable</p>
                              <p className="mt-2 text-xs leading-relaxed text-slate-500">This conversation will be available after Guidance escalates the report to the Principal.</p>
                              {replyError && <p className="mt-3 text-xs font-semibold text-slate-400">The report details could not be refreshed, but this conversation remains locked.</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-1 flex-col overflow-hidden">
                      <div className={`border-b border-slate-100 bg-white px-4 py-4 sm:px-6 sm:py-5 ${showEscalationBanner ? "border-l-4 border-l-red-500" : ""}`}>
                        {showEscalationBanner && (
                          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                            <TriangleAlert className="h-4 w-4 shrink-0 text-red-600" />
                            <p className="text-xs font-bold text-red-700">Escalated from Guidance to the Principal.</p>
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <h2 className="text-base font-extrabold leading-snug text-slate-900">{selectedReport.subject}</h2>
                            <p className="mt-0.5 text-xs text-slate-400">{selectedReport.submitted_at}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {selectedReport.categories.map((category) => (
                                <span key={category} className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{category}</span>
                              ))}
                            </div>
                          </div>
                          {sendParentMessageButton}
                        </div>
                        {selectedReport.ticketStatus === "rejected" && selectedReport.ticketRejectionReason && (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                            Guidance ticket rejected: {selectedReport.ticketRejectionReason}
                          </div>
                        )}
                      </div>

                      {parentMessagesPanel}

                      <div
                        ref={reportMessagesRef}
                        onScroll={(event) => {
                          const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
                          reportWasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 48;
                        }}
                        className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
                      >
                        {!hasPrincipalReply && (
                          <>
                            <div className="mb-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                              <div className="mb-2 flex items-center gap-2">
                                <Shield className="h-4 w-4 text-violet-600" />
                                <p className="text-xs font-extrabold text-violet-800">Principal-parent conversation</p>
                              </div>
                              <p className="text-xs leading-relaxed text-violet-700">You can monitor the parent, adviser, and Guidance history. Replying is enabled only after Guidance escalates this report to you.</p>
                            </div>

                            <div className="mb-5 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Concern Summary</p>
                              <p className="text-sm font-bold text-slate-800">{selectedReport.subject}</p>
                              <p className="mt-2 text-sm leading-relaxed text-slate-600">{selectedReport.message}</p>
                              {selectedReport.attachment && (
                                <div className="mt-3 flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="text-xs font-semibold text-slate-600">{selectedReport.attachment}</span>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {replies.length === 0 && (
                          <div className="mb-5 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
                            <MessageSquare className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                            <p className="text-xs font-bold text-slate-500">No principal messages yet.</p>
                            <p className="mt-1 text-xs text-slate-400">Start the parent-principal conversation below.</p>
                          </div>
                        )}

                        {replies.map((reply, index) => {
                          const mine = reply.sender === "Principal";
                          return (
                            <div key={`${reply.sent_at}-${index}`} className={`mb-4 flex items-start gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                              <UserAvatar name={reply.senderName || (mine ? "Principal" : reply.sender)} className="mt-0.5 h-9 w-9 rounded-full" fallbackClassName={mine ? "bg-violet-600" : getAvatarColor(reply.senderName || reply.sender)} />
                              <div className={`flex flex-1 flex-col ${mine ? "items-end" : "items-start"}`}>
                                <div className={`mb-1 flex items-center gap-2 ${mine ? "" : "flex-row-reverse"}`}>
                                  <span className="text-[10px] text-slate-400">{reply.sent_at}</span>
                                  <p className="text-xs font-bold text-slate-800">{mine ? "You" : reply.senderName || reply.sender}</p>
                                  {!mine && reply.senderRole && (
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${principalHistoryRoleStyle(reply.senderRole)}`}>
                                      {reply.senderRole === "adviser" ? "ADVISER" : reply.senderRole === "guidance" ? "GUIDANCE" : reply.senderRole === "principal" ? "PRINCIPAL" : reply.senderRole === "subject_teacher" ? "SUBJECT TEACHER" : "PARENT"}
                                    </span>
                                  )}
                                </div>
                                {(reply.message || reply.attachments.length > 0) && (
                                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${mine ? "rounded-tr-none bg-violet-600 text-white" : "rounded-tl-none border border-slate-200 bg-white text-slate-700"}`}>
                                    {reply.message && <p className="whitespace-pre-wrap">{reply.message}</p>}
                                    <MessageAttachments attachments={reply.attachments} mine={mine} />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="border-t border-slate-100 bg-white px-4 py-4 sm:px-6">
                        {reportTyping.isOtherParticipantTyping && (
                          <div aria-live="polite" aria-label="The other participant is typing…" className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                            <span className="flex gap-1" aria-hidden="true"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" /></span>
                            The other participant is typing…
                          </div>
                        )}
                        <div className="mb-4 flex flex-wrap gap-2">
                          {selectedReport.status !== "Resolved" && canReply && (
                            <button
                              onClick={() => setResolveTargetId(selectedReport.id)}
                              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Resolve
                            </button>
                          )}
                        </div>

                        {replyError && (
                          <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                            {replyError}
                          </div>
                        )}

                        {replyAttachments.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {replyAttachments.map((file, index) => (
                              <div key={`${file.name}-${index}`} className="relative flex h-11 max-w-[150px] items-center gap-2 rounded-xl bg-white px-3 pr-7 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                <span className="truncate">{file.name}</span>
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
                        )}

                        {isResolved ? (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                            This report has been resolved. Messaging is unavailable.
                          </div>
                        ) : !canReply ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">Read-only monitoring. Guidance must escalate this report to the Principal before you can reply.</div> : <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                          <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                            <textarea
                              value={replyText}
                              onChange={(event) => { setReplyText(event.target.value); reportTyping.onDraftChange(Boolean(event.target.value.trim())); }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  sendReply();
                                }
                              }}
                              placeholder="Write a reply to the parent... (Enter to send)"
                              rows={2}
                              className="w-full resize-none bg-transparent px-3.5 pb-1 pt-2.5 text-sm text-slate-700 outline-none"
                              disabled={isResolved}
                            />
                          </div>
                          <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                          <label className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition ${isResolved ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-slate-100"}`}>
                            <Paperclip className="h-4 w-4" />
                            <input
                              type="file"
                              multiple
                              disabled={isResolved}
                              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                              onChange={(event) => {
                                const captured = Array.from(event.target.files ?? []);
                                event.target.value = "";
                                const valid = captured.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
                                if (valid.length > 0) {
                                  setReplyAttachments((prev) => [...prev, ...valid].slice(0, 5));
                                }
                              }}
                            />
                          </label>
                          <button
                            onClick={sendReply}
                            disabled={sendingReply || isResolved || (!replyText.trim() && replyAttachments.length === 0)}
                            className={`rounded-xl p-2.5 transition ${!sendingReply && !isResolved && (replyText.trim() || replyAttachments.length > 0) ? "bg-violet-600 text-white hover:bg-violet-700" : "cursor-not-allowed bg-slate-100 text-slate-300"}`}
                          >
                            <Send className="h-4 w-4" />
                          </button>
                          </div>
                        </div>}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
                    <MessageSquare className="h-10 w-10 opacity-30" />
                    <p className="text-sm font-semibold">Select a report to view details</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          onMessageSent={handleNewMessageSent}
          staffRecipients={staffRecipients}
          parentRecipients={parentRecipients}
        />
      )}
      {sendParentMessageReport && (
        <ResolvedReportParentMessageModal
          report={sendParentMessageReport}
          onClose={() => setSendParentMessageReport(null)}
          onSubmit={(message, attachments) => sendResolvedReportParentMessage(sendParentMessageReport, message, attachments)}
        />
      )}
      {showExportMonitoring && (
        <ExportMonitoringModal
          items={filteredMonitoringEntries}
          filterSummary={monitoringFilterSummary}
          onClose={() => setShowExportMonitoring(false)}
        />
      )}
      <ResolveConfirmationModal
        open={resolveTargetId !== null}
        saving={resolving}
        onCancel={() => { if (!resolving) setResolveTargetId(null); }}
        onConfirm={() => { void confirmResolve(); }}
      />
      <PrincipalReportsGuide onStepChange={setGuideTarget} />
    </div>
  );
}

export default function PrincipalReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <PrincipalReportsPageContent />
    </Suspense>
  );
}
