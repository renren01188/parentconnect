"use client";

import ExcelJS from "exceljs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { type Report, type ReportStatus } from "../../adviser/data";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { UserAvatar } from "@/components/UserAvatar";
import { useNotifContext } from "../context/NotificationContext";

type MainTab = "Escalated" | "Monitoring" | "Messages";
type FilterTab = "All" | "Pending" | "Ongoing" | "Escalated" | "Resolved";
type MonitoringPriority = "low" | "medium" | "high";
type MonitoringStatus = "Pending" | "Under Review" | "Escalated to Guidance" | "Escalated to Principal" | "Resolved";
type ExportFormat = "excel" | "pdf";

type MonitoringEntry = {
  id: string;
  date: string;
  from: { name: string; role: string; initials: string };
  to: { name: string; role: string; initials: string };
  category: string;
  concern: string;
  student: string;
  priority: MonitoringPriority;
  status: MonitoringStatus;
};

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
  senderRole?: "parent" | "adviser" | "guidance" | "principal";
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
  status: "New Message" | "Unread" | "Read" | "Replied" | null;
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

function formatAttachmentSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChips({ attachments, mine = false }: { attachments?: MessageAttachment[]; mine?: boolean }) {
  if (!attachments?.length) return null;
  return (
    <div className={`mt-2 flex max-w-[78%] flex-wrap gap-2 ${mine ? "justify-end" : ""}`}>
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


function parentDisplayName(report: Report) {
  return report.parent_name?.trim() || `${report.student_name} Parent's`;
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

function ParentAvatar({ name, profilePicture, initials, className }: { name: string; profilePicture?: string | null; initials: string; className: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <div className={`${className} ${getAvatarColor(name)} overflow-hidden flex items-center justify-center text-white font-extrabold shrink-0`}>
      {profilePicture && !imageFailed
        ? <img src={profilePicture} alt={`${name}'s profile`} className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
        : initials}
    </div>
  );
}

function getStatusStyle(status: ReportStatus) {
  switch (status) {
    case "New": return "bg-sky-500 text-white";
    case "Read": return "bg-slate-200 text-slate-600";
    case "Ongoing": return "bg-blue-100 text-blue-700";
    case "Resolved": return "bg-emerald-100 text-emerald-700";
    case "Escalated": return "bg-red-100 text-red-600";
  }
}

function principalHistoryRoleStyle(role?: PrincipalReply["senderRole"]) {
  switch (role) {
    case "parent": return "border-sky-200 bg-sky-50 text-sky-700";
    case "guidance": return "border-blue-700 bg-blue-700 text-white";
    case "adviser": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "principal": return "border-violet-200 bg-violet-50 text-violet-700";
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
  if (status === "Escalated to Guidance") return "bg-violet-600 text-white";
  if (status === "Resolved") return "bg-emerald-100 text-emerald-700";
  if (status === "Under Review") return "bg-blue-100 text-blue-700";
  return "bg-amber-50 text-amber-700 border border-amber-200";
}

function monitoringStatusFromReport(report: Report): MonitoringStatus {
  if (report.escalatedToPrincipal) return "Escalated to Principal";
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
    return {
      id: `parent:${report.id}`,
      date: report.submitted_at,
      from: { name: fromName, role: "Parent", initials: getInitials(fromName) },
      to: { name: "School Staff", role: "Adviser", initials: "SS" },
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
  return reports.map((report) => ({
    id: `student:${report.id}`,
    date: new Date(report.created_at).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    from: { name: report.student_name, role: "Student", initials: getInitials(report.student_name) },
    to: { name: report.adviser_name || "Class Adviser", role: "Adviser", initials: getInitials(report.adviser_name || "Class Adviser") },
    category: report.category || "Other",
    concern: report.description ? `${report.title}: ${report.description}` : report.title,
    student: `${report.student_name} (${report.grade} - ${report.section})`,
    priority: "medium",
    status: studentReportStatus(report.status),
  }));
}

function conversationStatusClass(status: Conversation["status"]) {
  if (status === "New Message" || status === "Unread") return "bg-violet-600 text-white";
  if (status === "Replied") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-200 text-slate-600";
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

function monitoringExportRows(items: MonitoringEntry[]) {
  return items.map((entry) => ({
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

async function exportMonitoringToExcel(items: MonitoringEntry[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ParentConnect";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Report Monitoring");
  sheet.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "From", key: "fromName", width: 24 },
    { header: "From Role", key: "fromRole", width: 16 },
    { header: "To", key: "toName", width: 24 },
    { header: "To Role", key: "toRole", width: 16 },
    { header: "Category", key: "category", width: 24 },
    { header: "Concern", key: "concern", width: 42 },
    { header: "Student", key: "student", width: 22 },
    { header: "Priority", key: "priority", width: 14 },
    { header: "Status", key: "status", width: 28 },
  ];
  sheet.spliceRows(1, 0, [], []);
  sheet.addRows(monitoringExportRows(items));

  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = "ParentConnect - Report Monitoring";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6D28D9" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.getCell("A2").value = `Generated: ${new Date().toLocaleString()}`;
  sheet.getCell("J2").value = `Total: ${items.length}`;
  sheet.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };
  sheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  sheet.getRow(3).alignment = { vertical: "middle", horizontal: "center" };
  sheet.views = [{ state: "frozen", ySplit: 3 }];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 3) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 3 && rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `principal_report_monitoring_${new Date().toISOString().slice(0, 10)}.xlsx`,
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

function createMonitoringPdf(items: MonitoringEntry[]) {
  const pageWidth = 792;
  const pageHeight = 612;
  const left = 36;
  const right = 756;
  const commands: string[] = [];

  commands.push(makePdfRect(0, pageHeight - 72, pageWidth, 72, 0.93));
  commands.push(makePdfText("ParentConnect", left, 570, 9, true));
  commands.push(makePdfText("Principal Report Monitoring", left, 548, 18, true));
  commands.push(makePdfText("Santiago Elementary School", left, 530, 10));
  commands.push(makePdfText(`Generated: ${new Date().toLocaleString()}`, 560, 558, 9));

  commands.push(makePdfRect(left, 492, right - left, 34, 0.97));
  commands.push(makePdfText("Total Reports", left + 14, 510, 9, true));
  commands.push(makePdfText(String(items.length), left + 100, 510, 12, true));
  commands.push(makePdfText("From Parents", left + 180, 510, 9, true));
  commands.push(makePdfText(String(items.filter((entry) => entry.from.role === "Parent").length), left + 272, 510, 12, true));
  commands.push(makePdfText("From Students", left + 350, 510, 9, true));
  commands.push(makePdfText(String(items.filter((entry) => entry.from.role === "Student").length), left + 446, 510, 12, true));
  commands.push(makePdfText("To Principal", left + 530, 510, 9, true));
  commands.push(makePdfText(String(items.filter((entry) => entry.status === "Escalated to Principal").length), left + 610, 510, 12, true));

  const columns = [
    { label: "Date", x: left + 8 },
    { label: "From", x: left + 104 },
    { label: "To", x: left + 226 },
    { label: "Category", x: left + 340 },
    { label: "Concern", x: left + 446 },
    { label: "Student", x: left + 558 },
    { label: "Status", x: left + 650 },
  ];

  let y = 454;
  commands.push(makePdfRect(left, y - 10, right - left, 28, 0.88));
  columns.forEach((column) => commands.push(makePdfText(column.label, column.x, y, 8, true)));
  y -= 30;

  items.forEach((entry, index) => {
    if (index % 2 === 0) commands.push(makePdfRect(left, y - 12, right - left, 26, 0.985));
    commands.push(makePdfText(entry.date, columns[0].x, y, 8, true));
    commands.push(makePdfText(`${entry.from.name} (${entry.from.role})`, columns[1].x, y, 8));
    commands.push(makePdfText(`${entry.to.name} (${entry.to.role})`, columns[2].x, y, 8));
    commands.push(makePdfText(entry.category, columns[3].x, y, 8));
    commands.push(makePdfText(entry.concern.slice(0, 40), columns[4].x, y, 8));
    commands.push(makePdfText(entry.student, columns[5].x, y, 8));
    commands.push(makePdfText(entry.status.replace("Escalated to ", "To "), columns[6].x, y, 8, true));
    commands.push(makePdfLine(left, y - 14, right, y - 14, 0.9));
    y -= 28;
  });

  commands.push(makePdfLine(left, 46, right, 46, 0.82));
  commands.push(makePdfText("Confidential report monitoring export", left, 28, 8));
  commands.push(makePdfText("Page 1 of 1", 700, 28, 8));

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents 4 0 R >>`,
  ];
  const body = commands.join("\n");
  objects.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);

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

function exportMonitoringToPdf(items: MonitoringEntry[]) {
  downloadBlob(createMonitoringPdf(items), `principal_report_monitoring_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function ExportMonitoringModal({ items, onClose }: { items: MonitoringEntry[]; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>("excel");
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      if (format === "excel") await exportMonitoringToExcel(items);
      else exportMonitoringToPdf(items);
      onClose();
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5" onClick={onClose}>
      <div className="w-full max-w-[520px] overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Export Report Monitoring</h2>
            <p className="mt-1 text-sm text-slate-400">Choose a polished Excel or PDF copy of the monitoring table.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
            <p className="text-sm font-extrabold text-violet-800">Included Data</p>
            <p className="mt-1 text-xs leading-relaxed text-violet-700">
              {items.length} monitoring records with date, sender, receiver, category, student, priority, and status.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { value: "excel", label: "Excel", desc: "Formatted workbook with styled headers and readable columns." },
              { value: "pdf", label: "PDF", desc: "Clean printable report with summary and table layout." },
            ] as { value: ExportFormat; label: string; desc: string }[]).map((option) => {
              const selected = format === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormat(option.value)}
                  className={`rounded-2xl border p-4 text-left transition ${selected ? "border-violet-300 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileDown className={`h-4 w-4 ${selected ? "text-violet-700" : "text-slate-400"}`} />
                      <p className={`text-sm font-extrabold ${selected ? "text-violet-800" : "text-slate-800"}`}>{option.label}</p>
                    </div>
                    {selected && <CheckCircle className="h-4 w-4 text-violet-600" />}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{option.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-300"
          >
            <FileDown className="h-4 w-4" />
            {exporting ? "Exporting..." : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
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

function PriorityBadge({ level, large = false }: { level: number; large?: boolean }) {
  return (
    <span className={`${large ? "px-3 py-1.5 text-xs" : "px-2 py-0.5 text-[11px]"} rounded-lg font-extrabold ${priorityClass(level)}`}>
      {priorityLabel(level)}
    </span>
  );
}

function ResolvedBadge({ large = false }: { large?: boolean }) {
  return (
    <span className={`${large ? "px-3 py-1.5 text-xs" : "px-2 py-0.5 text-[11px]"} rounded-lg bg-emerald-100 font-extrabold text-emerald-700`}>
      Resolved
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
  mode = "concern",
}: {
  onClose: () => void;
  onMessageSent?: (payload: NewMessagePayload) => Promise<void> | void;
  staffRecipients: StaffRecipient[];
  parentRecipients: ParentRecipient[];
  mode?: "concern" | "message";
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
  const isMessageMode = mode === "message";
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
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/45 p-5" onClick={onClose}>
      <div className="flex max-h-[calc(100vh-40px)] w-[500px] flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">{isMessageMode ? "Send Message" : "Send a Concern"}</h2>
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
          <div className="flex flex-col gap-5 px-6 py-5">
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
                        <p className="truncate text-sm font-semibold text-slate-800">{selectedRecipient.name}</p>
                        <p className="text-xs text-slate-400">{selectedRecipient.type === "staff" ? `${selectedRecipient.role} · ${selectedRecipient.email}` : `Student: ${selectedRecipient.student}`}</p>
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
                              <p className="truncate text-sm font-semibold text-slate-800">{parent.name}</p>
                              <p className="truncate text-xs text-slate-400">Student: {parent.student} · {parent.gradeLevel}, {parent.section}</p>
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
              <label className="mb-1.5 block text-xs font-bold text-slate-700">{isMessageMode ? "Topic" : "Subject"} <span className="text-red-500">*</span></label>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={isMessageMode ? "Enter topic..." : "Enter subject..."}
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
              {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <span key={`${attachment.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      <Paperclip className="h-3 w-3 text-slate-400" />
                      {attachment.name}
                      <button onClick={() => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="text-slate-400 hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-2">
              <button onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
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
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition ${canSubmit ? "bg-violet-600 hover:bg-violet-700" : "cursor-not-allowed bg-violet-300"}`}
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
    if (!map[report.student_name]) {
      map[report.student_name] = {
        key: `${report.parent_name ?? report.student_name}:${report.student_name}`,
        displayName,
        profilePicture: report.parent_profile_picture,
        studentName: report.student_name,
        initials: getInitials(displayName),
        reports: [],
        unread: 0,
        maxConcernLevel: 0,
      };
    }
    map[report.student_name].reports.push(report);
    if (report.status === "New" || report.status === "Escalated") map[report.student_name].unread++;
    map[report.student_name].maxConcernLevel = Math.max(map[report.student_name].maxConcernLevel, report.concernLevel);
  });

  return Object.values(map).map((group) => ({
    ...group,
    reports: [...group.reports].sort((a, b) => b.concernLevel - a.concernLevel),
  }));
}

export default function PrincipalReportsPage() {
  const { setReportCount } = useNotifContext();
  const [mainTab, setMainTab] = useState<MainTab>("Escalated");
  const [filterTab, setFilterTab] = useState<FilterTab>("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedParent, setSelectedParent] = useState<ParentGroup | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [viewStep, setViewStep] = useState<"list" | "reports" | "detail">("list");
  const [reports, setReports] = useState<Report[]>([]);
  const [studentReports, setStudentReports] = useState<PrincipalStudentReport[]>([]);
  const [staffRecipients, setStaffRecipients] = useState<StaffRecipient[]>([]);
  const [parentRecipients, setParentRecipients] = useState<ParentRecipient[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const statusOverridesRef = useRef<Record<number, { status: ReportStatus; at: number }>>({});
  const [unlockedReports, setUnlockedReports] = useState<Set<number>>(new Set());
  const [principalReplies, setPrincipalReplies] = useState<Record<number, PrincipalReply[]>>({});
  const [replyText, setReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showExportMonitoring, setShowExportMonitoring] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationReply, setConversationReply] = useState("");
  const [conversationReplyAttachments, setConversationReplyAttachments] = useState<File[]>([]);
  const conversationMessagesRef = useRef<HTMLDivElement>(null);
  const reportMessagesRef = useRef<HTMLDivElement>(null);

  // ── Sync sidebar Reports badge directly from local state (avoids API timing issues) ──
  useEffect(() => {
    const count = reports.filter(
      (r) => r.escalatedToPrincipal && (r.status === "Escalated" || r.status === "New")
    ).length;
    setReportCount(count);
  }, [reports, setReportCount]);

  const escalatedReports = reports.filter((report) => report.escalatedToPrincipal);
  const currentReports = mainTab === "Escalated" ? escalatedReports : reports;
  const allCategories = Array.from(new Set(currentReports.flatMap((report) => report.categories))).sort();
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const unreadMessageCount = conversations.filter((conversation) => conversation.status === "New Message" || conversation.status === "Unread").length;
  const selectedConversationMessageCount = selectedConversation?.messages.length ?? 0;
  const selectedReportId = selectedReport?.id ?? null;
  const selectedReportReplies = selectedReport ? (principalReplies[selectedReport.id] ?? []) : [];

  useEffect(() => {
    if (mainTab !== "Messages" || !selectedConversationId) return;
    requestAnimationFrame(() => {
      const el = conversationMessagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [mainTab, selectedConversationId, selectedConversationMessageCount]);

  useEffect(() => {
    if (!selectedReportId) return;
    requestAnimationFrame(() => {
      const el = reportMessagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [selectedReportId, selectedReportReplies.length]);
  const monitoringEntries = useMemo(
    () => [...reportsToMonitoringEntries(reports), ...studentReportsToMonitoringEntries(studentReports)]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [reports, studentReports]
  );
  const monitoringTotals = {
    parentReports: monitoringEntries.filter((entry) => entry.from.role === "Parent").length,
    studentReports: monitoringEntries.filter((entry) => entry.from.role === "Student").length,
    escalatedToPrincipal: monitoringEntries.filter((entry) => entry.status === "Escalated to Principal").length,
    escalatedToGuidance: monitoringEntries.filter((entry) => entry.status === "Escalated to Guidance").length,
  };
  const monitoringCategoryTotals = MESSAGE_CATEGORIES.map((category) => ({
    name: category.name,
    count: monitoringEntries.filter((entry) => entry.category === category.name).length,
  })).filter((category) => category.count > 0);

  const reportsForActiveTab = useCallback((items: Report[]) => (
    mainTab === "Escalated"
      ? items.filter((report) => report.escalatedToPrincipal)
      : items
  ), [mainTab]);

  const loadPrincipalReports = useCallback(async () => {
    const [parentRes, studentRes] = await Promise.all([
      fetch("/api/reports/parent-adviser?role=principal", { cache: "no-store" }),
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
      });
      setReports(nextReports);
      setPrincipalReplies(Object.fromEntries(nextReports.map((report) => [
        report.id,
        (report.replies ?? []).map((reply) => ({ ...reply, attachments: reply.attachments ?? [] })),
      ])));
      setSelectedReport((current) => current ? nextReports.find((report) => report.id === current.id) ?? null : null);
      setSelectedParent((current) => {
        if (!current) return current;
        return groupByStudentParent(reportsForActiveTab(nextReports)).find((group) => group.key === current.key) ?? null;
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
  }, [reportsForActiveTab]);

  const loadPrincipalMessages = useCallback(async () => {
    const res = await fetch("/api/reports/principal-messages", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Keep the reports screen usable when the optional messages feed is
      // temporarily unavailable (for example during a backend timeout).
      // This is recoverable and should not trigger Next's console error overlay.
      console.warn("Principal messages are temporarily unavailable:", data?.message || res.statusText);
      return;
    }
    setStaffRecipients((data?.staff ?? []) as StaffRecipient[]);
    setParentRecipients((data?.parents ?? []) as ParentRecipient[]);
    // Filter out parent-report conversations — those belong in Escalated Reports only
    const nextConversations = ((data?.inbox ?? []) as Conversation[]).filter(
      (conversation) => !conversation.id.startsWith("parent-report:")
    );
    setConversations(nextConversations);
    setSelectedConversationId((current) =>
      current && nextConversations.some((conversation) => conversation.id === current)
        ? current
        : nextConversations[0]?.id ?? null
    );
  }, []);

  const loadPrincipalReportsRef = useRef(loadPrincipalReports);

  useEffect(() => {
    loadPrincipalReportsRef.current = loadPrincipalReports;
  }, [loadPrincipalReports]);

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      try {
        setLoadingReports(true);
        await Promise.all([loadPrincipalReports(), loadPrincipalMessages()]);
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
  }, [loadPrincipalMessages, loadPrincipalReports]);


  const loadPrincipalMessagesRef = useRef(loadPrincipalMessages);

  useEffect(() => { loadPrincipalReportsRef.current = loadPrincipalReports; }, [loadPrincipalReports]);
  useEffect(() => { loadPrincipalMessagesRef.current = loadPrincipalMessages; }, [loadPrincipalMessages]);

  useEffect(() => {
    const client = supabaseBrowser;
    if (!client) return;

    const uniqueChannel = `principal-reports-${Math.random().toString(36).slice(2)}`;

    const channel = client
      .channel(uniqueChannel)
      .on("postgres_changes", { event: "*", schema: "public", table: "adviser_principal_messages" }, () => {
        loadPrincipalMessagesRef.current().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_staff_messages" }, () => {
        loadPrincipalMessagesRef.current().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
        loadPrincipalMessagesRef.current().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => {
        Promise.all([
          loadPrincipalReportsRef.current(),
          loadPrincipalMessagesRef.current(),
        ]).catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_report_messages" }, () => {
        Promise.all([
          loadPrincipalReportsRef.current(),
          loadPrincipalMessagesRef.current(),
        ]).catch(() => null);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "parents" }, () => { loadPrincipalReportsRef.current().catch(() => null); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "advisers" }, () => { loadPrincipalReportsRef.current().catch(() => null); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "guidance_counselors" }, () => { loadPrincipalReportsRef.current().catch(() => null); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "principals" }, () => { loadPrincipalReportsRef.current().catch(() => null); })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_reports" }, () => {
        loadPrincipalReportsRef.current().catch(() => null);
      })
      .subscribe((status) => {
        console.log("📡 Principal realtime status:", status);
      });

    return () => {
      client.removeChannel(channel);
    };
  }, []);

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
      .sort((a, b) => b.maxConcernLevel - a.maxConcernLevel);
  })();

  const showReportsPanel = viewStep === "reports" || (viewStep === "detail" && !!selectedParent);
  const detailPosition = selectedParent ? "left-[520px]" : "left-0";
  const detailWidth = selectedParent ? "right-0 w-auto" : "w-full max-w-[860px]";

  function panelClass(visible: boolean, bg: string, width: string, position = "left-0") {
    return `absolute inset-y-0 ${position} ${width} h-full flex flex-col overflow-hidden border-r border-slate-100 shadow-sm transition-all duration-200 ease-out ${bg} ${visible ? "opacity-100 translate-y-0 scale-100 pointer-events-auto" : "opacity-0 translate-y-2 scale-[0.99] pointer-events-none"
      }`;
  }

  function refreshSelectedParent(nextReports: Report[], parent: ParentGroup | null) {
    if (!parent) return;
    const nextParent = groupByStudentParent(reportsForActiveTab(nextReports)).find((group) => group.key === parent.key) ?? null;
    setSelectedParent(nextParent);
  }

  async function markReportStatus(id: number, status: ReportStatus) {
    statusOverridesRef.current[id] = { status, at: Date.now() };
    setReports((prev) => {
      const next = prev.map((report) => report.id === id ? { ...report, status } : report);
      refreshSelectedParent(next, selectedParent);
      return next;
    });
    setSelectedReport((prev) => prev?.id === id ? { ...prev, status } : prev);

    try {
      const res = await fetch(`/api/reports/principal/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Unable to update principal report status:", data?.message || res.statusText);
        return;
      }
      if (data?.report) {
        const updated = data.report as Report;
        setReports((prev) => {
          const next = prev.map((report) => report.id === id ? updated : report);
          refreshSelectedParent(next, selectedParent);
          return next;
        });
        setSelectedReport((prev) => prev?.id === id ? updated : prev);
        setPrincipalReplies((prev) => ({
          ...prev,
          [id]: (updated.replies ?? []).map((reply) => ({ ...reply, attachments: reply.attachments ?? [] })),
        }));
      }
    } catch (error) {
      console.error("Unable to update principal report status:", error);
    }
  }

  function selectParent(group: ParentGroup) {
    setSelectedParent(group);
    setSelectedReport(null);
    setReplyText("");
    setReplyAttachments([]);
    setViewStep("reports");
  }

  function selectReport(report: Report) {
    setSelectedReport(report);
    setReplyText("");
    setReplyAttachments([]);
    setViewStep("detail");
    if (report.status === "Escalated") markReportStatus(report.id, "Ongoing").catch(() => null);
    else if (report.status === "New") markReportStatus(report.id, "Read").catch(() => null);
  }

  function unlockReport(report: Report) {
    setUnlockedReports((prev) => new Set(prev).add(report.id));
    if (report.status !== "Resolved") markReportStatus(report.id, "Ongoing").catch(() => null);
  }

  async function sendReply() {
    if (!selectedReport || selectedReport.status === "Resolved") return;
    const message = replyText.trim();
    if (!message && replyAttachments.length === 0) return;

    const validFiles = replyAttachments.filter(f => f.size <= MAX_ATTACHMENT_BYTES);
    const cleanedAttachments = await filesToAttachments(validFiles);

    setPrincipalReplies((prev) => ({
      ...prev,
      [selectedReport.id]: [
        ...(prev[selectedReport.id] ?? []),
        {
          sender: "Principal",
          message,
          attachments: cleanedAttachments,
          sent_at: new Date().toLocaleString(),
        },
      ],
    }));

    setReplyText("");
    setReplyAttachments([]);
    if (selectedReport.status !== "Ongoing") markReportStatus(selectedReport.id, "Ongoing").catch(() => null);

    try {
      const res = await fetch(`/api/reports/parent-adviser/${selectedReport.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: message,
          role: "principal",
          threadType: "principal",
          attachments: cleanedAttachments,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Reply failed:", data?.message);
      }
    } catch (error) {
      console.error("Reply error:", error);
    }
  }

  function switchMainTab(tab: MainTab) {
    setMainTab(tab);
    setSelectedParent(null);
    setSelectedReport(null);
    setViewStep("list");
    setFilterTab("All");
    setCategoryFilter("All");
    setReplyText("");
    setReplyAttachments([]);
    setConversationReply("");
    setConversationReplyAttachments([]);
    if (tab === "Messages" && !selectedConversationId) setSelectedConversationId(conversations[0]?.id ?? null);
  }

  async function markConversationRead(conversationId: string) {
    const res = await fetch("/api/reports/principal-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, status: "read" }),
    });
    if (!res.ok) throw new Error("Unable to mark message as read.");
  }

  function selectConversation(conversation: Conversation) {
    setSelectedConversationId(conversation.id);
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

  async function sendConversationReply() {
    const body = conversationReply.trim();
    if (!selectedConversation || (!body && conversationReplyAttachments.length === 0)) return;

    const validFiles = conversationReplyAttachments.filter(f => f.size <= MAX_ATTACHMENT_BYTES);
    const cleanedAttachments = await filesToAttachments(validFiles);
    const categories = selectedConversation.category.split(",").map((c) => c.trim()).filter(Boolean);

    // Optimistic update first
    const optimisticMsg = {
      id: `principal-${Date.now()}`,
      sender: "principal" as const,
      body,
      sentAt: new Date().toLocaleString(),
      attachments: cleanedAttachments,
    };
    setConversations((prev) => prev.map((conv) =>
      conv.id !== selectedConversation.id ? conv : {
        ...conv,
        status: "Replied" as const,
        lastMessageAt: new Date().toLocaleString(),
        messages: [...conv.messages, optimisticMsg],
      }
    ));
    setConversationReply("");
    setConversationReplyAttachments([]);

    // Then persist to backend
    try {
      const res = await fetch("/api/reports/principal-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        // Roll back on failure
        await loadPrincipalMessages();
      }
    } catch (error) {
      console.error("Send error:", error);
      await loadPrincipalMessages();
    }
  }

  async function handleNewMessageSent(payload: NewMessagePayload) {
    const res = await fetch("/api/reports/principal-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientId: payload.recipient.id,
        subject: payload.subject,
        categories: payload.categories,
        message: payload.body,
        attachments: payload.attachments,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || "Unable to send message.");

    if (payload.recipient.type === "parent") {
      await Promise.all([loadPrincipalReports(), loadPrincipalMessages()]);
      setMainTab("Messages");
      if (data?.reportId) setSelectedConversationId(`parent-report:${data.reportId}`);
      return;
    }

    await loadPrincipalMessages();
    setMainTab("Messages");
    if (data?.conversationId) setSelectedConversationId(data.conversationId);
  }

  function renderTopTabs() {
    return (
      <div className="flex flex-col gap-2 px-3 pb-2 pt-4">
        <button
          onClick={() => switchMainTab("Escalated")}
          className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mainTab === "Escalated" ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="flex items-center gap-2.5"><Shield className="h-4 w-4" /> Escalated Reports</span>
          {escalatedReports.filter(r => r.status === "Escalated" || r.status === "New").length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-extrabold ${mainTab === "Escalated" ? "bg-violet-600 text-white" : "bg-red-500 text-white"}`}>
              {escalatedReports.filter(r => r.status === "Escalated" || r.status === "New").length}
            </span>
          )}
        </button>
        <button
          onClick={() => switchMainTab("Monitoring")}
          className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mainTab === "Monitoring" ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          <span className="flex items-center gap-2.5"><Eye className="h-4 w-4" /> Report Monitoring</span>
        </button>
        <button
          onClick={() => switchMainTab("Messages")}
          className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${mainTab === "Messages" ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}
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
    <div className="flex h-full flex-col bg-slate-50">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-0.5 text-xs text-slate-400">Monitor parent concerns and reports escalated to the principal</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-700">
            {escalatedReports.length} Escalated
          </span>
          <span className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-extrabold text-sky-700">
            {reports.filter((report) => report.status !== "Resolved").length} Active
          </span>
          <button
            onClick={() => setShowNewMessage(true)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700"
          >
            <MessageSquare className="h-3.5 w-3.5" /> New Message
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative h-full w-full">
          {mainTab === "Messages" ? (
            <>
              <div className={panelClass(true, "bg-white", "w-full max-w-[420px]")}>
                {renderTopTabs()}
                <div className="mx-3 h-px bg-slate-100" />
                <div className="px-4 py-4">
                  <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Received</p>
                        <p className="mt-1 text-xl font-extrabold text-slate-900">
                          {conversations.filter((conversation) => conversation.messages.some((message) => message.sender === "them")).length}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Sent</p>
                        <p className="mt-1 text-xl font-extrabold text-slate-900">
                          {conversations.filter((conversation) => conversation.messages.some((message) => message.sender === "principal")).length}
                        </p>
                      </div>
                    </div>
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
                            <p className="mt-2 truncate text-xs font-bold text-slate-800">{conversation.subject}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{latestMessage?.body}</p>
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

              <div className="absolute inset-y-0 left-[420px] right-0 flex flex-col overflow-hidden bg-slate-50">
                {selectedConversation ? (
                  <>
                    <div className="shrink-0 border-b border-slate-100 bg-white px-6 py-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <ConversationAvatar sender={selectedConversation.sender} />
                          <div className="min-w-0">
                            <h2 className="truncate text-base font-extrabold text-slate-900">{selectedConversation.subject}</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                              {selectedConversation.sender.name} · {selectedConversation.sender.role}
                            </p>
                            {selectedConversation.sender.gradeSection && (
                              <p className="mt-0.5 text-xs font-medium text-slate-400">{selectedConversation.sender.student} · {selectedConversation.sender.gradeSection}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-extrabold text-violet-700">{selectedConversation.category}</span>
                          {selectedConversation.status && (
                            <span className={`rounded-xl px-3 py-1.5 text-xs font-extrabold ${conversationStatusClass(selectedConversation.status)}`}>{selectedConversation.status === "Unread" ? "New Message" : selectedConversation.status}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div ref={conversationMessagesRef} className="flex-1 overflow-y-auto px-6 py-5">
                      {selectedConversation.messages.map((message) => {
                        const mine = message.sender === "principal";
                        return (
                          <div key={message.id} className={`mb-4 flex items-start gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                            {mine ? (
                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-extrabold text-white">Me</div>
                            ) : (
                              <ConversationAvatar sender={selectedConversation.sender} />
                            )}
                            <div className={`flex flex-1 flex-col ${mine ? "items-end" : "items-start"}`}>
                              <div className="mb-1 flex items-center gap-2">
                                <p className="text-xs font-bold text-slate-800">{mine ? "You" : selectedConversation.sender.name}</p>
                                <span className="text-[10px] text-slate-400">{message.sentAt}</span>
                              </div>
                              <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${mine ? "rounded-tr-none bg-violet-600 text-white" : "rounded-tl-none border border-slate-100 bg-white text-slate-700"}`}>
                                {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
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

                    <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
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
                      <div className="flex items-end gap-3">
                        <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                          <textarea
                            value={conversationReply}
                            onChange={(event) => setConversationReply(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                sendConversationReply();
                              }
                            }}
                            placeholder={`Reply to ${selectedConversation.sender.name}...`}
                            rows={2}
                            className="min-h-[52px] w-full resize-none bg-transparent px-3.5 pb-2 pt-2.5 text-sm text-slate-700 outline-none"
                          />
                        </div>
                        <button
                          onClick={sendConversationReply}
                          disabled={!conversationReply.trim() && conversationReplyAttachments.length === 0}
                          className={`rounded-xl p-3 transition ${conversationReply.trim() || conversationReplyAttachments.length > 0 ? "bg-violet-600 text-white hover:bg-violet-700" : "cursor-not-allowed bg-slate-100 text-slate-300"}`}
                        >
                          <Send className="h-4 w-4" />
                        </button>
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
            </>
          ) : mainTab === "Monitoring" ? (
            <>
              <div className={panelClass(true, "bg-white", "w-full max-w-[420px]")}>
                {renderTopTabs()}
                <div className="mx-3 h-px bg-slate-100" />
                <div className="px-4 py-5">
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
                    <p className="text-sm font-extrabold text-violet-800">Report Monitoring</p>
                    <p className="mt-1 text-xs leading-relaxed text-violet-600">
                      Review the system-wide report path, status, and escalation totals from this monitoring table.
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute inset-y-0 left-[420px] right-0 overflow-y-auto bg-slate-50 p-6">
                <section className="min-h-[690px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900">Report Monitoring</h2>
                      <p className="mt-1 text-sm font-medium leading-6 text-slate-500">All reports in the system with privacy controls applied</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowExportMonitoring(true)}
                        className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-violet-700"
                      >
                        <FileDown className="h-4 w-4" /> Export
                      </button>
                      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-700">
                        <p className="flex items-center gap-2 text-sm font-extrabold"><Eye className="h-4 w-4" /> Privacy Mode Active</p>
                        <p className="mt-1 text-xs font-semibold text-violet-600">Content hidden for non-escalated reports</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-4">
                    {[
                      { label: "Reports from Parents", value: monitoringTotals.parentReports, tone: "border-sky-100 bg-sky-50 text-sky-700" },
                      { label: "Reports from Students", value: monitoringTotals.studentReports, tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
                      { label: "Escalated to Principal", value: monitoringTotals.escalatedToPrincipal, tone: "border-red-100 bg-red-50 text-red-700" },
                      { label: "Escalated to Guidance", value: monitoringTotals.escalatedToGuidance, tone: "border-violet-100 bg-violet-50 text-violet-700" },
                    ].map((item) => (
                      <div key={item.label} className={`rounded-2xl border px-4 py-3 ${item.tone}`}>
                        <p className="text-[11px] font-extrabold uppercase tracking-wide opacity-75">{item.label}</p>
                        <p className="mt-1 text-2xl font-extrabold">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Categories</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {monitoringCategoryTotals.map((category) => (
                        <span key={category.name} className="rounded-lg border border-violet-100 bg-white px-2.5 py-1 text-xs font-bold text-violet-700">
                          {category.name} ({category.count})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-100">
                    {monitoringEntries.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
                        <Eye className="h-9 w-9 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-400">No monitoring records yet.</p>
                      </div>
                    ) : (
                      <table className="w-full min-w-[760px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            {["Date", "From → To", "Student", "Category", "Priority", "Status"].map((h) => (
                              <th key={h} className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {monitoringEntries.map((entry) => (
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

            </>
          ) : (
            <>
              <div className={panelClass(viewStep === "list", "bg-white", "w-full max-w-[420px]")}>
                {renderTopTabs()}

                <div className="mx-3 h-px bg-slate-100" />

                <div className="space-y-2 px-3 py-3">
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

                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2">
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
                    const hasEscalated = group.reports.some((report) => report.escalatedToPrincipal);

                    return (
                      <button
                        key={group.key}
                        onClick={() => selectParent(group)}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${isActive ? "border-violet-200 bg-violet-50" : hasEscalated ? "border-red-100 bg-red-50 hover:bg-red-100" : "border-slate-100 bg-white hover:bg-slate-50"}`}
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
                          {hasEscalated && !allResolved && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600">
                            <TriangleAlert className="h-3 w-3" />
                            Escalated from Guidance
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={panelClass(showReportsPanel, "bg-white", "w-full max-w-[520px]")}>
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 pb-1 pt-3">
                  <button
                    onClick={() => { setSelectedParent(null); setSelectedReport(null); setViewStep("list"); }}
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
                            const isEscalated = Boolean(report.escalatedToPrincipal);
                            return (
                              <button
                                key={report.id}
                                onClick={() => selectReport(report)}
                                className={`w-full rounded-xl border px-3 py-3 text-left transition ${isActive ? "border-violet-200 bg-violet-50" : isResolvedReport ? "border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50" : isEscalated ? "border-red-100 bg-red-50" : "border-slate-100 bg-white hover:bg-slate-50"}`}
                              >
                                <div className="mb-1.5 flex items-start justify-between gap-2">
                                  <p className="flex-1 text-xs font-bold leading-snug text-slate-800">{report.subject}</p>
                                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${getStatusStyle(report.status)}`}>
                                    {report.status === "Ongoing" ? "On Going" : report.status}
                                  </span>
                                </div>
                                <div className="mb-2 flex flex-wrap gap-1">
                                  {report.categories.map((category) => (
                                    <span key={category} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{category}</span>
                                  ))}
                                </div>
                                {/* ConcernBar removed per UX request */}
                                <div className="mt-1.5 flex items-center justify-between">
                                  {!isResolvedReport && <PriorityBadge level={report.concernLevel} />}
                                </div>
                                <p className="mt-1.5 text-[10px] text-slate-400">{report.submitted_at}</p>
                              </button>
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
                  const isUnlocked = isResolved || unlockedReports.has(selectedReport.id) || selectedReport.status !== "Escalated" || replies.length > 0;

                  if (!isUnlocked) {
                    return (
                      <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="border-b border-slate-100 bg-white px-6 py-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">Pending principal review</span>
                              <h2 className="mt-2 text-base font-extrabold leading-snug text-slate-900">{selectedReport.subject}</h2>
                              <p className="mt-0.5 text-xs text-slate-400">{selectedReport.submitted_at}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {selectedReport.categories.map((category) => (
                                  <span key={category} className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{category}</span>
                                ))}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <PriorityBadge level={selectedReport.concernLevel} large />
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getStatusStyle(selectedReport.status)}`}>{selectedReport.status}</span>
                            </div>
                          </div>
                          <div className="mt-3 max-w-xs">
                            <p className="mb-1 text-[11px] font-semibold text-slate-400">Concern Level</p>
                            <ConcernBar level={selectedReport.concernLevel} />
                          </div>
                        </div>

                        <div className="relative flex-1 overflow-hidden px-6 py-5">
                          <div className="flex flex-col gap-4 blur-[7px] select-none pointer-events-none">
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
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
                            <div className="max-w-xs rounded-2xl border border-slate-200 bg-white px-8 py-7 text-center shadow-xl">
                              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
                                <Shield className="h-7 w-7 text-violet-600" />
                              </div>
                              <p className="mt-3 text-sm font-extrabold text-slate-900">Principal review required</p>
                              <p className="mt-2 text-xs leading-relaxed text-slate-500">Previous parent-guidance conversations stay private. Start a new principal-parent thread to continue.</p>
                              <button
                                onClick={() => unlockReport(selectedReport)}
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-violet-700"
                              >
                                <Eye className="h-4 w-4" /> See the Concern
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-1 flex-col overflow-hidden">
                      <div className={`border-b border-slate-100 bg-white px-6 py-5 ${selectedReport.status === "Escalated" ? "border-l-4 border-l-red-500" : ""}`}>
                        {selectedReport.status === "Escalated" && (
                          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                            <TriangleAlert className="h-4 w-4 shrink-0 text-red-600" />
                            <p className="text-xs font-bold text-red-700">This report has been escalated to the Principal.</p>
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
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            {isResolved ? <ResolvedBadge large /> : <PriorityBadge level={selectedReport.concernLevel} large />}
                            {!isResolved && (
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getStatusStyle(selectedReport.status)}`}>{selectedReport.status}</span>
                            )}
                          </div>
                        </div>
                        {!isResolved && (
                          <div className="mt-3 max-w-xs">
                            <p className="mb-1 text-[11px] font-semibold text-slate-400">Concern Level</p>
                            <ConcernBar level={selectedReport.concernLevel} />
                          </div>
                        )}
                      </div>

                      <div ref={reportMessagesRef} className="flex-1 overflow-y-auto px-6 py-5">
                        {!hasPrincipalReply && (
                          <>
                            <div className="mb-5 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                              <div className="mb-2 flex items-center gap-2">
                                <Shield className="h-4 w-4 text-violet-600" />
                                <p className="text-xs font-extrabold text-violet-800">Principal-parent conversation</p>
                              </div>
                              <p className="text-xs leading-relaxed text-violet-700">The parent-guidance conversation is kept private. The principal can review the summary and continue in this separate thread.</p>
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
                              <UserAvatar name={reply.senderName || (mine ? "Principal" : reply.sender)} src={reply.profilePicture} className="mt-0.5 h-9 w-9 rounded-full" fallbackClassName={mine ? "bg-violet-600" : getAvatarColor(reply.senderName || reply.sender)} />
                              <div className={`flex flex-1 flex-col ${mine ? "items-end" : "items-start"}`}>
                                <div className={`mb-1 flex items-center gap-2 ${mine ? "" : "flex-row-reverse"}`}>
                                  <span className="text-[10px] text-slate-400">{reply.sent_at}</span>
                                  <p className="text-xs font-bold text-slate-800">{mine ? "You" : reply.senderName || reply.sender}</p>
                                  {!mine && reply.senderRole && (
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${principalHistoryRoleStyle(reply.senderRole)}`}>
                                      {reply.senderRole === "adviser" ? "ADVISER" : reply.senderRole === "guidance" ? "GUIDANCE" : reply.senderRole === "principal" ? "PRINCIPAL" : "PARENT"}
                                    </span>
                                  )}
                                </div>
                                {(reply.message || reply.attachments.length > 0) && (
                                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${mine ? "rounded-tr-none bg-violet-600 text-white" : "rounded-tl-none border border-slate-200 bg-white text-slate-700"}`}>
                                    {reply.message && <p className="whitespace-pre-wrap">{reply.message}</p>}
                                    {reply.attachments.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {reply.attachments.map((attachment, attachmentIndex) => (
                                          <a
                                            key={`${attachment.name}-${attachmentIndex}`}
                                            href={attachment.dataUrl}
                                            download={attachment.name}
                                            className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                                          >
                                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                            <span className="max-w-[180px] truncate">{attachment.name}</span>
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="border-t border-slate-100 bg-white px-6 py-4">
                        <div className="mb-4 flex flex-wrap gap-2">
                          {selectedReport.status !== "Resolved" && (
                            <button
                              onClick={() => markReportStatus(selectedReport.id, "Resolved")}
                              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Resolve
                            </button>
                          )}
                        </div>

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
                        ) : <div className="flex items-end gap-3">
                          <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                            <textarea
                              value={replyText}
                              onChange={(event) => setReplyText(event.target.value)}
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
                            disabled={isResolved || (!replyText.trim() && replyAttachments.length === 0)}
                            className={`rounded-xl p-2.5 transition ${!isResolved && (replyText.trim() || replyAttachments.length > 0) ? "bg-violet-600 text-white hover:bg-violet-700" : "cursor-not-allowed bg-slate-100 text-slate-300"}`}
                          >
                            <Send className="h-4 w-4" />
                          </button>
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
          mode={mainTab === "Messages" ? "message" : "concern"}
          onClose={() => setShowNewMessage(false)}
          onMessageSent={handleNewMessageSent}
          staffRecipients={staffRecipients}
          parentRecipients={parentRecipients}
        />
      )}
      {showExportMonitoring && <ExportMonitoringModal items={monitoringEntries} onClose={() => setShowExportMonitoring(false)} />}
    </div>
  );
}
