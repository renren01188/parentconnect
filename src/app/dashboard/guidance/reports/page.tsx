"use client";

import ExcelJS from "exceljs";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
    CheckCircle, Eye,
    ChevronRight, Paperclip, Send, MessageSquare,
    Search, TriangleAlert, Upload, FileDown,
    User, X, Shield, TrendingUp, LoaderCircle,
} from "lucide-react";
import {
    type Report, type ReportStatus,
    type AdminMessage, type AdminMsgStatus,
    type MessageAttachment,
} from "../../adviser/data";
import { useNotifContext } from "../context/NotificationContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/* eslint-disable react-hooks/exhaustive-deps */

// ── Types (local only) ────────────────────────────────────────────────────────
interface ParentGroup {
    parent_name: string;
    student_name: string;
    initials: string;
    reports: Report[];
    unread: number;
    maxConcernLevel: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string) {
    const parts = name.replace(/'s Parent/i, "").trim().split(" ");
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}
function getAvatarColor(name: string) {
    const colors = ["bg-sky-500", "bg-blue-500", "bg-sky-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
}
function getStatusStyle(status: ReportStatus | "ResolvedByPrincipal") {
    switch (status) {
        case "New": return "bg-sky-500 text-white";
        case "Read": return "bg-slate-200 text-slate-600";
        case "Ongoing": return "bg-blue-100 text-blue-600";
        case "Resolved": return "bg-sky-100 text-sky-700";
        case "Escalated": return "bg-red-100 text-red-600";
        case "ResolvedByPrincipal": return "bg-violet-100 text-violet-700";
    }
}
function getAdminMsgStatusStyle(status: AdminMsgStatus) {
    switch (status) {
        case "New": return "bg-sky-500 text-white";
        case "Read": return "bg-slate-200 text-slate-600";
        case "Replied": return "bg-sky-100 text-sky-700";
    }
}
function PriorityBadge({ level, large = false }: { level: number; large?: boolean }) {
    const px = large ? "px-3 py-1.5" : "px-2 py-0.5";
    const fs = large ? "text-sm" : "text-[11px]";
    if (level >= 100) return <span className={`${px} ${fs} font-extrabold rounded-lg bg-red-600 text-white flex items-center gap-1`}>🔴 Urgent / Serious</span>;
    if (level >= 75) return <span className={`${px} ${fs} font-extrabold rounded-lg bg-orange-500 text-white flex items-center gap-1`}>🟠 High Priority</span>;
    if (level >= 50) return <span className={`${px} ${fs} font-extrabold rounded-lg bg-yellow-400 text-white flex items-center gap-1`}>🟡 Medium Priority</span>;
    return <span className={`${px} ${fs} font-extrabold rounded-lg bg-sky-500 text-white flex items-center gap-1`}>🟢 Low Priority</span>;
}
function StatusSummaryPills({ reports }: { reports: Report[] }) {
    const counts: Partial<Record<ReportStatus, number>> = {};
    reports.forEach((r) => { counts[r.status] = (counts[r.status] ?? 0) + 1; });
    const config: Record<ReportStatus, { dot: string; cls: string }> = {
        New: { dot: "bg-sky-500", cls: "bg-sky-50 text-sky-800 border border-sky-200" },
        Read: { dot: "bg-slate-400", cls: "bg-slate-50 text-slate-700 border border-slate-200" },
        Ongoing: { dot: "bg-amber-400", cls: "bg-amber-50 text-amber-800 border border-amber-200" },
        Escalated: { dot: "bg-rose-500", cls: "bg-rose-50 text-rose-800 border border-rose-200" },
        Resolved: { dot: "bg-emerald-400", cls: "bg-emerald-50 text-emerald-800 border border-emerald-200" },
    };
    return (
        <div className="flex flex-wrap gap-1 mt-1.5">
            {(["Escalated", "Ongoing", "New", "Read", "Resolved"] as ReportStatus[])
                .filter((s) => counts[s])
                .map((s) => (
                    <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config[s].cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${config[s].dot}`} />
                        {counts[s]} {s}
                    </span>
                ))}
        </div>
    );
}

function ConcernBar({ level }: { level: number }) {
    const color = level >= 100 ? "#dc2626" : level >= 75 ? "#f97316" : level >= 50 ? "#eab308" : "#10b981";
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                <div style={{ width: `${level}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 34, textAlign: "right" }}>{level}%</span>
        </div>
    );
}

function groupByParent(reports: Report[]): ParentGroup[] {
    const map: Record<string, ParentGroup> = {};
    for (const r of reports) {
        if (!map[r.parent_name]) {
            map[r.parent_name] = { parent_name: r.parent_name, student_name: r.student_name, initials: getInitials(r.parent_name), reports: [], unread: 0, maxConcernLevel: 0 };
        }
        map[r.parent_name].reports.push(r);
        if (r.hasUnreadForGuidance) map[r.parent_name].unread++;
        if (r.concernLevel > map[r.parent_name].maxConcernLevel) map[r.parent_name].maxConcernLevel = r.concernLevel;
    }
    for (const g of Object.values(map)) {
        g.reports.sort((a, b) => b.concernLevel - a.concernLevel);
    }
    return Object.values(map);
}
type FilterTab = "All" | "Pending" | "Ongoing" | "Escalated";
type LeftTab = "Parent" | "Principal";
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

const ADVISER_CATEGORIES: { name: string; pct: number }[] = [
    { name: "Academic Concern", pct: 100 },
    { name: "Health/Medical", pct: 90 },
    { name: "Behavioral Issue", pct: 80 },
    { name: "Attendance", pct: 75 },
    { name: "Other", pct: 50 },
    { name: "Permission Request", pct: 35 },
    { name: "General Inquiry", pct: 15 },
];
function computeAdviserLevel(cats: string[]): number {
    const total = ADVISER_CATEGORIES.filter(c => cats.includes(c.name)).reduce((s, c) => s + c.pct, 0);
    return Math.min(100, total);
}

type StaffRecipient = { id: string; name: string; email: string; role: string; type: "staff"; grade?: string; section?: string };
type ParentRecipient = { id: string; name: string; actualParentName?: string; student: string; gradeLevel: string; section: string; type: "parent" };
type Recipient = StaffRecipient | ParentRecipient;
type NewMessagePayload = {
    recipient: Recipient;
    subject: string;
    categories: string[];
    body: string;
    attachments: MessageAttachment[];
};

function RecipientAvatar({ r }: { r: Recipient }) {
    if (r.type === "staff") {
        return (
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-sky-600">
                <Shield className="w-4 h-4 text-white" />
            </div>
        );
    }
    return (
        <div className={`w-8 h-8 rounded-full ${getAvatarColor(r.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
            {getInitials(r.name)}
        </div>
    );
}

type ExportFormat = "excel" | "pdf";
type ExportScope = "all" | "specific";

function safeFilePart(value: string) {
    return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "guidance_reports";
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function reportExportRows(items: Report[]) {
    return items.map((report) => ({
        id: report.id,
        parent: report.parent_name,
        student: report.student_name,
        subject: report.subject,
        categories: report.categories.join(", "),
        concernLevel: `${report.concernLevel}%`,
        status: report.status,
        submittedAt: report.submitted_at,
        attachment: report.attachment ?? "None",
        message: report.message,
    }));
}

async function exportReportsToExcel(items: Report[], filename: string) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "ParentConnect";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Guidance Reports");
    sheet.columns = [
        { header: "ID", key: "id", width: 8 },
        { header: "Parent", key: "parent", width: 28 },
        { header: "Student", key: "student", width: 24 },
        { header: "Subject", key: "subject", width: 36 },
        { header: "Categories", key: "categories", width: 34 },
        { header: "Concern Level", key: "concernLevel", width: 16 },
        { header: "Status", key: "status", width: 14 },
        { header: "Submitted At", key: "submittedAt", width: 24 },
        { header: "Attachment", key: "attachment", width: 20 },
        { header: "Message", key: "message", width: 64 },
    ];
    sheet.addRows(reportExportRows(items));

    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0284C7" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 22;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.eachRow((row) => {
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

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${filename}.xlsx`,
    );
}

function pdfSafe(value: string) {
    return value
        .replace(/[\\()]/g, "\\$&")
        .replace(/[^\x20-\x7E]/g, " ");
}

function wrapPdfText(value: string, maxLength = 92) {
    const words = value.replace(/\s+/g, " ").trim().split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > maxLength && line) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

function makePdfText(text: string, x: number, y: number, size = 10, bold = false) {
    return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfSafe(text)}) Tj ET`;
}

function makePdfLine(x1: number, y1: number, x2: number, y2: number, gray = 0.82) {
    return `q ${gray} G ${x1} ${y1} m ${x2} ${y2} l S Q`;
}

function makePdfRect(x: number, y: number, width: number, height: number, gray = 0.96) {
    return `q ${gray} g ${x} ${y} ${width} ${height} re f Q`;
}

function createGuidanceReportsPdf(items: Report[]) {
    const pageWidth = 612;
    const pageHeight = 792;
    const left = 44;
    const right = 568;
    const pages: string[][] = [];
    let commands: string[] = [];
    let y = 0;

    function startPage() {
        commands = [];
        pages.push(commands);
        commands.push(makePdfRect(0, pageHeight - 64, pageWidth, 64, 0.93));
        commands.push(makePdfText("ParentConnect", left, 758, 9, true));
        commands.push(makePdfText("Guidance Reports Export", left, 738, 18, true));
        commands.push(makePdfText("Santiago Elementary - Guidance Office", left, 722, 10));
        commands.push(makePdfText(`Generated: ${new Date().toLocaleString()}`, 386, 746, 9));
        y = 688;
    }

    function finishDocumentObjects() {
        pages.forEach((page, index) => {
            page.push(makePdfLine(left, 46, right, 46, 0.82));
            page.push(makePdfText(`Page ${index + 1} of ${pages.length}`, 500, 28, 8));
            page.push(makePdfText("Confidential guidance concern export", left, 28, 8));
        });

        const objects: string[] = [];
        objects.push("<< /Type /Catalog /Pages 2 0 R >>");
        const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
        objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

        pages.forEach((page, index) => {
            const pageObj = 3 + index * 2;
            const contentObj = pageObj + 1;
            objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> /Contents ${contentObj} 0 R >>`);
            const body = page.join("\n");
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

    function ensureSpace(height: number) {
        if (y - height < 76) startPage();
    }

    startPage();
    commands.push(makePdfText("Export Summary", left, y, 12, true));
    y -= 18;
    commands.push(makePdfRect(left, y - 24, right - left, 36, 0.97));
    commands.push(makePdfText("Total Concerns", left + 14, y - 2, 9, true));
    commands.push(makePdfText(String(items.length), left + 14, y - 17, 12, true));
    commands.push(makePdfText("Included Scope", left + 150, y - 2, 9, true));
    commands.push(makePdfText(items.length === 1 ? "Specific concern" : "All concerns", left + 150, y - 17, 10));
    commands.push(makePdfText("Export Format", left + 330, y - 2, 9, true));
    commands.push(makePdfText("PDF", left + 330, y - 17, 10));
    y -= 58;

    items.forEach((report, index) => {
        const messageLines = wrapPdfText(report.message, 86);
        const cardHeight = 132 + messageLines.length * 11;
        ensureSpace(cardHeight);

        commands.push(makePdfRect(left, y - cardHeight + 10, right - left, cardHeight, 0.985));
        commands.push(makePdfRect(left, y - 18, right - left, 28, 0.91));
        commands.push(makePdfText(`${index + 1}. ${report.subject}`, left + 14, y - 8, 11, true));
        commands.push(makePdfText(report.status, right - 90, y - 8, 9, true));
        y -= 40;

        const labelX = left + 14;
        const valueX = left + 112;
        const secondLabelX = left + 310;
        const secondValueX = left + 408;
        const rowGap = 16;

        commands.push(makePdfText("Parent", labelX, y, 9, true));
        commands.push(makePdfText(report.parent_name, valueX, y, 9));
        commands.push(makePdfText("Student", secondLabelX, y, 9, true));
        commands.push(makePdfText(report.student_name, secondValueX, y, 9));
        y -= rowGap;
        commands.push(makePdfText("Submitted", labelX, y, 9, true));
        commands.push(makePdfText(report.submitted_at, valueX, y, 9));
        commands.push(makePdfText("Concern Level", secondLabelX, y, 9, true));
        commands.push(makePdfText(`${report.concernLevel}%`, secondValueX, y, 9));
        y -= rowGap;
        commands.push(makePdfText("Categories", labelX, y, 9, true));
        commands.push(makePdfText(report.categories.join(", "), valueX, y, 9));
        y -= rowGap;
        commands.push(makePdfText("Attachment", labelX, y, 9, true));
        commands.push(makePdfText(report.attachment ?? "None", valueX, y, 9));
        y -= 20;
        commands.push(makePdfLine(left + 14, y + 8, right - 14, y + 8, 0.86));
        commands.push(makePdfText("Concern Message", labelX, y - 6, 9, true));
        y -= 22;
        messageLines.forEach((line) => {
            commands.push(makePdfText(line, labelX, y, 9));
            y -= 11;
        });
        y -= 18;
    });

    return finishDocumentObjects();
}

function exportReportsToPdf(items: Report[], filename: string) {
    downloadBlob(createGuidanceReportsPdf(items), `${filename}.pdf`);
}

function ExportReportsModal({
    reports,
    selectedReport,
    onClose,
}: {
    reports: Report[];
    selectedReport: Report | null;
    onClose: () => void;
}) {
    const [format, setFormat] = useState<ExportFormat>("excel");
    const [scope, setScope] = useState<ExportScope>("all");
    const [reportId, setReportId] = useState<number>(selectedReport?.id ?? reports[0]?.id ?? 0);
    const [exporting, setExporting] = useState(false);
    const selectedExportReport = reports.find((report) => report.id === reportId) ?? null;
    const canExport = scope === "all" ? reports.length > 0 : !!selectedExportReport;

    async function handleExport() {
        if (!canExport) return;
        setExporting(true);
        const items = scope === "all" ? reports : selectedExportReport ? [selectedExportReport] : [];
        const baseName = scope === "all"
            ? `guidance_all_concerns_${new Date().toISOString().slice(0, 10)}`
            : `guidance_concern_${safeFilePart(selectedExportReport?.subject ?? "selected")}`;

        try {
            if (format === "excel") await exportReportsToExcel(items, baseName);
            else exportReportsToPdf(items, baseName);
            onClose();
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-5" onClick={onClose}>
            <div className="w-full max-w-[520px] rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-900">Export Concerns</h2>
                        <p className="text-sm text-slate-400 mt-1">Choose a file type and which concern records to include.</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400" aria-label="Close export modal">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-5">
                    <div>
                        <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wide mb-2">File Type</p>
                        <div className="grid grid-cols-2 gap-2">
                            {(["excel", "pdf"] as ExportFormat[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setFormat(item)}
                                    className={`px-4 py-3 rounded-xl border text-sm font-bold transition ${format === item ? "border-sky-300 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                >
                                    {item === "excel" ? "Excel (.xlsx)" : "PDF (.pdf)"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wide mb-2">Export Scope</p>
                        <div className="grid grid-cols-2 gap-2">
                            {(["all", "specific"] as ExportScope[]).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setScope(item)}
                                    className={`px-4 py-3 rounded-xl border text-sm font-bold transition ${scope === item ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                                >
                                    {item === "all" ? `All Concerns (${reports.length})` : "Specific Concern"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {scope === "specific" && (
                        <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-slate-700">Concern</span>
                            <select
                                value={reportId}
                                onChange={(event) => setReportId(Number(event.target.value))}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                            >
                                {reports.map((report) => (
                                    <option key={report.id} value={report.id}>
                                        {report.parent_name} - {report.subject}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">
                            {scope === "all"
                                ? `This will export all ${reports.length} guidance concern records.`
                                : selectedExportReport
                                    ? `This will export: ${selectedExportReport.subject}`
                                    : "Choose a concern to export."}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50 transition">Cancel</button>
                    <button
                        onClick={handleExport}
                        disabled={!canExport || exporting}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition ${canExport && !exporting ? "bg-sky-500 hover:bg-sky-600" : "bg-sky-300 cursor-not-allowed"}`}
                    >
                        <FileDown className="w-4 h-4" />
                        {exporting ? "Exporting..." : "Export"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── New Message Modal ─────────────────────────────────────────────────────────
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
    const [staffSearch, setStaffSearch] = useState("");
    const [subject, setSubject] = useState("");
    const [selectedCats, setSelectedCats] = useState<string[]>([]);
    const [otherText, setOtherText] = useState("");
    const [message, setMessage] = useState("");
    const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const recipientRef = useRef<HTMLDivElement>(null);
    const allRecipients: Recipient[] = [...staffRecipients, ...parentRecipients];
    const selectedRecipient = allRecipients.find(r => r.id === recipientId);
    const principalRecipients = staffRecipients.filter((recipient) => recipient.role === "Principal");
    const schoolStaffRecipients = staffRecipients.filter((recipient) => recipient.role !== "Principal" && recipient.role !== "ICT");
    const filteredSchoolStaff = schoolStaffRecipients.filter((r) => {
        const q = staffSearch.trim().toLowerCase();
        return !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.role.toLowerCase().includes(q);
    });
    const gradeLevels = Array.from(new Set(parentRecipients.map((parent) => parent.gradeLevel).filter(Boolean))).sort();
    const availableSections = Array.from(new Set(parentRecipients.filter((parent) => parent.gradeLevel === gradeLevel).map((parent) => parent.section))).sort();
    const filteredParents = parentRecipients.filter((parent) => {
        const query = parentSearch.trim().toLowerCase();
        return parent.gradeLevel === gradeLevel &&
            parent.section === section &&
            (!query || parent.name.toLowerCase().includes(query) || parent.student.toLowerCase().includes(query));
    });
    const concernLevel = computeAdviserLevel(selectedCats);
    const otherSelected = selectedCats.includes("Other");
    const canSubmit = recipientId && subject.trim() && selectedCats.length > 0 && (message.trim() || attachments.length > 0) && (!otherSelected || otherText.trim()) && !sending;
    function toggleCat(name: string) { setSelectedCats(p => p.includes(name) ? p.filter(c => c !== name) : [...p, name]); }
    const barColor = concernLevel >= 100 ? "#ef4444" : concernLevel >= 75 ? "#f97316" : concernLevel >= 50 ? "#eab308" : "#10b981";

    useEffect(() => {
        function h(e: MouseEvent) { if (recipientOpen && recipientRef.current && !recipientRef.current.contains(e.target as Node)) setRecipientOpen(false); }
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [recipientOpen]);
    useEffect(() => {
        function h(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);
    async function handleSubmit() {
        if (!canSubmit || !selectedRecipient) return;
        try {
            setSending(true);
            setSubmitError("");
            const finalCategories = selectedCats.map(cat => cat === "Other" && otherText.trim() ? `Other: ${otherText.trim()}` : cat);
            if (onMessageSent) {
                await onMessageSent({
                    recipient: selectedRecipient,
                    subject: subject.trim(),
                    categories: finalCategories,
                    body: message.trim(),
                    attachments,
                });
            } else {
                const res = await fetch("/api/reports/staff-messages", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        role: "guidance",
                        recipientId,
                        subject: subject.trim(),
                        categories: finalCategories,
                        message: message.trim(),
                        attachments,
                    }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.message || "Unable to send message.");
            }
            setSubmitted(true);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "Unable to send message.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-start justify-end p-5" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[calc(100vh-40px)] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-900">New Message</h2>
                        <p className="text-sm text-slate-400 mt-1">Send a message about an escalated case</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400"><X className="w-4 h-4" /></button>
                </div>
                {submitted ? (
                    <div className="flex flex-col items-center gap-3 py-10 px-6">
                        <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center"><CheckCircle className="w-7 h-7 text-sky-500" /></div>
                        <p className="text-base font-bold text-slate-900">Message Sent!</p>
                        <p className="text-sm text-slate-400 text-center">Your message has been sent to {selectedRecipient?.name}.</p>
                        <button onClick={onClose} className="mt-2 px-7 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold transition">Done</button>
                    </div>
                ) : (
                    <div className="px-6 py-5 flex flex-col gap-5">
                        {submitError && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700">
                                {submitError}
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Send To <span className="text-red-500">*</span></label>
                            <div className="relative" ref={recipientRef}>
                                <button type="button" onClick={() => setRecipientOpen(p => !p)}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-left hover:border-sky-300 transition">
                                    {selectedRecipient ? (
                                        <><RecipientAvatar r={selectedRecipient} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{selectedRecipient.name}</p>
                                                <p className="text-xs text-slate-400 truncate">
                                                    {selectedRecipient.type === "staff"
                                                        ? `${selectedRecipient.role} - ${selectedRecipient.email}`
                                                        : `Student: ${selectedRecipient.student} · ${selectedRecipient.gradeLevel}, ${selectedRecipient.section}`}
                                                </p>
                                            </div></>
                                    ) : <p className="text-sm text-slate-400 flex-1">Select a recipient...</p>}
                                    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${recipientOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {recipientOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Principal</p></div>
                                        {principalRecipients.length === 0 && <p className="px-3.5 py-3 text-xs font-semibold text-slate-400">No principal account found.</p>}
                                        {principalRecipients.map(r => (
                                            <button key={r.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === r.id ? "bg-sky-50" : ""}`}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-violet-600">
                                                    <Shield className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p><p className="text-xs text-slate-400 truncate">{r.email}</p></div>
                                                {recipientId === r.id && <CheckCircle className="w-4 h-4 text-sky-500 ml-auto shrink-0" />}
                                            </button>
                                        ))}

                                        <div className="px-3 py-2 bg-slate-50 border-t border-b border-slate-100">
                                            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">School Staff</p>
                                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                                                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <input
                                                    value={staffSearch}
                                                    onChange={(e) => setStaffSearch(e.target.value)}
                                                    placeholder="Search staff by name, role..."
                                                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                                                />
                                                {staffSearch && (
                                                    <button type="button" onClick={() => setStaffSearch("")} className="text-slate-400 hover:text-slate-600">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {filteredSchoolStaff.length === 0 && (
                                            <p className="px-3.5 py-3 text-xs font-semibold text-slate-400">
                                                {staffSearch ? "No staff match your search." : "No school staff accounts found."}
                                            </p>
                                        )}
                                        {filteredSchoolStaff.map(r => (
                                            <button key={r.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === r.id ? "bg-sky-50" : ""}`}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-sky-600">
                                                    <Shield className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p><p className="text-xs text-slate-400 truncate">{r.role} - {r.email}</p></div>
                                                {recipientId === r.id && <CheckCircle className="w-4 h-4 text-sky-500 ml-auto shrink-0" />}
                                            </button>
                                        ))}
                                        <div className="px-3 py-2 bg-slate-50 border-t border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Parents</p></div>
                                        <div className="p-3 border-b border-slate-100 bg-white flex flex-col gap-2.5">
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Grade Level</span>
                                                    <select
                                                        value={gradeLevel}
                                                        onChange={(e) => {
                                                            setGradeLevel(e.target.value);
                                                            setSection("");
                                                            if (selectedRecipient?.type === "parent") setRecipientId("");
                                                        }}
                                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                                    >
                                                        <option value="">Choose grade</option>
                                                        {gradeLevels.map((grade) => (
                                                            <option key={grade} value={grade}>{grade}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Section</span>
                                                    <select
                                                        value={section}
                                                        onChange={(e) => {
                                                            setSection(e.target.value);
                                                            if (selectedRecipient?.type === "parent") setRecipientId("");
                                                        }}
                                                        disabled={!gradeLevel}
                                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-300"
                                                    >
                                                        <option value="">Choose section</option>
                                                        {availableSections.map((item) => (
                                                            <option key={item} value={item}>{item}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                                                <Search className="w-3.5 h-3.5 text-slate-400" />
                                                <input
                                                    value={parentSearch}
                                                    onChange={(e) => setParentSearch(e.target.value)}
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
                                                filteredParents.map(p => (
                                                    <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(p.id); setRecipientOpen(false); }}
                                                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === p.id ? "bg-sky-50" : ""}`}>
                                                        <div className={`w-8 h-8 rounded-full ${getAvatarColor(p.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{getInitials(p.name)}</div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                                                            <p className="text-xs text-slate-400 truncate">Student: {p.student} · {p.gradeLevel}, {p.section}</p>
                                                        </div>
                                                        {recipientId === p.id && <CheckCircle className="w-4 h-4 text-sky-500 ml-auto shrink-0" />}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Subject <span className="text-red-500">*</span></label>
                            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter subject..."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Concern Categories <span className="text-red-500">*</span> <span className="text-slate-400 font-normal text-[11px]">Select all that apply</span></label>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {ADVISER_CATEGORIES.map(cat => {
                                    const checked = selectedCats.includes(cat.name);
                                    return (
                                        <button key={cat.name} type="button" onClick={() => toggleCat(cat.name)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition"
                                            style={{ border: checked ? "2px solid #10b981" : "1.5px solid #e2e8f0", background: checked ? "#ecfdf5" : "#fff", color: checked ? "#065f46" : "#64748b" }}>
                                            <span style={{ width: 13, height: 13, minWidth: 13, borderRadius: 3, border: `2px solid ${checked ? "#10b981" : "#cbd5e1"}`, background: checked ? "#10b981" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                {checked && <span style={{ width: 6, height: 6, background: "#fff", borderRadius: 1, display: "block" }} />}
                                            </span>
                                            {cat.name}
                                        </button>
                                    );
                                })}
                            </div>
                            {/* "Other" — type your concern */}
                            {otherSelected && (
                                <div className="mb-3">
                                    <input
                                        type="text"
                                        value={otherText}
                                        onChange={e => setOtherText(e.target.value)}
                                        placeholder="Please describe your concern..."
                                        autoFocus
                                        className="w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition"
                                        style={{ border: "1.5px solid #10b981", background: "#ecfdf5", color: "#065f46" }}
                                    />
                                </div>
                            )}
                            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                <div className="flex justify-between mb-1.5">
                                    <span className="text-[11px] font-bold text-slate-500">Concern Level</span>
                                </div>
                                <div style={{ height: 7, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
                                    <div style={{ width: `${concernLevel}%`, height: "100%", background: barColor, borderRadius: 4, transition: "width 0.3s" }} />
                                </div>
                                {concernLevel >= 100 && <p className="text-[11px] text-red-500 font-semibold mt-1">⚠ Maximum concern level reached</p>}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Message <span className="text-red-500">*</span></label>
                            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message..." rows={5}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 resize-none outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 transition" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Attachments</label>
                            <label className="relative border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-sky-300 hover:bg-sky-50/30 transition overflow-hidden">
                                <Upload className="w-6 h-6 text-slate-300" />
                                <p className="text-sm font-medium text-slate-500">Click to upload or drag and drop</p>
                                <p className="text-xs text-slate-400">PDF, DOC, DOCX, JPG, PNG (max. 10MB)</p>
                                <input
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    className="absolute inset-0 cursor-pointer opacity-0"
                                    onChange={async (event) => {
                                        const captured = Array.from(event.target.files ?? []);
                                        event.target.value = "";
                                        if (captured.length > 0) {
                                            const nextAttachments = await filesToAttachments(captured);
                                            setAttachments(prev => [...prev, ...nextAttachments].slice(0, 5));
                                        }
                                    }}
                                />
                            </label>
                            {attachments.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {attachments.map((attachment, index) => (
                                        <button
                                            key={`${attachment.name}-${index}`}
                                            type="button"
                                            onClick={() => setAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                                            className="flex max-w-[180px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                                        >
                                            <Paperclip className="w-3 h-3 text-slate-400" />
                                            <span className="truncate">{attachment.name}</span>
                                            <X className="w-3 h-3 text-slate-400" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">Cancel</button>
                            <button onClick={handleSubmit} disabled={!canSubmit}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition ${canSubmit ? "bg-sky-500 hover:bg-sky-600" : "bg-sky-300 cursor-not-allowed"}`}>
                                <Send className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Send Message"}
                            </button>
                        </div> {/* end SLIDE 3 */}
                    </div>
                )}
            </div> {/* end slide container */}
        </div>
    );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function ReportsPage() {
    const searchParams = useSearchParams();
    const { setUnreadCount, setEscalatedCount } = useNotifContext();

    // ── State ──────────────────────────────────────────────────────────────
    const [leftTab, setLeftTab] = useState<LeftTab>("Parent");
    const [filterTab, setFilterTab] = useState<FilterTab>("All");
    const [categoryFilter, setCategoryFilter] = useState<string>("All");
    const [selectedParent, setSelectedParent] = useState<ParentGroup | null>(null);
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [selectedAdminMsg, setSelectedAdminMsg] = useState<AdminMessage | null>(null);
    const [replyText, setReplyText] = useState("");
    const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
    const [showNewMessage, setShowNewMessage] = useState(false);
    const [escalateTarget, setEscalateTarget] = useState<Report | null>(null);
    const [escalateSuccess, setEscalateSuccess] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    // Panel navigation: "list" = Panel1 visible, "reports" = Panel2, "detail" = Panel3
    const [viewStep, setViewStep] = useState<"list" | "reports" | "detail">("list");

    // Local mutable copies of data
    const [reports, setReports] = useState<Report[]>([]);
    const [adminMsgs, setAdminMsgs] = useState<AdminMessage[]>([]);
    const [staffRecipients, setStaffRecipients] = useState<StaffRecipient[]>([]);
    const [parentRecipients, setParentRecipients] = useState<ParentRecipient[]>([]);
    const [principalEscalated, setPrincipalEscalated] = useState<Record<number, boolean>>({});
    const [guidanceReplies, setGuidanceReplies] = useState<Record<number, { sender: string; message: string; sent_at: string; attachments?: MessageAttachment[] }[]>>({});
    const parentMessagesRef = useRef<HTMLDivElement>(null);
    const adminMessagesRef = useRef<HTMLDivElement>(null);
    const parentWasNearBottomRef = useRef(true);
    const adminWasNearBottomRef = useRef(true);
    const forceParentScrollRef = useRef(false);
    const forceAdminScrollRef = useRef(false);

    // Guidance escalation local state (keyed by report id)
    const [guidanceEscalated, setGuidanceEscalated] = useState<Record<number, boolean>>({});

    async function loadGuidanceReports() {
        const res = await fetch("/api/reports/parent-adviser?role=guidance", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Unable to load guidance reports.");
        const nextReports = (data?.reports ?? []) as Report[];
        setReports(nextReports);
        setGuidanceEscalated(Object.fromEntries(nextReports.map((report) => [report.id, report.escalatedToGuidance ?? false])));
        setPrincipalEscalated(Object.fromEntries(nextReports.map((report) => [report.id, report.escalatedToPrincipal ?? false])));
        setUnlockedReports((prev) => {
            const next = new Set(prev);
            nextReports.forEach((report) => {
                if (report.guidanceSeen || report.status !== "Escalated") next.add(report.id);
            });
            return next;
        });
        setGuidanceReplies(Object.fromEntries(nextReports.map((report) => [
            report.id,
            (report.replies ?? []).filter((reply) => reply.sender === "Guidance" || reply.sender === report.parent_name),
        ])));
        setSelectedReport((current) => current ? nextReports.find((report) => report.id === current.id) ?? null : null);
        setSelectedParent((current) => {
            if (!current) return current;
            return groupByParent(nextReports).find((group) => group.parent_name === current.parent_name) ?? current;
        });
    }

    async function loadGuidanceStaffMessages() {
        const res = await fetch("/api/reports/staff-messages?role=guidance", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Unable to load staff messages.");
        setAdminMsgs(((data?.messages ?? []) as AdminMessage[]).filter(
            (message) => message.sender !== "ICT" && message.message_sender !== "ICT"
        ));
        setStaffRecipients(((data?.recipients ?? []) as StaffRecipient[])
            .filter((recipient) => recipient.type === "staff" && recipient.role !== "ICT" && ["Adviser", "Guidance", "Principal"].includes(recipient.role))
            .filter((recipient, index, list) => list.findIndex((item) => item.id === recipient.id) === index));
        setParentRecipients(((data?.parents ?? []) as ParentRecipient[])
            .map((parent) => ({
                ...parent,
                gradeLevel: parent.gradeLevel || "No grade level",
                section: parent.section || "No section",
            }))
            .filter((parent, index, list) => list.findIndex((item) => item.id === parent.id) === index));
        setSelectedAdminMsg(current => current
            ? ((data?.messages ?? []) as AdminMessage[]).find(message => (message.conversationId ?? String(message.id)) === (current.conversationId ?? String(current.id))) ?? current
            : current
        );
    }

    async function openNewMessageModal() {
        setShowNewMessage(true);
        await loadGuidanceStaffMessages().catch((error) => console.error("Unable to refresh guidance recipients:", error));
    }

    useEffect(() => {
        loadGuidanceReports().catch((error) => console.error("Unable to load guidance reports:", error));
        loadGuidanceStaffMessages().catch((error) => console.error("Unable to load guidance staff messages:", error));
        const client = supabaseBrowser;
        if (!client) return;
        const channel = client
            .channel("guidance-report-updates")
            .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => {
                loadGuidanceReports().catch(() => null);
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_report_messages" }, () => {
                loadGuidanceReports().catch(() => null);
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
                loadGuidanceStaffMessages().catch(() => null);
            })
            .subscribe();
        return () => {
            client.removeChannel(channel);
        };
    }, []);

    // All categories across escalated parent reports (for dropdown)
    const allReportCategories = Array.from(
        new Set(reports.flatMap(r => r.categories))
    ).sort();

    // Tracks which reports the adviser has explicitly unlocked (clicked "See the concern")
    const [unlockedReports, setUnlockedReports] = useState<Set<number>>(new Set());

    // ── Handle deep-link from notification ───────────────────────────────
    useEffect(() => {
        const rawTab = searchParams.get("tab");
        const tab = rawTab === "Parent" || rawTab === "Principal" ? rawTab : null;
        const name = searchParams.get("parent");
        if (tab) setLeftTab(tab);
        if (name) {
            const groups = groupByParent(reports);
            const g = groups.find(g => g.parent_name === name);
            if (g) { setSelectedParent(g); setSelectedReport(g.reports[0] ?? null); setViewStep("detail"); }
        }
    }, [searchParams]);

    // ── Keep sidebar Reports badge live ───────────────────────────────────
    useEffect(() => {
        const newParent = reports.filter(r => r.hasUnreadForGuidance).length;
        const newPrincipal = adminMsgs.filter(m => m.status === "New").length;
        setUnreadCount(newParent + newPrincipal);
        setEscalatedCount(reports.filter(r => r.status === "Escalated").length);
    }, [reports, adminMsgs, setUnreadCount, setEscalatedCount]);

    // ── Derived data ──────────────────────────────────────────────────────
    const parentGroups = groupByParent(reports)
        .sort((a, b) => b.maxConcernLevel - a.maxConcernLevel);

    const principalMsgs = adminMsgs;
    const selectedReportId = selectedReport?.id ?? null;
    const selectedReportReplies = selectedReportId ? (guidanceReplies[selectedReportId] ?? []) : [];
    const selectedReportReplyCount = selectedReportReplies.length;
    const selectedReportLastReply = selectedReportReplies.at(-1);
    const selectedAdminConversationId = selectedAdminMsg?.conversationId ?? String(selectedAdminMsg?.id ?? "");
    const selectedAdminReplyCount = selectedAdminMsg?.replies?.length ?? 0;
    const selectedAdminLastReply = selectedAdminMsg?.replies?.at(-1);

    function isNearBottom(element: HTMLDivElement) {
        return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    }

    function scrollContainerToBottom(ref: { current: HTMLDivElement | null }, behavior: ScrollBehavior = "smooth") {
        requestAnimationFrame(() => {
            const element = ref.current;
            if (!element) return;
            element.scrollTo({ top: element.scrollHeight, behavior });
        });
    }

    function handleParentMessagesScroll() {
        const element = parentMessagesRef.current;
        if (element) parentWasNearBottomRef.current = isNearBottom(element);
    }

    function handleAdminMessagesScroll() {
        const element = adminMessagesRef.current;
        if (element) adminWasNearBottomRef.current = isNearBottom(element);
    }

    useEffect(() => {
        if (leftTab !== "Parent" || !selectedReportId) return;
        const shouldScroll =
            forceParentScrollRef.current ||
            parentWasNearBottomRef.current ||
            selectedReportLastReply?.sender === "Guidance";

        if (shouldScroll) scrollContainerToBottom(parentMessagesRef);
        forceParentScrollRef.current = false;
    }, [leftTab, selectedReportId, selectedReportReplyCount, selectedReportLastReply?.sent_at, selectedReportLastReply?.sender]);

    useEffect(() => {
        if (leftTab !== "Principal" || !selectedAdminMsg) return;
        const shouldScroll =
            forceAdminScrollRef.current ||
            adminWasNearBottomRef.current ||
            Boolean(selectedAdminLastReply?.is_current_user || selectedAdminLastReply?.sender === "Guidance");

        if (shouldScroll) scrollContainerToBottom(adminMessagesRef);
        forceAdminScrollRef.current = false;
    }, [leftTab, selectedAdminConversationId, selectedAdminReplyCount, selectedAdminLastReply?.sent_at, selectedAdminLastReply?.sender, selectedAdminLastReply?.is_current_user]);

    // Filter parent groups by status tab AND category
    const filteredParentGroups = parentGroups.filter(g => {
        if (filterTab === "Pending") if (!g.reports.some(r => r.status === "New" || r.status === "Read")) return false;
        if (filterTab === "Ongoing") if (!g.reports.some(r => r.status === "Ongoing")) return false;
        if (filterTab === "Escalated") if (!g.reports.some(r => r.status === "Escalated")) return false;
        if (categoryFilter !== "All") if (!g.reports.some(r => r.categories.includes(categoryFilter))) return false;
        return true;
    });

    // ── Actions ───────────────────────────────────────────────────────────
    async function markReportStatus(id: number, status: ReportStatus) {
        setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
        if (selectedReport?.id === id) setSelectedReport(prev => prev ? { ...prev, status } : prev);
        // Refresh selected parent group
        if (selectedParent) {
            const updated = reports.map(r => r.id === id ? { ...r, status } : r);
            const groups = groupByParent(updated);
            const g = groups.find(g => g.parent_name === selectedParent.parent_name);
            if (g) setSelectedParent(g);
        }
        try {
            const res = await fetch(`/api/reports/guidance/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.message || "Unable to update guidance report status.");
            }
            await loadGuidanceReports();
        } catch (error) {
            console.error("Unable to update guidance status:", error);
            await loadGuidanceReports().catch(() => null);
        }
    }

    async function markGuidanceSeen(id: number) {
        setUnlockedReports(prev => new Set(prev).add(id));
        setReports(prev => prev.map(r => r.id === id ? { ...r, guidanceSeen: true, hasUnreadForGuidance: false, status: r.status === "New" ? "Read" : r.status } : r));
        if (selectedReport?.id === id) setSelectedReport(prev => prev ? { ...prev, guidanceSeen: true, hasUnreadForGuidance: false, status: prev.status === "New" ? "Read" : prev.status } : prev);

        try {
            const res = await fetch(`/api/reports/guidance/${id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "seen" }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.message || "Unable to mark guidance report as seen.");
            }
            await loadGuidanceReports();
        } catch (error) {
            console.error("Unable to mark guidance report as seen:", error);
            await loadGuidanceReports().catch(() => null);
        }
    }

    async function markAdminRead(id: number) {
        const target = adminMsgs.find(m => m.id === id);
        setAdminMsgs(prev => prev.map(m => m.id === id ? { ...m, status: "Read" } : m));
        setSelectedAdminMsg(prev => prev?.id === id ? { ...prev, status: "Read" } : prev);
        if (target?.conversationId?.startsWith("staff-message:")) {
            const res = await fetch("/api/reports/staff-messages", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: "guidance", conversationId: target.conversationId, status: "read" }),
            });
            if (!res.ok) await loadGuidanceStaffMessages().catch(() => null);
        }
    }

    function escalateToPrincipal(report: Report) {
        if (report.status === "Resolved") return;
        setPrincipalEscalated(prev => ({ ...prev, [report.id]: true }));
        markReportStatus(report.id, "Escalated");
    }

    const [sendingReply, setSendingReply] = useState(false);

    async function sendReply() {
        if (sendingReply || (!replyText.trim() && replyAttachments.length === 0)) return;
        setSendingReply(true);
        if (selectedAdminMsg) forceAdminScrollRef.current = true;
        if (selectedReport && !selectedAdminMsg) forceParentScrollRef.current = true;

        const textToSend = replyText.trim();
        const attachmentsToSend = [...replyAttachments];

        // Clear immediately to prevent duplicate submits
        setReplyText("");
        setReplyAttachments([]);

        try {
            const cleanedAttachments = await filesToAttachments(attachmentsToSend);
            const newReply = { sender: "Guidance", message: textToSend, sent_at: new Date().toLocaleString(), attachments: cleanedAttachments };

            if (selectedAdminMsg) {
                // ... keep existing selectedAdminMsg block unchanged ...
            }

            if (selectedReport && !selectedAdminMsg) {
                setGuidanceReplies(prev => ({
                    ...prev,
                    [selectedReport.id]: [...(prev[selectedReport.id] ?? []), newReply],
                }));
                try {

                    if (selectedReport.status === "New" || selectedReport.status === "Read") {
                        await markReportStatus(selectedReport.id, "Ongoing");
                    }
                    const res = await fetch(`/api/reports/parent-adviser/${selectedReport.id}/messages`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            body: textToSend,
                            role: "guidance",
                            attachments: cleanedAttachments,
                        }),
                    });
                    if (!res.ok) {
                        const data = await res.json().catch(() => null);
                        throw new Error(data?.message || "Unable to send guidance reply.");
                    }
                    await loadGuidanceReports();
                } catch (error) {
                    console.error("Unable to send guidance reply:", error);
                    await loadGuidanceReports().catch(() => null);
                }
            }
        } finally {
            setSendingReply(false);
        }
    }

    async function handleNewMessageSent(payload: NewMessagePayload) {
        const res = await fetch("/api/reports/staff-messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                role: "guidance",
                recipientId: payload.recipient.id,
                subject: payload.subject,
                categories: payload.categories,
                message: payload.body,
                attachments: payload.attachments,
            }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Unable to send message.");

        await Promise.all([loadGuidanceReports(), loadGuidanceStaffMessages()]);
        setLeftTab("Principal");
        setSelectedAdminMsg(null);
        setSelectedReport(null);
        setViewStep("list");
    }

    // When a report is selected, auto-mark as Read
    function selectReport(r: Report) {
        setSelectedAdminMsg(null);
        setSelectedReport(r);
        forceParentScrollRef.current = true;
        parentWasNearBottomRef.current = true;
        if (r.hasUnreadForGuidance && (r.guidanceSeen || unlockedReports.has(r.id))) {
            markGuidanceSeen(r.id).catch(() => null);
        }
    }

    function selectAdminMsg(m: AdminMessage) {
        setSelectedReport(null);
        setSelectedAdminMsg(m);
        forceAdminScrollRef.current = true;
        adminWasNearBottomRef.current = true;
        if (m.status === "New") markAdminRead(m.id).catch(() => null);
    }

    const showReportsPanel =
        viewStep === "reports" ||
        (viewStep === "detail" && leftTab === "Parent" && !!selectedParent);

    const detailBesideReports = viewStep === "detail" && (
        leftTab === "Parent" && !!selectedParent
    );

    const detailBesideMessages = viewStep === "detail" && (
        leftTab === "Principal" &&
        !!selectedAdminMsg
    );

    const detailSideBySide = detailBesideReports || detailBesideMessages;
    const detailPosition = detailBesideReports ? "left-[520px]" : detailBesideMessages ? "left-[420px]" : "left-0";

    const panelClass = (visible: boolean, bg: string, width: string, position = "left-0") =>
        `absolute inset-y-0 ${position} ${width} h-full flex flex-col overflow-hidden border-r border-slate-100 shadow-sm transition-all duration-200 ease-out ${bg} ${visible
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-2 scale-[0.99] pointer-events-none"
        }`;

    // ── Tab counts ────────────────────────────────────────────────────────
    const tabCounts = {
        Parent: reports.filter(r => r.hasUnreadForGuidance).length,
        Principal: adminMsgs.filter(m => m.status === "New").length,
    };

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* ── Top bar ── */}
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 shrink-0">
                <div>
                    <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Escalated Reports</h1>
                    <p className="text-xs text-slate-400 mt-0.5">Review reports escalated by advisers to the guidance office</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowExportModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold transition shadow-sm"
                    >
                        <FileDown className="w-3.5 h-3.5" /> Export
                    </button>
                    <button
                        onClick={() => { void openNewMessageModal(); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold transition shadow-sm"
                    >
                        <TrendingUp className="w-3.5 h-3.5" /> New Message
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 overflow-hidden relative">
                <div className="relative w-full h-full">
                    {/* ══ SLIDE 1 — Panel 1 (tab list + parent/admin list) ══ */}
                    <div className={panelClass(viewStep === "list" || detailBesideMessages, "bg-white", "w-full max-w-[420px]")}>
                        {/* Tab nav */}
                        <div className="px-3 pt-4 pb-2 flex flex-col gap-1">
                            {(["Parent", "Principal"] as LeftTab[]).map(tab => {
                                const icons: Record<LeftTab, React.ReactNode> = {
                                    Parent: <User className="w-4 h-4" />,
                                    Principal: <Shield className="w-4 h-4" />,
                                };
                                const active = leftTab === tab;
                                return (
                                    <button key={tab} onClick={() => { setLeftTab(tab); setSelectedParent(null); setSelectedReport(null); setSelectedAdminMsg(null); setViewStep("list"); }}
                                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition ${active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50"}`}>
                                        <span className="flex items-center gap-2.5">{icons[tab]}{tab === "Principal" ? "Messages" : `Escalated ${tab}`}</span>
                                        {tabCounts[tab] > 0 && (
                                            <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-full ${active ? "bg-sky-500 text-white" : "bg-red-500 text-white"}`}>{tabCounts[tab]}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="h-px bg-slate-100 mx-3" />

                        {/* Filter tabs (Parent only) */}
                        {leftTab === "Parent" && (
                            <div className="px-3 pt-3 pb-1">
                                <div className="flex gap-1 flex-wrap mb-2">
                                    {(["All", "Pending", "Ongoing", "Escalated"] as FilterTab[]).map(f => (
                                        <button key={f} onClick={() => setFilterTab(f)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${filterTab === f ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                            {f}
                                        </button>
                                    ))}
                                </div>
                                {/* Category filter dropdown */}
                                <div className="relative">
                                    <select
                                        value={categoryFilter}
                                        onChange={e => setCategoryFilter(e.target.value)}
                                        className="w-full appearance-none rounded-xl border text-xs font-semibold px-3 py-2 pr-7 outline-none transition-all cursor-pointer"
                                        style={{
                                            border: categoryFilter !== "All" ? "1.5px solid #10b981" : "1.5px solid #e2e8f0",
                                            background: categoryFilter !== "All" ? "#ecfdf5" : "#fff",
                                            color: categoryFilter !== "All" ? "#065f46" : "#475569",
                                        }}>
                                        <option value="All">All Categories ({reports.length})</option>
                                        {allReportCategories.map(cat => (
                                            <option key={cat} value={cat}>
                                                {cat} ({reports.filter(r => r.categories.includes(cat)).length})
                                            </option>
                                        ))}
                                    </select>
                                    <svg className="w-3.5 h-3.5 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: categoryFilter !== "All" ? "#10b981" : "#94a3b8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                        )}

                        {/* ── Parent group list ── */}
                        {leftTab === "Parent" && (
                            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                                {filteredParentGroups.length === 0 && (
                                    <p className="text-xs text-slate-400 text-center mt-8">No escalated adviser reports found.</p>
                                )}
                                {filteredParentGroups.map(g => {
                                    const isActive = selectedParent?.parent_name === g.parent_name;
                                    const allResolved = g.reports.every(r => r.status === "Resolved");
                                    const activeReports = g.reports.filter(r => r.status !== "Resolved");
                                    const activeConcernLevel = allResolved ? 0 : Math.max(...activeReports.map(r => r.concernLevel), 0);
                                    const isUrgent = !allResolved && activeConcernLevel >= 100;
                                    const escalatedToPrincipal = activeReports.some(r => principalEscalated[r.id]);
                                    const escalatedFromAdviser = activeReports.some(r => guidanceEscalated[r.id]);
                                    return (
                                        <button key={g.parent_name} onClick={() => { setSelectedParent(g); setSelectedReport(null); setViewStep("reports"); }}
                                            className={`w-full text-left rounded-xl px-3 py-2.5 transition border ${isActive ? "bg-sky-50 border-sky-200" : isUrgent ? "bg-red-50 border-red-100 hover:bg-red-100" : "bg-white border-slate-100 hover:bg-slate-50"}`}>
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-9 h-9 rounded-full ${getAvatarColor(g.parent_name)} flex items-center justify-center text-white text-xs font-extrabold shrink-0`}>{g.initials}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <p className="text-xs font-bold text-slate-800 truncate">{g.parent_name}</p>
                                                        {g.unread > 0 && <span className="text-[10px] font-extrabold bg-red-500 text-white rounded-full px-1.5 py-0.5 shrink-0">{g.unread}</span>}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 truncate">{g.student_name}</p>
                                                    {!allResolved && (
                                                        <div className="mt-1.5">
                                                            <ConcernBar level={activeConcernLevel} />
                                                        </div>
                                                    )}
                                                    <StatusSummaryPills reports={g.reports} />
                                                </div>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between">
                                                {allResolved
                                                    ? <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-sky-100 text-sky-700">✅ All Resolved</span>
                                                    : <PriorityBadge level={activeConcernLevel} />
                                                }
                                                <span className="text-[10px] text-slate-400">{g.reports.length} report{g.reports.length !== 1 ? "s" : ""}</span>
                                            </div>
                                            {!allResolved && (escalatedToPrincipal || escalatedFromAdviser) && (
                                                <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-red-600">
                                                    <TriangleAlert className="w-3 h-3" />
                                                    {escalatedToPrincipal ? "Escalated to Principal" : "Escalated from Adviser"}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Principal messages list ── */}
                        {leftTab === "Principal" && (
                            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                                {principalMsgs.map(m => (
                                    <button key={m.id} onClick={() => { selectAdminMsg(m); setViewStep("detail"); }}
                                        className={`w-full text-left rounded-xl px-3 py-2.5 transition border ${selectedAdminMsg?.id === m.id ? "bg-sky-50 border-sky-200" : "bg-white border-slate-100 hover:bg-slate-50"}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center shrink-0"><Shield className="w-3.5 h-3.5 text-white" /></div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-bold text-slate-700 truncate">{m.subject}</p>
                                                <p className="text-[10px] font-semibold text-slate-400 truncate">
                                                    {m.message_sender_is_current ? `To ${m.sender}` : `From ${m.sender}`} · {m.sender_name}
                                                </p>
                                            </div>
                                            {m.status === "New" && <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />}
                                        </div>
                                        <div className="flex items-center justify-between pl-9">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${getAdminMsgStatusStyle(m.status)}`}>{m.status}</span>
                                            <span className="text-[10px] text-slate-400">{m.sent_at.split("·")[0].trim()}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                    </div> {/* end SLIDE 1 */}

                    {/* ══ SLIDE 2 — Panel 2 (report list for selected parent) ══ */}
                    <div className={panelClass(showReportsPanel, "bg-white", "w-full max-w-[520px]")}>
                        {/* Back button */}
                        <div className="px-3 pt-3 pb-1 border-b border-slate-100 flex items-center gap-2">
                            <button onClick={() => { setSelectedParent(null); setSelectedReport(null); setViewStep("list"); }}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-sky-600 transition px-2 py-1.5 rounded-lg hover:bg-sky-50">
                                <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
                            </button>
                            <span className="text-xs font-semibold text-slate-700 truncate">
                                {selectedParent?.parent_name ?? ""}
                            </span>
                        </div>

                        {/* Parent reports list */}
                        {leftTab === "Parent" && selectedParent && (
                            <>
                                <div className="px-4 py-3 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full ${getAvatarColor(selectedParent.parent_name)} flex items-center justify-center text-white text-sm font-extrabold shrink-0`}>{selectedParent.initials}</div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-extrabold text-slate-900 truncate">{selectedParent.parent_name}</p>
                                            <p className="text-xs text-slate-400 truncate">{selectedParent.student_name}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3">
                                        {selectedParent.reports.every(r => r.status === "Resolved") && (
                                            <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-sky-100 text-sky-700">✅ All Resolved</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
                                    {selectedParent.reports.map(r => {
                                        const isActive = selectedReport?.id === r.id;
                                        const isEscalated = guidanceEscalated[r.id];
                                        return (
                                            <button key={r.id} onClick={() => { selectReport(r); setViewStep("detail"); }}
                                                className={`w-full text-left rounded-xl px-3 py-3 transition border ${isActive ? "bg-sky-50 border-sky-200" : isEscalated ? "bg-red-50 border-red-100" : "bg-white border-slate-100 hover:bg-slate-50"}`}>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <p className="text-xs font-bold text-slate-800 leading-snug flex-1">{r.subject}</p>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${getStatusStyle(r.status)}`}>{r.status}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {r.categories.map(cat => (
                                                        <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-semibold">{cat}</span>
                                                    ))}
                                                </div>
                                                {r.status !== "Resolved" && (
                                                    <>
                                                        <ConcernBar level={r.concernLevel} />
                                                        <div className="flex items-center justify-between mt-1.5">
                                                            <PriorityBadge level={r.concernLevel} />
                                                        </div>
                                                    </>
                                                )}
                                                <p className="text-[10px] text-slate-400 mt-1.5">{r.submitted_at}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Empty fallback */}
                        {!selectedParent && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                                <MessageSquare className="w-8 h-8 opacity-30" />
                                <p className="text-xs font-semibold">No selection</p>
                            </div>
                        )}
                    </div> {/* end SLIDE 2 */}

                    {/* ══ SLIDE 3 — Panel 3 (detail view) ══ */}
                    <div className={panelClass(viewStep === "detail", "bg-slate-50", detailSideBySide ? "right-0 w-auto" : "w-full max-w-[860px]", detailPosition)}>
                        {/* Back button */}
                        <div className="px-3 py-2 border-b border-slate-100 bg-white flex items-center gap-2 shrink-0">
                            <button onClick={() => {
                                setSelectedReport(null); setSelectedAdminMsg(null);
                                if (leftTab === "Parent" && selectedParent) setViewStep("reports");
                                else setViewStep("list");
                            }}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-sky-600 transition px-2 py-1.5 rounded-lg hover:bg-sky-50">
                                <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
                            </button>
                            <span className="text-xs font-semibold text-slate-700 truncate">
                                {selectedReport?.subject ?? selectedAdminMsg?.subject ?? ""}
                            </span>
                        </div>

                        {/* ── Parent report detail ── */}
                        {leftTab === "Parent" && selectedReport && (() => {
                            const isGuidanceEsc = guidanceEscalated[selectedReport.id];
                            const isPrincipalEscalated = principalEscalated[selectedReport.id];
                            const isResolved = selectedReport.status === "Resolved";
                            // Only show replies between Guidance and Parent — never show Adviser replies
                            const reportGuidanceReplies = (guidanceReplies[selectedReport.id] ?? []).filter(
                                reply => reply.sender === "Guidance" || reply.sender === selectedReport.parent_name
                            );
                            const isLocked = !isResolved && !unlockedReports.has(selectedReport.id) && !selectedReport.guidanceSeen;

                            // ── LOCKED view ──
                            if (isLocked) return (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* Header with summary only */}
                                    <div className="px-6 py-5 bg-white border-b border-slate-100">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide">🔒 Pending Review</span>
                                                </div>
                                                <h2 className="text-base font-extrabold text-slate-900 leading-snug mt-1">{selectedReport.subject}</h2>
                                                <p className="text-xs text-slate-400 mt-0.5">{selectedReport.submitted_at}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {selectedReport.categories.map(cat => (
                                                        <span key={cat} className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold border border-slate-200">{cat}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-2">
                                                <PriorityBadge level={selectedReport.concernLevel} large />
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getStatusStyle(
                                                    isPrincipalEscalated && selectedReport.status === "Resolved" ? "ResolvedByPrincipal" : selectedReport.status
                                                )}`}>
                                                    {isPrincipalEscalated && selectedReport.status === "Resolved" ? "Resolved by Principal" : selectedReport.status}
                                                </span>
                                            </div>
                                        </div>
                                        {selectedReport.status !== "Resolved" && (
                                            <div className="mt-3 max-w-xs">
                                                <p className="text-[11px] text-slate-400 mb-1 font-semibold">Concern Level</p>
                                                <ConcernBar level={selectedReport.concernLevel} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Blurred private conversation + unlock gate */}
                                    <div className="flex-1 overflow-hidden relative px-6 py-5">
                                        <div className="flex flex-col gap-4" style={{ filter: "blur(7px)", userSelect: "none", pointerEvents: "none" }}>
                                            <div className="flex items-start gap-3">
                                                <div className={`w-9 h-9 rounded-full ${getAvatarColor(selectedReport.parent_name)} flex items-center justify-center text-white text-xs font-extrabold shrink-0 mt-0.5`}>
                                                    {getInitials(selectedReport.parent_name)}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="h-3 w-36 bg-slate-200 rounded-full mb-2" />
                                                    <div className="bg-white rounded-2xl rounded-tl-none px-4 py-4 shadow-sm border border-slate-100">
                                                        <div className="h-3 w-full bg-slate-200 rounded-full mb-2" />
                                                        <div className="h-3 w-5/6 bg-slate-200 rounded-full mb-2" />
                                                        <div className="h-3 w-2/3 bg-slate-200 rounded-full" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3 flex-row-reverse">
                                                <div className="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs font-extrabold shrink-0 mt-0.5">
                                                    Me
                                                </div>
                                                <div className="flex-1 flex flex-col items-end">
                                                    <div className="h-3 w-24 bg-slate-200 rounded-full mb-2" />
                                                    <div className="bg-sky-100 rounded-2xl rounded-tr-none px-4 py-4 shadow-sm w-3/4">
                                                        <div className="h-3 w-full bg-sky-200 rounded-full mb-2" />
                                                        <div className="h-3 w-4/5 bg-sky-200 rounded-full" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Overlay unlock button */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/60 backdrop-blur-[2px]">
                                            <div className="flex flex-col items-center gap-3 bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-7 text-center max-w-xs">
                                                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                                                    <span style={{ fontSize: 28 }}>🔒</span>
                                                </div>
                                                <p className="text-sm font-extrabold text-slate-900">Concern is locked</p>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    <span className="font-semibold text-slate-700">{selectedReport.categories.join(" · ")}</span><br />
                                                    {selectedReport.subject}
                                                </p>
                                                <button
                                                    onClick={() => markGuidanceSeen(selectedReport.id)}
                                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold transition shadow-md w-full justify-center"
                                                >
                                                    <Eye className="w-4 h-4" /> See the concern
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );

                            // ── UNLOCKED view (full detail) ──
                            return (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* Header */}
                                    <div className={`px-6 py-5 bg-white border-b border-slate-100 ${isGuidanceEsc ? "border-l-4 border-l-red-500" : ""}`}>
                                        {isPrincipalEscalated && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 rounded-xl border border-red-200">
                                                <TriangleAlert className="w-4 h-4 text-red-600 shrink-0" />
                                                <p className="text-xs font-bold text-red-700">This report has been escalated to the Principal.</p>
                                            </div>
                                        )}
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h2 className="text-base font-extrabold text-slate-900 leading-snug">{selectedReport.subject}</h2>
                                                <p className="text-xs text-slate-400 mt-0.5">{selectedReport.submitted_at}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {selectedReport.categories.map(cat => (
                                                        <span key={cat} className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold border border-slate-200">{cat}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-2">
                                                {selectedReport.status !== "Resolved" && (
                                                    <PriorityBadge level={selectedReport.concernLevel} large />
                                                )}
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getStatusStyle(
                                                    isPrincipalEscalated && selectedReport.status === "Resolved" ? "ResolvedByPrincipal" : selectedReport.status
                                                )}`}>
                                                    {isPrincipalEscalated && selectedReport.status === "Resolved" ? "Resolved by Principal" : selectedReport.status}
                                                </span>
                                            </div>
                                        </div>
                                        {selectedReport.status !== "Resolved" && (
                                            <div className="mt-3 max-w-xs">
                                                <p className="text-[11px] text-slate-400 mb-1 font-semibold">Concern Level</p>
                                                <ConcernBar level={selectedReport.concernLevel} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Guidance-only conversation body */}
                                    <div ref={parentMessagesRef} onScroll={handleParentMessagesScroll} className="flex-1 overflow-y-auto px-6 py-5">
                                        {reportGuidanceReplies.length === 0 && (
                                            <div className="mb-5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Shield className="w-4 h-4 text-sky-600" />
                                                    <p className="text-xs font-extrabold text-sky-800">New parent-guidance conversation</p>
                                                </div>
                                                <p className="text-xs text-sky-700 leading-relaxed">
                                                    The parent-adviser conversation is kept private. Guidance can review the concern summary and continue in this separate thread.
                                                </p>
                                            </div>
                                        )}

                                        {reportGuidanceReplies.length === 0 && (
                                            <div className="mb-5 rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-3">
                                                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wide mb-2">Concern Summary</p>
                                                <p className="text-sm font-bold text-slate-800">{selectedReport.subject}</p>
                                                <p className="text-sm text-slate-600 leading-relaxed mt-2">{selectedReport.message}</p>
                                                {selectedReport.attachment && (
                                                    <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl w-fit">
                                                        <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                                        <span className="text-xs text-slate-600 font-semibold">{selectedReport.attachment}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {reportGuidanceReplies.length === 0 && (
                                            <div className="mb-5 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
                                                <MessageSquare className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                                                <p className="text-xs font-bold text-slate-500">No guidance messages yet.</p>
                                                <p className="text-xs text-slate-400 mt-1">Start the parent-guidance conversation below.</p>
                                            </div>
                                        )}

                                        {reportGuidanceReplies.map((reply, i) => {
                                            const mine = reply.sender === "Guidance";
                                            return (
                                                <div key={i} className={`flex items-start gap-3 mb-4 ${mine ? "flex-row-reverse" : ""}`}>
                                                    <div className={`w-9 h-9 rounded-full ${mine ? "bg-sky-500" : getAvatarColor(selectedReport.parent_name)} flex items-center justify-center text-white text-xs font-extrabold shrink-0 mt-0.5`}>
                                                        {mine ? "Me" : getInitials(selectedReport.parent_name)}
                                                    </div>
                                                    <div className={`flex-1 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] text-slate-400">{reply.sent_at}</span>
                                                            <p className="text-xs font-bold text-slate-800">{mine ? "You" : selectedReport.parent_name}</p>
                                                        </div>
                                                        <div className={`${mine ? "bg-sky-500 text-white rounded-tr-none" : "bg-white text-slate-700 rounded-tl-none border border-slate-100"} rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed max-w-[85%]`}>
                                                            {reply.message}
                                                        </div>
                                                        {reply.attachments && reply.attachments.length > 0 && (
                                                            <div className={`mt-2 flex flex-wrap gap-2 ${mine ? "justify-end" : ""}`}>
                                                                {reply.attachments.map((attachment, attachmentIndex) => (
                                                                    <a key={`${attachment.name}-${attachmentIndex}`} href={attachment.dataUrl} download={attachment.name} className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                                                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                                        <span className="max-w-[180px] truncate">{attachment.name}</span>
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Actions + Reply */}
                                    <div className="px-6 py-4 bg-white border-t border-slate-100">
                                        {isPrincipalEscalated ? (
                                            /* ── Guidance locked out after Principal escalation ── */
                                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                                    <Shield className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-600">Conversation handed over to Principal</p>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">This report has been escalated. Only the Principal and Parent can continue this conversation.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                                    {selectedReport.status !== "Resolved" && (
                                                        <button onClick={() => markReportStatus(selectedReport.id, "Resolved")}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-bold border border-sky-200 hover:bg-sky-100 transition h-11">
                                                            <CheckCircle className="w-3.5 h-3.5" /> Resolve
                                                        </button>
                                                    )}
                                                    {isGuidanceEsc && selectedReport.status !== "Resolved" && (
                                                        <button
                                                            onClick={() => setEscalateTarget(selectedReport)}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition h-11 bg-red-100 text-red-600 border-red-200 hover:bg-red-200"
                                                        >
                                                            <TriangleAlert className="w-3.5 h-3.5" />
                                                            Escalate to Principal
                                                        </button>
                                                    )}
                                                    <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100">
                                                        <Paperclip className="w-4 h-4" />
                                                        <input
                                                            type="file"
                                                            multiple
                                                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                            className="absolute inset-0 cursor-pointer opacity-0"
                                                            onChange={e => {
                                                                const captured = Array.from(e.target.files ?? []);
                                                                e.target.value = "";
                                                                const valid = captured.filter(file => file.size <= MAX_ATTACHMENT_BYTES);
                                                                if (valid.length > 0) setReplyAttachments(prev => [...prev, ...valid].slice(0, 5));
                                                            }}
                                                        />
                                                    </label>
                                                    {replyAttachments.map((file, index) => (
                                                        <div key={`${file.name}-${index}`} className="relative flex h-11 max-w-[150px] items-center gap-2 rounded-xl bg-white px-3 pr-7 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                                                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                            <span className="truncate">{file.name}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => setReplyAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                                                                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-white transition hover:bg-red-500"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Reply box */}
                                                <div className="flex items-end gap-3">
                                                    <div className="flex-1 rounded-xl border border-slate-200 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 transition overflow-hidden bg-white">
                                                        <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                                                            placeholder="Write a reply to the parent... (Enter to send)"
                                                            rows={2}
                                                            className="w-full px-3.5 pt-2.5 pb-2 text-sm text-slate-700 resize-none outline-none bg-transparent" />
                                                    </div>
                                                    <button onClick={sendReply} disabled={sendingReply || (!replyText.trim() && replyAttachments.length === 0)}
                                                        className={`p-2.5 rounded-xl transition ${!sendingReply && (replyText.trim() || replyAttachments.length > 0) ? "bg-sky-500 hover:bg-sky-600 text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}>
                                                        {sendingReply ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Admin message detail (Principal) ── */}
                        {leftTab === "Principal" && selectedAdminMsg && (
                            (() => {
                                const rootMine = Boolean(selectedAdminMsg.message_sender_is_current);
                                const rootSenderName = rootMine ? "You" : selectedAdminMsg.message_sender_name || selectedAdminMsg.sender_name;
                                const rootSenderEmail = rootMine ? "" : selectedAdminMsg.message_sender_email || selectedAdminMsg.sender_email;

                                return (
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        <div className="px-6 py-5 bg-white border-b border-slate-100 border-l-4 border-l-sky-500">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-sky-600">
                                                        <Shield className="w-5 h-5 text-white" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-extrabold text-slate-900">{selectedAdminMsg.sender_name}</p>
                                                        <p className="text-xs font-semibold text-slate-500">
                                                            {selectedAdminMsg.message_sender_is_current ? `Sent to ${selectedAdminMsg.sender}` : `From ${selectedAdminMsg.sender}`}
                                                        </p>
                                                        <p className="text-xs text-slate-400">{selectedAdminMsg.sender_email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {selectedAdminMsg.priority === "High" && (
                                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-100 text-red-600 border border-red-200">High Priority</span>
                                                    )}
                                                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getAdminMsgStatusStyle(selectedAdminMsg.status)}`}>{selectedAdminMsg.status}</span>
                                                </div>
                                            </div>
                                            <div className="mt-3">
                                                <h2 className="text-base font-extrabold text-slate-900">{selectedAdminMsg.subject}</h2>
                                                <p className="text-xs text-slate-400 mt-0.5">{selectedAdminMsg.sent_at}</p>
                                            </div>
                                        </div>
                                        <div ref={adminMessagesRef} onScroll={handleAdminMessagesScroll} className="flex-1 overflow-y-auto px-6 py-5">
                                            {/* Original staff message */}
                                            <div className={`flex items-start gap-3 mb-5 ${rootMine ? "flex-row-reverse" : ""}`}>
                                                <div className={`w-9 h-9 rounded-full ${rootMine ? "bg-sky-500 text-white text-xs font-extrabold" : "bg-sky-600"} flex items-center justify-center shrink-0 mt-0.5`}>
                                                    {rootMine ? "Me" : <Shield className="w-4 h-4 text-white" />}
                                                </div>
                                                <div className={`flex-1 flex flex-col ${rootMine ? "items-end" : "items-start"}`}>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-xs font-bold text-slate-800">{rootSenderName}</p>
                                                        {rootSenderEmail && <span className="text-[10px] text-slate-400">{rootSenderEmail}</span>}
                                                        <span className="text-[10px] text-slate-400">{selectedAdminMsg.sent_at}</span>
                                                    </div>
                                                    <div className={`${rootMine ? "bg-sky-500 text-white rounded-tr-none" : "bg-white text-slate-700 rounded-tl-none border border-slate-100"} max-w-[85%] rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed whitespace-pre-wrap`}>
                                                        {selectedAdminMsg.message}
                                                    </div>
                                                    {selectedAdminMsg.attachments && selectedAdminMsg.attachments.length > 0 && (
                                                        <div className={`mt-2 flex flex-wrap gap-2 ${rootMine ? "justify-end" : ""}`}>
                                                            {selectedAdminMsg.attachments.map((attachment, attachmentIndex) => (
                                                                <a key={`${attachment.name}-${attachmentIndex}`} href={attachment.dataUrl} download={attachment.name} className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                                                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                                    <span className="max-w-[180px] truncate">{attachment.name}</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Staff reply bubbles */}
                                            {selectedAdminMsg.replies?.map((reply, i) => {
                                                const mine = Boolean(reply.is_current_user || reply.sender === "Guidance");
                                                return (
                                                    <div key={i} className={`flex items-start gap-3 mb-4 ${mine ? "flex-row-reverse" : ""}`}>
                                                        <div className={`w-9 h-9 rounded-full ${mine ? "bg-sky-500 text-white text-xs font-extrabold" : "bg-sky-600"} flex items-center justify-center shrink-0 mt-0.5`}>
                                                            {mine ? "Me" : <Shield className="w-4 h-4 text-white" />}
                                                        </div>
                                                        <div className={`flex-1 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-[10px] text-slate-400">{reply.sent_at}</span>
                                                                <p className="text-xs font-bold text-slate-800">{mine ? "You" : reply.sender_name || reply.sender}</p>
                                                            </div>
                                                            <div className={`${mine ? "bg-sky-500 text-white rounded-tr-none" : "bg-white text-slate-700 rounded-tl-none border border-slate-100"} rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap`}>
                                                                {reply.message}
                                                            </div>
                                                            {reply.attachments && reply.attachments.length > 0 && (
                                                                <div className={`mt-2 flex flex-wrap gap-2 ${mine ? "justify-end" : ""}`}>
                                                                    {reply.attachments.map((attachment, attachmentIndex) => (
                                                                        <a key={`${attachment.name}-${attachmentIndex}`} href={attachment.dataUrl} download={attachment.name} className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
                                                                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                                            <span className="max-w-[180px] truncate">{attachment.name}</span>
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="px-6 py-4 bg-white border-t border-slate-100">
                                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                                <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100">
                                                    <Paperclip className="w-4 h-4" />
                                                    <input
                                                        type="file"
                                                        multiple
                                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                        className="absolute inset-0 cursor-pointer opacity-0"
                                                        onChange={e => {
                                                            const captured = Array.from(e.target.files ?? []);
                                                            e.target.value = "";
                                                            const valid = captured.filter(file => file.size <= MAX_ATTACHMENT_BYTES);
                                                            if (valid.length > 0) setReplyAttachments(prev => [...prev, ...valid].slice(0, 5));
                                                        }}
                                                    />
                                                </label>
                                                {replyAttachments.map((file, index) => (
                                                    <div key={`${file.name}-${index}`} className="relative flex h-11 max-w-[150px] items-center gap-2 rounded-xl bg-white px-3 pr-7 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                                                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                        <span className="truncate">{file.name}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setReplyAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                                                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-white transition hover:bg-red-500"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex items-end gap-3">
                                                {/* Textarea with embedded attach button */}
                                                <div className="flex-1 rounded-xl border border-slate-200 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 transition overflow-hidden bg-white">
                                                    <textarea
                                                        value={replyText}
                                                        onChange={e => setReplyText(e.target.value)}
                                                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                                                        placeholder={`Reply to ${selectedAdminMsg.sender_name}... (Enter to send)`}
                                                        rows={2}
                                                        className="w-full px-3.5 pt-2.5 pb-2 text-sm text-slate-700 resize-none outline-none bg-transparent"
                                                    />
                                                </div>

                                                {/* Send button */}
                                                <button
                                                    onClick={sendReply}
                                                    disabled={!replyText.trim() && replyAttachments.length === 0}
                                                    className={`p-2.5 rounded-xl transition ${replyText.trim() || replyAttachments.length > 0 ? "bg-sky-500 hover:bg-sky-600 text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
                                                >
                                                    <Send className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()
                        )}

                        {/* ── Empty states ── */}
                        {leftTab === "Parent" && !selectedReport && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                                {!selectedParent
                                    ? <><MessageSquare className="w-10 h-10 opacity-30" /><p className="text-sm font-semibold">Select a parent to view reports</p></>
                                    : <><ChevronRight className="w-10 h-10 opacity-30" /><p className="text-sm font-semibold">Select a report to view details</p></>
                                }
                            </div>
                        )}
                        {leftTab === "Principal" && !selectedAdminMsg && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                                <MessageSquare className="w-10 h-10 opacity-30" />
                                <p className="text-sm font-semibold">Select a message to read</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* New Message Modal */}
            {showExportModal && <ExportReportsModal reports={reports} selectedReport={selectedReport} onClose={() => setShowExportModal(false)} />}
            {showNewMessage && (
                <NewMessageModal
                    onClose={() => setShowNewMessage(false)}
                    onMessageSent={handleNewMessageSent}
                    staffRecipients={staffRecipients}
                    parentRecipients={parentRecipients}
                />
            )}

            {/* Escalate to Principal Confirmation Modal */}
            {escalateTarget !== null && (
                <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
                        {escalateSuccess ? (
                            <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
                                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                                    <TriangleAlert className="w-7 h-7 text-red-500" />
                                </div>
                                <p className="text-base font-extrabold text-slate-900">Escalated to Principal</p>
                                <p className="text-sm text-slate-500 leading-relaxed">
                                    This report has been escalated to the Principal. Thank you!
                                </p>
                                <button
                                    onClick={() => { setEscalateTarget(null); setEscalateSuccess(false); }}
                                    className="mt-2 px-7 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="px-6 py-5 border-b border-slate-100">
                                    <h2 className="text-lg font-extrabold text-slate-900">Escalate to Principal?</h2>
                                    <p className="text-sm text-slate-400 mt-1">
                                        Are you sure you want to escalate this report to the Principal?
                                    </p>
                                </div>
                                <div className="flex items-center justify-end gap-3 px-6 py-4">
                                    <button
                                        onClick={() => setEscalateTarget(null)}
                                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            escalateToPrincipal(escalateTarget);
                                            setEscalateSuccess(true);
                                        }}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition"
                                    >
                                        <TriangleAlert className="w-3.5 h-3.5" /> Yes, Escalate
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
}

