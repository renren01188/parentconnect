"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
    AlertTriangle, Clock, CheckCircle, Eye,
    ChevronRight, Paperclip, Send, MessageSquare,
    TriangleAlert, Upload,
    GraduationCap, User, X, Shield, TrendingUp,
    LoaderCircle, HeartHandshake, Search,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { UserAvatar } from "@/components/UserAvatar";
import { useReportMessagesRealtime } from "@/hooks/useReportMessagesRealtime";
import { ResolveConfirmationModal } from "@/components/ResolveConfirmationModal";
import AdviserReportsGuide from "../components/AdviserReportsGuide";
import {
    adviserReportStatusCategory,
    adviserReportStatusLabel,
    effectiveAdviserReportStatus,
    summarizeAdviserReportStatuses,
} from "@/lib/adviserReportStatusSummary";
import {
    getPriorityLabel,
    type Report, type ReportStatus, type ReportCategory,
    type StudentReport, type StudentReportStatus, type StudentReportCategory,
    type AdminMessage, type AdminMsgStatus, type MessageAttachment,
} from "../data";

// ── Types (local only) ────────────────────────────────────────────────────────
interface ParentGroup {
    parent_name: string;
    parent_profile_picture?: string | null;
    student_name: string;
    initials: string;
    reports: Report[];
    unread: number;
    maxConcernLevel: number;
}
interface StudentGroup {
    student_name: string;
    student_id: string;
    grade_level: string;
    section: string;
    initials: string;
    reports: StudentReport[];
    unread: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(name: string) {
    const parts = name.replace(/'s Parent/i, "").trim().split(" ");
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}
function getStudentInitials(name: string) {
    return name.trim().split(" ").slice(0, 2).map(p => p[0]?.toUpperCase()).join("");
}
function ParentAvatar({ name, profilePicture, initials, className }: { name: string; profilePicture?: string | null; initials: string; className: string }) {
    void profilePicture;
    return (
        <div className={`${className} ${getAvatarColor(name)} overflow-hidden flex items-center justify-center text-white font-extrabold shrink-0`}>
            {initials}
        </div>
    );
}
function getAvatarColor(name: string) {
    const colors = ["bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
}
function getStatusStyle(status: ReportStatus) {
    switch (status) {
        case "New": return "bg-emerald-500 text-white";
        case "Read": return "bg-slate-200 text-slate-600";
        case "Ongoing": return "bg-blue-100 text-blue-600";
        case "Resolved": return "bg-emerald-100 text-emerald-700";
        case "Escalated": return "bg-red-100 text-red-600";
    }
}
function getStudentStatusStyle(status: StudentReportStatus) {
    switch (status) {
        case "New": return "bg-emerald-500 text-white";
        case "Ongoing": return "bg-amber-100 text-amber-700";
        case "Escalated": return "bg-red-100 text-red-600";
        case "Resolved": return "bg-sky-100 text-sky-700";
    }
}
function getAdminMsgStatusStyle(status: AdminMsgStatus) {
    switch (status) {
        case "New": return "bg-violet-500 text-white";
        case "Read": return "bg-slate-200 text-slate-600";
        case "Replied": return "bg-emerald-100 text-emerald-700";
    }
}
function getCategoryStyle(cat: ReportCategory) {
    switch (cat) {
        case "Academic Concern": return "bg-blue-50 text-blue-600 border border-blue-200";
        case "Request": return "bg-amber-50 text-amber-600 border border-amber-200";
        case "Absence Excuse": return "bg-teal-50 text-teal-600 border border-teal-200";
        case "Behavioral": return "bg-red-50 text-red-500 border border-red-200";
        case "Other": return "bg-slate-100 text-slate-500 border border-slate-200";
    }
}
function getStudentCategoryStyle(cat: StudentReportCategory) {
    switch (cat) {
        case "Behavioral": return "bg-rose-50 text-rose-600 border border-rose-200";
        case "Safety": return "bg-red-50 text-red-600 border border-red-200";
        case "Academic": return "bg-sky-50 text-sky-600 border border-sky-200";
        case "Other": return "bg-slate-100 text-slate-500 border border-slate-200";
    }
}
function getAdminCategoryStyle(cat: string) {
    switch (cat) {
        case "Announcement": return "bg-violet-50 text-violet-600 border border-violet-200";
        case "Directive": return "bg-red-50 text-red-600 border border-red-200";
        case "Reminder": return "bg-amber-50 text-amber-600 border border-amber-200";
        case "Request": return "bg-blue-50 text-blue-600 border border-blue-200";
        default: return "bg-slate-100 text-slate-500 border border-slate-200";
    }
}

function PriorityBadge({ level, large = false }: { level: number; large?: boolean }) {
    const px = large ? "px-3 py-1.5" : "px-2 py-0.5";
    const fs = large ? "text-sm" : "text-[11px]";
    if (level >= 100) return <span className={`${px} ${fs} font-extrabold rounded-lg bg-red-600 text-white flex items-center gap-1`}>🔴 Urgent / Serious</span>;
    if (level >= 75) return <span className={`${px} ${fs} font-extrabold rounded-lg bg-orange-500 text-white flex items-center gap-1`}>🟠 High Priority</span>;
    if (level >= 50) return <span className={`${px} ${fs} font-extrabold rounded-lg bg-yellow-400 text-white flex items-center gap-1`}>🟡 Medium Priority</span>;
    return <span className={`${px} ${fs} font-extrabold rounded-lg bg-emerald-500 text-white flex items-center gap-1`}>🟢 Low Priority</span>;
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
            map[r.parent_name] = { parent_name: r.parent_name, parent_profile_picture: r.parent_profile_picture, student_name: r.student_name, initials: getInitials(r.parent_name), reports: [], unread: 0, maxConcernLevel: 0 };
        }
        map[r.parent_name].reports.push(r);
        if (r.hasUnreadForAdviser && r.status !== "Ongoing") map[r.parent_name].unread++;
        if (r.concernLevel > map[r.parent_name].maxConcernLevel) map[r.parent_name].maxConcernLevel = r.concernLevel;
    }
    for (const g of Object.values(map)) {
        g.reports.sort((a, b) => b.concernLevel - a.concernLevel);
    }
    return Object.values(map);
}
function groupByStudent(reports: StudentReport[]): StudentGroup[] {
    const map: Record<string, StudentGroup> = {};
    for (const r of reports) {
        if (!map[r.student_name]) {
            map[r.student_name] = { student_name: r.student_name, student_id: r.student_id, grade_level: r.grade_level, section: r.section, initials: getStudentInitials(r.student_name), reports: [], unread: 0 };
        }
        map[r.student_name].reports.push(r);
        if (r.status === "New") map[r.student_name].unread++;
    }
    return Object.values(map);
}

type FilterTab = "All" | "Pending" | "Ongoing" | "Escalated";
type LeftTab = "Parent" | "Student" | "Principal";
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

type AdminRecipient = {
    id: string;
    principalId: number;
    type: "admin";
    role: string;
    name: string;
    email: string;
};

type StaffRecipient = {
    id: string;
    type: "staff";
    role: string;
    name: string;
    email: string;
    grade?: string;
    section?: string;
};

type ParentRecipient = {
    id: string;
    parentId: number;
    parentEmail: string;
    name: string;
    parentName: string;
    actualParentName: string;
    studentId: string;
    studentName: string;
    grade: string;
    section: string;
    type: "parent";
};

type Recipient = AdminRecipient | StaffRecipient | ParentRecipient;
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

function RecipientAvatar({ r }: { r: Recipient }) {
    if (r.type === "staff" && r.role === "Guidance") {
        return (
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-sky-500">
                <HeartHandshake className="w-4 h-4 text-white" />
            </div>
        );
    }
    if (r.type === "admin" || r.type === "staff") {
        return (
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-violet-600">
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

function formatAttachmentSize(size: number) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChips({ attachments }: { attachments?: MessageAttachment[] }) {
    if (!attachments?.length) return null;
    return (
        <div className="mt-2 flex flex-wrap gap-2">
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

// ── New Message Modal ─────────────────────────────────────────────────────────
function NewMessageModal({ onClose, onSent, mode = "concern" }: { onClose: () => void; onSent?: () => void | Promise<void>; mode?: "concern" | "message" }) {
    const [recipientId, setRecipientId] = useState("");
    const [recipientOpen, setRecipientOpen] = useState(false);
    const [subject, setSubject] = useState("");
    const [selectedCats, setSelectedCats] = useState<string[]>([]);
    const [otherText, setOtherText] = useState("");
    const [message, setMessage] = useState("");
    const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [sending, setSending] = useState(false);
    const [loadingRecipients, setLoadingRecipients] = useState(true);
    const [submitError, setSubmitError] = useState("");
    const [principalRecipients, setPrincipalRecipients] = useState<AdminRecipient[]>([]);
    const [guidanceRecipients, setGuidanceRecipients] = useState<StaffRecipient[]>([]);
    const [schoolAdviserRecipients, setSchoolAdviserRecipients] = useState<StaffRecipient[]>([]);
    const [parentRecipients, setParentRecipients] = useState<ParentRecipient[]>([]);
    const [adviserSearch, setAdviserSearch] = useState("");
    const [parentSearch, setParentSearch] = useState("");
    const recipientRef = useRef<HTMLDivElement>(null);
    const allRecipients: Recipient[] = [...principalRecipients, ...guidanceRecipients, ...schoolAdviserRecipients, ...parentRecipients];
    const selectedRecipient = allRecipients.find(r => r.id === recipientId);
    const filteredSchoolAdvisers = schoolAdviserRecipients.filter((recipient) => {
        const query = adviserSearch.trim().toLowerCase();
        if (!query) return true;
        return [
            recipient.name,
            recipient.email,
            recipient.grade,
            recipient.section,
        ].some((value) => String(value ?? "").toLowerCase().includes(query));
    });
    const filteredParents = parentRecipients.filter((recipient) => {
        const query = parentSearch.trim().toLowerCase();
        if (!query) return true;
        return [
            recipient.name,
            recipient.actualParentName,
            recipient.parentName,
            recipient.studentName,
            recipient.grade,
            recipient.section,
            recipient.parentEmail,
        ].some((value) => String(value ?? "").toLowerCase().includes(query));
    });
    const concernLevel = computeAdviserLevel(selectedCats);
    const otherSelected = selectedCats.includes("Other");
    const isMessageMode = mode === "message";
    const canSubmit = recipientId && subject.trim() && (isMessageMode || (selectedCats.length > 0 && (!otherSelected || otherText.trim()))) && (message.trim() || attachments.length > 0) && !sending;
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
    useEffect(() => {
        let mounted = true;
        async function loadRecipients() {
            try {
                setLoadingRecipients(true);
                setSubmitError("");
                const [res, staffRes] = await Promise.all([
                    fetch("/api/reports/adviser-messages", { cache: "no-store" }),
                    fetch("/api/reports/staff-messages?role=adviser", { cache: "no-store" }),
                ]);
                const [data, staffData] = await Promise.all([
                    res.json().catch(() => null),
                    staffRes.json().catch(() => null),
                ]);
                if (!res.ok) throw new Error(data?.message || "Unable to load recipients.");
                if (!mounted) return;
                const staffRecipients = staffRes.ok ? ((staffData?.recipients ?? []) as StaffRecipient[]) : [];
                setPrincipalRecipients((data?.principals ?? []) as AdminRecipient[]);
                setGuidanceRecipients(staffRecipients
                    .filter((recipient) => recipient.id.startsWith("guidance:"))
                    .filter((recipient, index, list) => list.findIndex((item) => item.id === recipient.id) === index));
                setSchoolAdviserRecipients(staffRecipients
                    .filter((recipient) => recipient.id.startsWith("adviser:"))
                    .filter((recipient, index, list) => list.findIndex((item) => item.id === recipient.id) === index));
                setParentRecipients((data?.parents ?? []) as ParentRecipient[]);
            } catch (error) {
                if (mounted) setSubmitError(error instanceof Error ? error.message : "Unable to load recipients.");
            } finally {
                if (mounted) setLoadingRecipients(false);
            }
        }
        loadRecipients();
        return () => {
            mounted = false;
        };
    }, []);

    async function handleSubmit() {
        if (!canSubmit) return;
        try {
            setSending(true);
            setSubmitError("");
            const finalCategories = isMessageMode ? ["Message"] : selectedCats.map(cat =>
                cat === "Other" && otherText.trim() ? `Other: ${otherText.trim()}` : cat
            );
            const endpoint = recipientId.startsWith("guidance:") || recipientId.startsWith("adviser:")
                ? "/api/reports/staff-messages"
                : "/api/reports/adviser-messages";
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    role: recipientId.startsWith("guidance:") || recipientId.startsWith("adviser:") ? "adviser" : undefined,
                    recipientId,
                    subject: subject.trim(),
                    categories: finalCategories,
                    message: message.trim(),
                    attachments,
                }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || "Unable to send message.");
            await onSent?.();
            setSubmitted(true);
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "Unable to send message.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-3 sm:p-5" onClick={onClose}>
            <div className="my-auto flex w-full max-w-[480px] flex-col overflow-y-auto rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "calc(100dvh - 24px)" }} onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-5 sm:px-6">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-900">{isMessageMode ? "Send Message" : "Send a Concern"}</h2>
                        <p className="text-sm text-slate-400 mt-1">Send a message to a parent or admin</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400"><X className="w-4 h-4" /></button>
                </div>
                {submitted ? (
                    <div className="flex flex-col items-center gap-3 py-10 px-6">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle className="w-7 h-7 text-emerald-500" /></div>
                        <p className="text-base font-bold text-slate-900">Message Sent!</p>
                        <p className="text-sm text-slate-400 text-center">Your message has been sent to {selectedRecipient?.name}.</p>
                        <button onClick={onClose} className="mt-2 px-7 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition">Done</button>
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
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-left hover:border-emerald-300 transition">
                                    {selectedRecipient ? (
                                        <><RecipientAvatar r={selectedRecipient} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{selectedRecipient.name}</p>
                                                <p className="text-xs text-slate-400 truncate">
                                                    {selectedRecipient.type === "admin"
                                                        ? `Principal - ${selectedRecipient.email}`
                                                        : selectedRecipient.type === "staff"
                                                            ? selectedRecipient.role === "Guidance"
                                                                ? `Guidance Counselors - ${selectedRecipient.email}`
                                                                : `School Adviser - ${selectedRecipient.email}`
                                                            : `Student: ${selectedRecipient.studentName}`}
                                                </p>
                                            </div></>
                                    ) : <p className="text-sm text-slate-400 flex-1">Select a recipient...</p>}
                                    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${recipientOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {recipientOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Principal</p></div>
                                        {loadingRecipients && (
                                            <p className="px-3.5 py-3 text-xs font-semibold text-slate-400">Loading recipients...</p>
                                        )}
                                        {!loadingRecipients && principalRecipients.length === 0 && (
                                            <p className="px-3.5 py-3 text-xs font-semibold text-slate-400">No active principal found.</p>
                                        )}
                                        {principalRecipients.map(r => (
                                            <button key={r.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === r.id ? "bg-violet-50" : ""}`}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-violet-600">
                                                    <Shield className="w-4 h-4 text-white" />
                                                </div>
                                                <div><p className="text-sm font-semibold text-slate-800">{r.name}</p><p className="text-xs text-slate-400">{r.email}</p></div>
                                                {recipientId === r.id && <CheckCircle className="w-4 h-4 text-violet-500 ml-auto shrink-0" />}
                                            </button>
                                        ))}

                                        <div className="px-3 py-2 bg-slate-50 border-t border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Guidance Counselors</p></div>
                                        {!loadingRecipients && guidanceRecipients.length === 0 && (
                                            <p className="px-3.5 py-3 text-xs font-semibold text-slate-400">No active guidance counselor found.</p>
                                        )}
                                        {guidanceRecipients.map(r => (
                                            <button key={r.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === r.id ? "bg-sky-50" : ""}`}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-sky-500">
                                                    <HeartHandshake className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p><p className="text-xs text-slate-400 truncate">Guidance Counselors - {r.email}</p></div>
                                                {recipientId === r.id && <CheckCircle className="w-4 h-4 text-sky-500 ml-auto shrink-0" />}
                                            </button>
                                        ))}

                                        <div className="px-3 py-2 bg-slate-50 border-t border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">School Advisers</p></div>
                                        <div className="p-3 border-b border-slate-100 bg-white">
                                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
                                                <Search className="w-3.5 h-3.5 text-slate-400" />
                                                <input
                                                    value={adviserSearch}
                                                    onChange={(e) => setAdviserSearch(e.target.value)}
                                                    placeholder="Search adviser..."
                                                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                                                />
                                            </div>
                                        </div>
                                        {!loadingRecipients && filteredSchoolAdvisers.length === 0 && (
                                            <p className="px-3.5 py-3 text-xs font-semibold text-slate-400">No school advisers found.</p>
                                        )}
                                        {filteredSchoolAdvisers.map(r => (
                                            <button key={r.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === r.id ? "bg-violet-50" : ""}`}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-violet-600">
                                                    <Shield className="w-4 h-4 text-white" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                                                    <p className="text-xs text-slate-400 truncate">
                                                        School Adviser - {r.email}{r.grade || r.section ? ` · ${[r.grade, r.section].filter(Boolean).join(", ")}` : ""}
                                                    </p>
                                                </div>
                                                {recipientId === r.id && <CheckCircle className="w-4 h-4 text-violet-500 ml-auto shrink-0" />}
                                            </button>
                                        ))}

                                        <div className="px-3 py-2 bg-slate-50 border-t border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Parents</p></div>
                                        <div className="p-3 border-b border-slate-100 bg-white">
                                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
                                                <Search className="w-3.5 h-3.5 text-slate-400" />
                                                <input
                                                    value={parentSearch}
                                                    onChange={(e) => setParentSearch(e.target.value)}
                                                    placeholder="Search parent or student..."
                                                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                                                />
                                            </div>
                                        </div>
                                        {!loadingRecipients && filteredParents.length === 0 && (
                                            <p className="px-3.5 py-3 text-xs font-semibold text-slate-400">No parent accounts found for your advisory class.</p>
                                        )}
                                        {filteredParents.map(p => (
                                            <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(p.id); setRecipientOpen(false); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === p.id ? "bg-emerald-50" : ""}`}>
                                                <div className={`w-8 h-8 rounded-full ${getAvatarColor(p.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{getInitials(p.name)}</div>
                                                <div><p className="text-sm font-semibold text-slate-800">{p.name}</p><p className="text-xs text-slate-400">Student: {p.studentName}</p></div>
                                                {recipientId === p.id && <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">{isMessageMode ? "Topic" : "Subject"} <span className="text-red-500">*</span></label>
                            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder={isMessageMode ? "Enter topic..." : "Enter subject..."}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                        </div>
                        {!isMessageMode && <div>
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
                        </div>}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Message <span className="text-red-500">*</span></label>
                            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message..." rows={5}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 resize-none outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Attachments</label>
                            <label className="relative flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-slate-200 p-5 transition hover:border-emerald-300 hover:bg-emerald-50/30">
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
                            <AttachmentChips attachments={attachments} />
                            {attachments.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {attachments.map((attachment, index) => (
                                        <button
                                            key={`${attachment.name}-${index}-remove`}
                                            type="button"
                                            onClick={() => setAttachments(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                                            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50"
                                        >
                                            Remove {attachment.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">Cancel</button>
                            <button onClick={handleSubmit} disabled={!canSubmit}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition ${canSubmit ? "bg-emerald-500 hover:bg-emerald-600" : "bg-emerald-300 cursor-not-allowed"}`}>
                                <Send className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Send Message"}
                            </button>
                        </div> {/* end SLIDE 3 */}
                    </div>
                )}
            </div> {/* end slide container */}
        </div>
    );
}

// ── Notify Parent Modal ───────────────────────────────────────────────────────
function NotifyParentModal({
    studRep,
    onSend,
    onClose,
}: {
    studRep: StudentReport;
    onSend: (studRep: StudentReport, message: string) => Promise<void | Report>;
    onClose: () => void;
}) {
    const concernText = studRep.title || studRep.description;
    const defaultMsg = `Hi, I wanted to bring to your attention a concern regarding your child ${studRep.student_name}.\n\nConcern: "${concernText}"\n\nKindly reach out so we can discuss how to best support your child. Thank you.`;

    const [message, setMessage] = useState(defaultMsg);
    const [sent, setSent] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");

    useEffect(() => {
        function h(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    async function handleSend() {
        if (!message.trim() || sending) return;
        setSending(true);
        setSendError("");
        try {
            await onSend(studRep, message.trim());
            setSent(true);
        } catch (error) {
            setSendError(error instanceof Error ? error.message : "Unable to notify parent.");
        } finally {
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-lg font-extrabold text-slate-900">Notify Parent</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Send a message to{" "}
                            <span className="font-semibold text-slate-600">{studRep.parent_name}</span>{" "}
                            about{" "}
                            <span className="font-semibold text-slate-600">{studRep.student_name}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {sent ? (
                    /* ── Success state ── */
                    <div className="flex flex-col items-center gap-3 py-10 px-6">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                            <CheckCircle className="w-7 h-7 text-emerald-500" />
                        </div>
                        <p className="text-base font-bold text-slate-900">Message Sent!</p>
                        <p className="text-sm text-slate-400 text-center">
                            The concern has been forwarded to {studRep.parent_name}. It will appear in{" "}
                            <span className="font-semibold text-slate-700">Parent Reports</span> where you can continue the conversation.
                        </p>
                        <button
                            onClick={onClose}
                            className="mt-2 px-7 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    /* ── Compose state ── */
                    <div className="px-6 py-5 flex flex-col gap-4">
                        {sendError && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700">
                                {sendError}
                            </div>
                        )}

                        {/* Context banner */}
                        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-start gap-3">
                            <span className="text-blue-500 mt-0.5 shrink-0"><MessageSquare className="w-4 h-4" /></span>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-blue-800 truncate">{studRep.title}</p>
                                <p className="text-[11px] text-blue-600 mt-0.5">
                                    {studRep.category} · {studRep.submitted_at}
                                </p>
                            </div>
                        </div>

                        {/* Message textarea */}
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                                Message to Parent <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                rows={8}
                                autoFocus
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 resize-none outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                                placeholder="Type your message to the parent..."
                            />
                            <p className="text-[11px] text-slate-400 mt-1">
                                This message will appear in <span className="font-semibold">Parent Reports</span> and the parent will be able to reply.
                            </p>
                        </div>

                        {/* Footer actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={!message.trim() || sending}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition ${message.trim() && !sending
                                    ? "bg-blue-500 hover:bg-blue-600"
                                    : "bg-blue-300 cursor-not-allowed"
                                    }`}
                            >
                                <Send className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Send to Parent"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page Component ───────────────────────────────────────────────────────
function ReportsPageContent() {
    const searchParams = useSearchParams();
    const { setUnreadCount } = useNotifContext();

    // ── State ──────────────────────────────────────────────────────────────
    const [leftTab, setLeftTab] = useState<LeftTab>("Parent");
    const [filterTab, setFilterTab] = useState<FilterTab>("All");
    const [categoryFilter, setCategoryFilter] = useState<string>("All");
    const [selectedParent, setSelectedParent] = useState<ParentGroup | null>(null);
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [selectedStudent, setSelectedStudent] = useState<StudentGroup | null>(null);
    const [selectedStudRep, setSelectedStudRep] = useState<StudentReport | null>(null);
    const [selectedAdminMsg, setSelectedAdminMsg] = useState<AdminMessage | null>(null);
    const [replyText, setReplyText] = useState("");
    const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
    const [sendingReply, setSendingReply] = useState(false);
    const [showNewMessage, setShowNewMessage] = useState(false);
    const [guideTarget, setGuideTarget] = useState<string | null>(null);
    const [escalateTarget, setEscalateTarget] = useState<number | null>(null);
    const [escalateSuccess, setEscalateSuccess] = useState(false);
    const [escalating, setEscalating] = useState(false);
    const [successNotice, setSuccessNotice] = useState("");
    const [notifyTarget, setNotifyTarget] = useState<StudentReport | null>(null);
    // Tracks which student reports have already been forwarded to a parent (prevent duplicates)
    const [notifiedStudentReports, setNotifiedStudentReports] = useState<Set<number>>(new Set());
    // Panel navigation: "list" = Panel1 visible, "reports" = Panel2, "detail" = Panel3
    const [viewStep, setViewStep] = useState<"list" | "reports" | "detail">("list");

    // All categories across all parent reports (for dropdown)
    const [reportsLoading, setReportsLoading] = useState(true);
    const [actionError, setActionError] = useState("");
    const [resolveTargetId, setResolveTargetId] = useState<number | null>(null);
    const [resolving, setResolving] = useState(false);
    const [studentResolveTargetId, setStudentResolveTargetId] = useState<number | null>(null);
    const [resolvingStudent, setResolvingStudent] = useState(false);

    // Local mutable copies of data
    const [reports, setReports] = useState<Report[]>([]);
    const [studentReps, setStudentReps] = useState<StudentReport[]>([]);
    const [adminMsgs, setAdminMsgs] = useState<AdminMessage[]>([]);
    const reportDetailRequestsRef = useRef<Map<number, Promise<void>>>(new Map());
    const parentMessagesRef = useRef<HTMLDivElement>(null);
    const adminMessagesRef = useRef<HTMLDivElement>(null);

    // Tracks which reports the adviser has explicitly unlocked (clicked "See the concern")
    const [unlockedReports, setUnlockedReports] = useState<Set<number>>(new Set());
    const [unlockedStudentReports, setUnlockedStudentReports] = useState<Set<number>>(new Set()); // ✅ add here

    const allReportCategories = Array.from(
        new Set(reports.flatMap(r => r.categories))
    ).sort();

    const adminMessageKey = (message: AdminMessage) => message.conversationId ?? `principal-message:${message.id}`;

    const loadReports = useCallback(async () => {
        const res = await fetch("/api/reports/parent-adviser?role=adviser&summary=1", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Unable to load reports.");
        const nextReports = (data.reports ?? []) as Report[];
        setReports(nextReports);

        setSelectedReport(current => current ? nextReports.find(r => r.id === current.id) ?? current : current);
        setSelectedParent(current => {
            if (!current) return current;
            return groupByParent(nextReports).find(group => group.parent_name === current.parent_name) ?? current;
        });
    }, []);

    const loadReportDetail = useCallback(async (id: number) => {
        const inFlight = reportDetailRequestsRef.current.get(id);
        if (inFlight) return inFlight;

        const request = (async () => {
            const res = await fetch(`/api/reports/parent-adviser?role=adviser&reportId=${id}`, { cache: "no-store" });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || "Unable to load this conversation.");
            const report = (data?.reports?.[0] ?? null) as Report | null;
            if (!report) return;
            setReports((current) => current.map((item) => item.id === id ? report : item));
            setSelectedReport((current) => current?.id === id ? report : current);
        })();

        reportDetailRequestsRef.current.set(id, request);
        try {
            await request;
        } finally {
            reportDetailRequestsRef.current.delete(id);
        }
    }, []);

    const loadStudentReports = useCallback(async () => {
        const res = await fetch("/api/student-reports", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Unable to load student reports.");
        const nextReports = (data.reports ?? []) as (StudentReport & { notified_parent?: boolean })[];
        setStudentReps(nextReports);
        setNotifiedStudentReports(new Set(nextReports.filter(r => r.notified_parent).map(r => r.id)));
        setSelectedStudRep(current => current ? nextReports.find(r => r.id === current.id) ?? current : current);
        setSelectedStudent(current => {
            if (!current) return current;
            return groupByStudent(nextReports).find(group => group.student_id === current.student_id) ?? current;
        });
    }, []);

    const loadAdminMessages = useCallback(async () => {
        const [res, staffRes] = await Promise.all([
            fetch("/api/reports/adviser-messages", { cache: "no-store" }),
            fetch("/api/reports/staff-messages?role=adviser", { cache: "no-store" }),
        ]);
        const [data, staffData] = await Promise.all([
            res.json().catch(() => null),
            staffRes.json().catch(() => null),
        ]);
        if (!res.ok) throw new Error(data?.message || "Unable to load principal messages.");
        const nextMessages = [
            ...((data?.principalMessages ?? []) as AdminMessage[]),
            ...(staffRes.ok ? ((staffData?.messages ?? []) as AdminMessage[]) : []),
        ]
            .filter((message) => message.sender !== "ICT" && message.message_sender !== "ICT")
            .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
        setAdminMsgs(nextMessages);
        setSelectedAdminMsg(current => current
            ? nextMessages.find(message => adminMessageKey(message) === adminMessageKey(current)) ?? current
            : current
        );
    }, []);

    useEffect(() => {
        let isMounted = true;

        async function loadInitialReports() {
            try {
                setReportsLoading(true);
                await Promise.all([loadReports(), loadStudentReports(), loadAdminMessages()]);
            } finally {
                if (isMounted) setReportsLoading(false);
            }
        }

        loadInitialReports();

        return () => {
            isMounted = false;
        };
    }, [loadReports, loadStudentReports, loadAdminMessages]);

    // Subscribing outside the selected-report effect also covers the first
    // parent report for an adviser with an otherwise empty inbox.
    const liveUpdateNotice = useReportMessagesRealtime("adviser-reports-live-list", loadReports);

    // ── Handle deep-link from notification ───────────────────────────────
    useEffect(() => {
        const tab = searchParams.get("tab") as LeftTab | null;
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
        const newParent = reports.filter(r => r.hasUnreadForAdviser && r.status !== "Ongoing").length;
        const newStudent = studentReps.filter(r => r.status === "New").length;
        const newAdmin = adminMsgs.filter(m => m.status === "New").length;
        setUnreadCount(newParent + newStudent + newAdmin);
    }, [reports, studentReps, adminMsgs, setUnreadCount]);

    // ── Derived data ──────────────────────────────────────────────────────
    const parentGroups = groupByParent(reports)
        .sort((a, b) => b.maxConcernLevel - a.maxConcernLevel);

    const studentGroups = groupByStudent(studentReps);

    const principalMsgs = adminMsgs;
    const selectedReportId = selectedReport?.id ?? null;
    const selectedReportReplyCount = selectedReport?.replies?.length ?? 0;
    const selectedReportMessage = selectedReport?.message ?? "";
    const selectedAdminMessageId = selectedAdminMsg?.id ?? null;
    const selectedAdminConversationId = selectedAdminMsg?.conversationId ?? null;
    const selectedAdminReplyCount = selectedAdminMsg?.replies?.length ?? 0;
    const selectedAdminMessage = selectedAdminMsg?.message ?? "";

    useEffect(() => {
        if (leftTab !== "Parent" || !selectedReport || selectedReport.detailsLoaded) return;
        void loadReportDetail(selectedReport.id).catch((error) => {
            setActionError(error instanceof Error ? error.message : "Unable to load this conversation.");
        });
    }, [leftTab, selectedReport, loadReportDetail]);

    useEffect(() => {
        if (leftTab !== "Parent" || !selectedReportId) return;
        requestAnimationFrame(() => {
            const el = parentMessagesRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }, [leftTab, selectedReportId, selectedReportMessage, selectedReportReplyCount]);

    useEffect(() => {
        if (leftTab !== "Principal" || !selectedAdminMessageId) return;
        requestAnimationFrame(() => {
            const el = adminMessagesRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        });
    }, [leftTab, selectedAdminConversationId, selectedAdminMessageId, selectedAdminMessage, selectedAdminReplyCount]);

    // Filter parent groups by status tab AND category
    const filteredParentGroups = parentGroups.filter(g => {
        if (filterTab === "Pending") if (!g.reports.some(r => adviserReportStatusCategory(r) === "pending")) return false;
        if (filterTab === "Ongoing") if (!g.reports.some(r => adviserReportStatusCategory(r) === "ongoing")) return false;
        if (filterTab === "Escalated") if (!g.reports.some(r => adviserReportStatusCategory(r) === "escalated")) return false;
        if (categoryFilter !== "All") if (!g.reports.some(r => r.categories.includes(categoryFilter))) return false;
        return true;
    });

    // ── Actions ───────────────────────────────────────────────────────────
    async function markReportStatus(id: number, status: ReportStatus) {
        setActionError("");
        const res = await fetch(`/api/reports/parent-adviser/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const message = data?.message || "Unable to update report status.";
            console.error("Unable to update report status:", message);
            setActionError(message);
            return false;
        }

        const updatedReport = (data?.report ?? null) as Report | null;
        const applyStatus = (items: Report[]) =>
            items.map(r => r.id === id ? (updatedReport ?? { ...r, status, hasUnreadForAdviser: false }) : r);

        let nextReports: Report[] = [];
        setReports(prev => {
            nextReports = applyStatus(prev);
            return nextReports;
        });
        setSelectedParent(current => {
            if (!current) return current;
            return groupByParent(nextReports).find(g => g.parent_name === current.parent_name) ?? current;
        });
        if (selectedReport?.id === id) setSelectedReport(prev => prev ? (updatedReport ?? { ...prev, status }) : prev);
        // When a parent report is resolved, also resolve the linked student concern
        if (status === "Resolved") {
            const report = reports.find(r => r.id === id);
            if (report && report.subject.startsWith("[Student Concern] ")) {
                const concernTitle = report.subject.replace("[Student Concern] ", "");
                setStudentReps(prev => prev.map(sr =>
                    sr.title === concernTitle && sr.parent_name === report.parent_name
                        ? { ...sr, status: "Resolved" }
                        : sr
                ));
            }
        }
        await loadReports();
        return true;
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

    async function confirmStudentResolve() {
        if (studentResolveTargetId === null || resolvingStudent) return;
        setResolvingStudent(true);
        try {
            const res = await fetch(`/api/student-reports/${studentResolveTargetId}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "Resolved" }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                setActionError(data?.message || "Unable to resolve student report.");
                return;
            }
            const target = studentReps.find((report) => report.id === studentResolveTargetId);
            setStudentReps((prev) => prev.map((report) => report.id === studentResolveTargetId ? { ...report, status: "Resolved" } : report));
            setSelectedStudRep((prev) => prev?.id === studentResolveTargetId ? { ...prev, status: "Resolved" } : prev);
            if (target) {
                setReports((prev) => prev.map((report) =>
                    report.subject === `[Student Concern] ${target.title}` && report.parent_name === target.parent_name
                        ? { ...report, status: "Resolved" }
                        : report
                ));
            }
            setStudentResolveTargetId(null);
            await loadStudentReports();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : "Unable to resolve student report.");
        } finally {
            setResolvingStudent(false);
        }
    }

    async function escalateToGuidance(id: number) {
        const escalated = await markReportStatus(id, "Escalated");
        if (!escalated) return false;

        // Guidance receives the escalation in-app from the report status
        // immediately. Email is supplementary, so a blocked SMTP connection
        // must never keep this confirmation modal loading.
        void fetch(`/api/reports/parent-adviser/${id}/notify-guidance`, {
            method: "POST",
        }).catch((error) => {
            console.warn("Guidance escalation email request failed:", error);
        });
        return true;
    }

    async function markAdminRead(message: AdminMessage) {
        const selectedKey = adminMessageKey(message);
        setAdminMsgs(prev => prev.map(m => adminMessageKey(m) === selectedKey ? { ...m, status: "Read" } : m));
        setSelectedAdminMsg(prev => prev && adminMessageKey(prev) === selectedKey ? { ...prev, status: "Read" } : prev);
        const endpoint = message.conversationId?.startsWith("staff-message:")
            ? "/api/reports/staff-messages"
            : "/api/reports/adviser-messages";
        const res = await fetch(endpoint, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                role: message.conversationId?.startsWith("staff-message:") ? "adviser" : undefined,
                messageId: message.id,
                conversationId: message.conversationId,
                status: "read",
            }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const message = data?.message || "Unable to mark principal message as read.";
            setActionError(message);
            await loadAdminMessages().catch(() => null);
        }
    }

    async function sendReply() {
        if (sendingReply || (!replyText.trim() && replyAttachments.length === 0)) return;
        if (selectedReport?.status === "Resolved") {
            setActionError("This report has been resolved. You can no longer send messages in this conversation.");
            return;
        }
        setSendingReply(true);
        try {
            setActionError("");
            const cleanedAttachments = await filesToAttachments(replyAttachments);

            const newReply = { sender: "Adviser", message: replyText.trim(), sent_at: new Date().toLocaleString(), attachments: cleanedAttachments };

            if (selectedAdminMsg) {
                const selectedKey = adminMessageKey(selectedAdminMsg);
                const endpoint = selectedAdminMsg.conversationId?.startsWith("staff-message:")
                    ? "/api/reports/staff-messages"
                    : "/api/reports/adviser-messages";
                const res = await fetch(endpoint, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messageId: selectedAdminMsg.id,
                        role: selectedAdminMsg.conversationId?.startsWith("staff-message:") ? "adviser" : undefined,
                        conversationId: selectedAdminMsg.conversationId,
                        status: "replied",
                        reply: replyText.trim(),
                        attachments: cleanedAttachments,
                    }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message = data?.message || "Unable to send principal reply.";
                    setActionError(message);
                    return;
                }
                setAdminMsgs(prev => prev.map(m => adminMessageKey(m) === selectedKey
                    ? { ...m, status: "Replied", replies: [...(m.replies ?? []), newReply] }
                    : m
                ));
                setSelectedAdminMsg(prev => prev ? { ...prev, status: "Replied", replies: [...(prev.replies ?? []), newReply] } : prev);
                await loadAdminMessages().catch(() => null);
                setReplyText("");
                setReplyAttachments([]);
                return;
            }

            if (selectedReport) {
                const res = await fetch(`/api/reports/parent-adviser/${selectedReport.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
                    body: JSON.stringify({ body: replyText.trim(), role: "adviser", attachments: cleanedAttachments }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    const message = data?.message || "Unable to send reply.";
                    console.error("Unable to send reply:", message);
                    setActionError(message);
                    return;
                }
                // The report subscription can fetch the persisted row before
                // this POST resolves. Only add the local acknowledgement when
                // that snapshot has not already supplied the same message.
                const hasPersistedReply = (replies: typeof selectedReport.replies | undefined) =>
                    (replies ?? []).some((reply) =>
                        reply.sender === "Adviser" &&
                        reply.message === newReply.message &&
                        (reply.attachments?.length ?? 0) === newReply.attachments.length
                    );
                setReports(prev => prev.map(r =>
                    r.id === selectedReport.id && !hasPersistedReply(r.replies)
                        ? { ...r, replies: [...(r.replies ?? []), newReply] }
                        : r
                ));
                setSelectedReport(prev => prev && !hasPersistedReply(prev.replies)
                    ? { ...prev, replies: [...(prev.replies ?? []), newReply] }
                    : prev
                );
            }

            if (selectedStudRep) {
                setStudentReps(prev => prev.map(r =>
                    r.id === selectedStudRep.id ? { ...r, replies: [...(r.replies ?? []), newReply] } : r
                ));
                setSelectedStudRep(prev => prev ? { ...prev, replies: [...(prev.replies ?? []), newReply] } : prev);
            }

            setReplyText("");
            setReplyAttachments([]);
            if (selectedReport) await loadReports();
        } finally {
            setSendingReply(false);
        }
    }

    async function sendToParent(studRep: StudentReport, messageText: string): Promise<Report | void> {
        if (!messageText.trim()) return;
        const res = await fetch(`/api/student-reports/${studRep.id}/notify-parent`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: messageText.trim() }),
        });
        const data = await res.json().catch(() => null);
        const forwardedReport = data?.report as Report | undefined;
        if (forwardedReport) {
            setReports(prev => [forwardedReport, ...prev.filter(report => report.id !== forwardedReport.id)]);
            setNotifiedStudentReports(prev => new Set(prev).add(studRep.id));
        }
        if (!res.ok) throw new Error(data?.message || "Unable to notify parent.");
        if (!forwardedReport) throw new Error("Parent was notified, but the Parent Report could not be loaded.");
        await Promise.all([loadReports(), loadStudentReports()]);
        return forwardedReport;
    }

    // Selecting a report should not consume the pending-review lock.
    function selectReport(r: Report) {
        setSelectedReport(r);
        setReplyText("");
        setReplyAttachments([]);
        void loadReportDetail(r.id).catch((error) => {
            setActionError(error instanceof Error ? error.message : "Unable to load this conversation.");
        });
    }

    function selectAdminMsg(m: AdminMessage) {
        setSelectedAdminMsg(m);
        setReplyText("");
        setReplyAttachments([]);
        // Only mark as read if it's a received message (New status from principal)
        // Sent messages (Replied/Read) don't need a PATCH call
        if (m.status === "New") {
            markAdminRead(m).catch((error) => {
                setActionError(error instanceof Error ? error.message : "Unable to mark principal message as read.");
            });
        }
    }

    const showReportsPanel =
        viewStep === "reports" ||
        (viewStep === "detail" && (
            (leftTab === "Parent" && !!selectedParent) ||
            (leftTab === "Student" && !!selectedStudent)
        ));

    const detailBesideReports = viewStep === "detail" && (
        (leftTab === "Parent" && !!selectedParent) ||
        (leftTab === "Student" && !!selectedStudent)
    );

    const detailBesideMessages = viewStep === "detail" && (
        leftTab === "Principal" &&
        !!selectedAdminMsg
    );

    // Keep the detail area visible beside the main list when nothing is
    // selected, so the user always gets guidance instead of a blank panel.
    const hasSelectedParentOrStudent = !!selectedParent || !!selectedStudent;
    const noParentReportSelected = viewStep === "list" && !hasSelectedParentOrStudent && !selectedReport && !selectedStudRep && !selectedAdminMsg;
    const parentSelectedWithoutConcern = viewStep === "reports" && hasSelectedParentOrStudent && !selectedReport && !selectedStudRep && !selectedAdminMsg;
    const showEmptyDetail = noParentReportSelected || parentSelectedWithoutConcern;
    const detailSideBySide = detailBesideReports || detailBesideMessages || showEmptyDetail;
    const detailPosition = detailBesideReports || parentSelectedWithoutConcern ? "left-0 md:left-[420px]" : detailBesideMessages || noParentReportSelected ? "left-0 md:left-[420px]" : "left-0";

    const panelClass = (visible: boolean, bg: string, width: string, position = "left-0") =>
        `absolute inset-y-0 ${position} ${width} h-full flex flex-col overflow-hidden border-r border-slate-100 shadow-sm transition-all duration-200 ease-out ${bg} ${visible
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-2 scale-[0.99] pointer-events-none"
        }`;

    const guideHighlight = (target: string) => guideTarget === target
        ? "relative z-[85] pointer-events-none rounded-2xl ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-100"
        : "";

    // ── Tab counts ────────────────────────────────────────────────────────
    const tabCounts = {
        Parent: parentGroups.reduce((a, g) => a + g.unread, 0),
        Student: studentGroups.reduce((a, g) => a + g.unread, 0),
        Principal: adminMsgs.filter(m => m.status === "New").length,
    };

    // ── Render ────────────────────────────────────────────────────────────
    return (
        <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col bg-slate-50 md:h-full">
            {liveUpdateNotice && <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 sm:px-6">{liveUpdateNotice}</div>}
            {/* ── Top bar ── */}
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                    <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Reports & Messages</h1>
                    <p className="text-xs text-slate-400 mt-0.5">Manage parent reports, student concerns, and admin messages</p>
                </div>
                <button
                    onClick={() => setShowNewMessage(true)}
                    data-parent-guide="new-message"
                    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 sm:w-auto ${guideHighlight("new-message")}`}
                >
                    <TrendingUp className="w-3.5 h-3.5" /> New Message
                </button>
            </div>
            {actionError && (
                <div className="mx-6 mt-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
                    <span>{actionError}</span>
                    <button onClick={() => setActionError("")} className="rounded-lg px-2 py-1 text-red-500 hover:bg-red-100">
                        Dismiss
                    </button>
                </div>
            )}
            {successNotice && (
                <div className="mx-6 mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">
                    {successNotice}
                </div>
            )}

            {/* ── Body ── */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
                <div className="relative h-full w-full">
                    {/* ══ SLIDE 1 — Panel 1 (tab list + parent/student/admin list) ══ */}
                    <div className={panelClass(viewStep === "list" || detailBesideMessages, "bg-white", "w-full max-w-[420px]")}>
                        {/* Tab nav */}
                        <div data-parent-guide="inbox-tabs" className={`flex gap-1 overflow-x-auto rounded-2xl px-3 pb-2 pt-4 md:flex-col md:overflow-visible ${guideHighlight("inbox-tabs")}`}>
                            {(["Parent", "Student", "Principal"] as LeftTab[]).map(tab => {
                                const icons: Record<LeftTab, React.ReactNode> = {
                                    Parent: <User className="w-4 h-4" />,
                                    Student: <GraduationCap className="w-4 h-4" />,
                                    Principal: <Shield className="w-4 h-4" />,
                                };
                                const active = leftTab === tab;
                                return (
                                    <button key={tab} onClick={() => { setLeftTab(tab); setSelectedParent(null); setSelectedReport(null); setSelectedAdminMsg(null); setSelectedStudent(null); setSelectedStudRep(null); setViewStep("list"); }}
                                        className={`flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50"}`}>
                                        <span className="flex items-center gap-2.5">{icons[tab]}{tab === "Principal" ? "Messages" : `${tab} Reports`}</span>
                                        {tabCounts[tab] > 0 && (
                                            <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-full ${active ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>{tabCounts[tab]}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="h-px bg-slate-100 mx-3" />

                        {/* Filter tabs (Parent only) */}
                        {leftTab === "Parent" && (
                            <div data-parent-guide="report-filters" className={`rounded-2xl px-3 pt-3 pb-1 ${guideHighlight("report-filters")}`}>
                                <div className="mb-2 flex gap-1 overflow-x-auto">
                                    {(["All", "Pending", "Ongoing", "Escalated"] as FilterTab[]).map(f => (
                                        <button key={f} onClick={() => setFilterTab(f)}
                                            className={`min-h-9 shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${filterTab === f ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
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
                            <div data-parent-guide="conversation-list" className={`flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 ${guideHighlight("conversation-list")}`}>
                                {reportsLoading && (
                                    <p className="text-xs text-slate-400 text-center mt-8">Loading reports...</p>
                                )}
                                {!reportsLoading && filteredParentGroups.length === 0 && (
                                    <p className="text-xs text-slate-400 text-center mt-8">No reports found.</p>
                                )}
                                {filteredParentGroups.map(g => {
                                    const isActive = selectedParent?.parent_name === g.parent_name;
                                    const summary = summarizeAdviserReportStatuses(g.reports);
                                    const allResolved = summary.total > 0 && summary.resolved === summary.total;
                                    const hasOngoing = summary.ongoing > 0;
                                    const hasEscalated = summary.escalated > 0;
                                    return (
                                        <button key={g.parent_name} onClick={() => { setSelectedParent(g); setSelectedReport(null); setViewStep("reports"); }}
                                            className={`w-full text-left rounded-xl px-3 py-2.5 transition border ${isActive ? "border-emerald-200 bg-emerald-50 ring-2 ring-emerald-200" : hasEscalated ? "border-red-100 bg-red-50 hover:bg-red-100" : hasOngoing ? "border-emerald-200 bg-emerald-50 shadow-sm hover:bg-emerald-100" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                                            <div className="flex items-center gap-2.5">
                                                <ParentAvatar name={g.parent_name} profilePicture={g.parent_profile_picture} initials={g.initials} className="w-9 h-9 rounded-full text-xs" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <p className="text-xs font-bold text-slate-800 truncate">{g.parent_name}</p>
                                                        {g.unread > 0 && <span className="text-[10px] font-extrabold bg-red-500 text-white rounded-full px-1.5 py-0.5 shrink-0">{g.unread}</span>}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 truncate">Student Name: {g.student_name}</p>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <div className="flex min-w-0 flex-wrap gap-1">
                                                    {allResolved && <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-emerald-100 text-emerald-700">All Resolved</span>}
                                                    {!allResolved && summary.pending > 0 && <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-amber-100 text-amber-700">{summary.pending} pending review</span>}
                                                    {!allResolved && summary.ongoing > 0 && <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-emerald-600 text-white">{summary.ongoing} ongoing</span>}
                                                    {!allResolved && summary.escalated > 0 && <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-red-100 text-red-700">{summary.escalated} escalated</span>}
                                                    {!allResolved && summary.resolved > 0 && <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-slate-100 text-slate-600">{summary.resolved} resolved</span>}
                                                </div>
                                                <span className="text-[10px] text-slate-400">{g.reports.length} report{g.reports.length !== 1 ? "s" : ""}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Student group list ── */}
                        {leftTab === "Student" && (
                            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                                {studentGroups.map(g => {
                                    const isActive = selectedStudent?.student_name === g.student_name;
                                    return (
                                        <button key={g.student_name} onClick={() => { setSelectedStudent(g); setSelectedStudRep(null); setViewStep("reports"); }}
                                            className={`w-full text-left rounded-xl px-3 py-2.5 transition border ${isActive ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:bg-slate-50"}`}>
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-9 h-9 rounded-full ${getAvatarColor(g.student_name)} flex items-center justify-center text-white text-xs font-extrabold shrink-0`}>{g.initials}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-bold text-slate-800 truncate">{g.student_name}</p>
                                                        {g.unread > 0 && <span className="text-[10px] font-extrabold bg-red-500 text-white rounded-full px-1.5 py-0.5">{g.unread}</span>}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400">{g.grade_level} · {g.section}</p>
                                                    <p className="text-[11px] text-slate-400">{g.reports.length} concern{g.reports.length !== 1 ? "s" : ""}</p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Principal messages list ── */}
                        {leftTab === "Principal" && (
                            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                                {principalMsgs.map(m => (
                                    <button key={adminMessageKey(m)} onClick={() => { selectAdminMsg(m); setViewStep("detail"); }}
                                        className={`w-full text-left rounded-xl px-3 py-2.5 transition border ${selectedAdminMsg && adminMessageKey(selectedAdminMsg) === adminMessageKey(m) ? "bg-violet-50 border-violet-200" : "bg-white border-slate-100 hover:bg-slate-50"}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center shrink-0"><Shield className="w-3.5 h-3.5 text-white" /></div>
                                            <p className="text-[11px] font-bold text-slate-700 truncate flex-1">{m.subject}</p>
                                            {m.status === "New" && <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />}
                                        </div>
                                        <div className="flex items-center justify-between pl-9">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${getAdminMsgStatusStyle(m.status)}`}>{m.status}</span>
                                            <span className="text-[10px] text-slate-400">{m.sent_at.split("·")[0].trim()}</span>
                                        </div>
                                        {!!m.categories?.length && (
                                            <div className="mt-2 flex flex-wrap gap-1 pl-9">
                                                {m.categories.map((cat) => (
                                                    <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${getAdminCategoryStyle(cat)}`}>
                                                        {cat}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                    </div> {/* end SLIDE 1 */}

                    {/* ══ SLIDE 2 — Panel 2 (report list for selected parent/student) ══ */}
                    <div className={panelClass(showReportsPanel, "bg-white", "w-full max-w-[420px]")}>
                        {/* Back button */}
                        <div className="px-3 pt-3 pb-1 border-b border-slate-100 flex items-center gap-2">
                            <button onClick={() => { setSelectedParent(null); setSelectedStudent(null); setSelectedReport(null); setSelectedStudRep(null); setViewStep("list"); }}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 transition px-2 py-1.5 rounded-lg hover:bg-emerald-50">
                                <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
                            </button>
                            <span className="text-xs font-semibold text-slate-700 truncate">
                                {leftTab === "Parent" ? (selectedParent?.parent_name ?? "") : (selectedStudent?.student_name ?? "")}
                            </span>
                        </div>

                        {/* Parent reports list */}
                        {leftTab === "Parent" && selectedParent && (
                            <>
                                <div className="px-4 py-3 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                            <ParentAvatar name={selectedParent.parent_name} profilePicture={selectedParent.parent_profile_picture} initials={selectedParent.initials} className="w-10 h-10 rounded-full text-sm" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-extrabold text-slate-900 truncate">{selectedParent.parent_name}</p>
                                            <p className="text-xs text-slate-400 truncate">Student Name: {selectedParent.student_name}</p>
                                            </div>
                                    </div>
                                    <div className="mt-3">
                                        {(() => {
                                            const allResolved = selectedParent.reports.every(r => r.status === "Resolved");
                                            return allResolved ? (
                                                <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-lg bg-emerald-100 text-emerald-700">✅ All Resolved</span>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
                                    {selectedParent.reports.map(r => {
                                        const isActive = selectedReport?.id === r.id;
                                        return (
                                            <button key={r.id} onClick={() => { selectReport(r); setViewStep("detail"); }}
                                                className={`w-full text-left rounded-xl px-3 py-3 transition border ${r.status === "Resolved" ? "bg-emerald-50 border-emerald-100 hover:bg-emerald-100" : "bg-red-50 border-red-100 hover:bg-red-100"} ${isActive ? "ring-2 ring-emerald-300" : ""}`}>
                                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                                    <p className="text-xs font-bold text-slate-800 leading-snug flex-1">{r.subject}</p>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${getStatusStyle(effectiveAdviserReportStatus(r))}`}>{adviserReportStatusLabel(r)}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {r.categories.map(cat => (
                                                        <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-semibold">{cat}</span>
                                                    ))}
                                                </div>
                                                {r.status !== "Resolved" && (
                                                    <>
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

                        {/* Student concerns list */}
                        {leftTab === "Student" && selectedStudent && (
                            <>
                                <div className="px-4 py-4 border-b border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full ${getAvatarColor(selectedStudent.student_name)} flex items-center justify-center text-white text-sm font-extrabold shrink-0`}>{selectedStudent.initials}</div>
                                        <div>
                                            <p className="text-sm font-extrabold text-slate-900">{selectedStudent.student_name}</p>
                                            <p className="text-xs text-slate-400">{selectedStudent.grade_level} · {selectedStudent.section}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
                                    {/* Derive live from studentReps so status badges update immediately */}
                                    {studentReps
                                        .filter(r => r.student_name === selectedStudent.student_name)
                                        .map(r => (
                                            <button key={r.id} onClick={() => { setSelectedStudRep(r); setViewStep("detail"); }}
                                                className={`w-full text-left rounded-xl px-3 py-3 border transition ${selectedStudRep?.id === r.id ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:bg-slate-50"}`}>
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <p className="text-xs font-bold text-slate-800 leading-snug flex-1">{r.title}</p>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${getStudentStatusStyle(r.status)}`}>{r.status}</span>
                                                </div>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${getStudentCategoryStyle(r.category)}`}>{r.category}</span>
                                                <p className="text-[10px] text-slate-400 mt-1.5">{r.submitted_at}</p>
                                            </button>
                                        ))}
                                </div>
                            </>
                        )}

                        {/* Empty fallback */}
                        {!selectedParent && !selectedStudent && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                                <MessageSquare className="w-8 h-8 opacity-30" />
                                <p className="text-xs font-semibold">No selection</p>
                            </div>
                        )}
                    </div> {/* end SLIDE 2 */}

                    {/* ══ SLIDE 3 — Panel 3 (detail view) ══ */}
                    <div className={`${panelClass(viewStep === "detail" || showEmptyDetail, "bg-slate-50", detailSideBySide ? "right-0 w-auto" : "w-full max-w-[860px]", detailPosition)} ${showEmptyDetail ? "hidden md:flex" : ""}`}>
                        {/* Back button */}
                        <div className="px-3 py-2 border-b border-slate-100 bg-white flex items-center gap-2 shrink-0">
                            <button onClick={() => {
                                setSelectedReport(null); setSelectedStudRep(null); setSelectedAdminMsg(null);
                                if ((leftTab === "Parent" && selectedParent) || (leftTab === "Student" && selectedStudent)) setViewStep("reports");
                                else setViewStep("list");
                            }}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 transition px-2 py-1.5 rounded-lg hover:bg-emerald-50">
                                <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Back
                            </button>
                            <span className="text-xs font-semibold text-slate-700 truncate">
                                {selectedReport?.subject ?? selectedStudRep?.title ?? selectedAdminMsg?.subject ?? ""}
                            </span>
                        </div>

                        {!selectedReport && !selectedStudRep && !selectedAdminMsg && leftTab !== "Principal" && (
                            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-400 px-6 text-center">
                                <MessageSquare className="w-10 h-10 opacity-30" />
                                <p className="text-sm font-semibold">
                                    {leftTab === "Parent"
                                        ? "Please Select a Parent Report to View the Details."
                                        : leftTab === "Student"
                                            ? "Please Select a Student Report to View the Details."
                                            : "Please Select a Concern to View the Details."}
                                </p>
                            </div>
                        )}

                        {/* ── Parent report detail ── */}
                        {leftTab === "Parent" && selectedReport && (() => {
                            const isPrincipalEsc = selectedReport.escalatedToPrincipal && selectedReport.status !== "Resolved";
                            const isGuidanceEsc = selectedReport.escalatedToGuidance && !isPrincipalEsc && selectedReport.status !== "Resolved";
                            const isEscalatedAway = isGuidanceEsc || isPrincipalEsc;
                            const isResolved = selectedReport.status === "Resolved";
                            const isLocked = !unlockedReports.has(selectedReport.id) && selectedReport.status === "New";

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
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getStatusStyle(effectiveAdviserReportStatus(selectedReport))}`}>{adviserReportStatusLabel(selectedReport)}</span>
                                            </div>
                                        </div>
                                        {selectedReport.status !== "Resolved" && (
                                            <div className="mt-3 max-w-xs">
                                                <p className="text-[11px] text-slate-400 mb-1 font-semibold">Concern Level</p>
                                                <ConcernBar level={selectedReport.concernLevel} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Blurred message body + unlock gate */}
                                    <div className="flex-1 overflow-hidden relative px-6 py-5">
                                        {/* Blurred preview */}
                                        <div className="flex items-start gap-3" style={{ filter: "blur(6px)", userSelect: "none", pointerEvents: "none" }}>
                                            <ParentAvatar name={selectedReport.parent_name} profilePicture={selectedReport.parent_profile_picture} initials={getInitials(selectedReport.parent_name)} className="w-9 h-9 rounded-full text-xs mt-0.5" />
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="text-xs font-bold text-slate-800">{selectedReport.parent_name}</p>
                                                    <span className="text-[10px] text-slate-400">{selectedReport.submitted_at}</span>
                                                </div>
                                                <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm border border-slate-100 text-sm text-slate-700 leading-relaxed">
                                                    {selectedReport.message}
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
                                                    onClick={() => {
                                                        setUnlockedReports(prev => new Set(prev).add(selectedReport.id));
                                                        if (selectedReport.status !== "Resolved" && selectedReport.status !== "Ongoing") {
                                                            markReportStatus(selectedReport.id, "Ongoing");
                                                        }
                                                    }}
                                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition shadow-md w-full justify-center"
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
                                    <div className={`px-6 py-5 bg-white border-b border-slate-100 ${isEscalatedAway ? "border-l-4 border-l-red-500" : ""}`}>
                                        {isGuidanceEsc && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 rounded-xl border border-red-200">
                                                <TriangleAlert className="w-4 h-4 text-red-600 shrink-0" />
                                                <p className="text-xs font-bold text-red-700">This report has been escalated to the Guidance Counselor.</p>
                                            </div>
                                        )}
                                        {isPrincipalEsc && (
                                            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 rounded-xl border border-red-200">
                                                <TriangleAlert className="w-4 h-4 text-red-600 shrink-0" />
                                                <p className="text-xs font-bold text-red-700">This report has been escalated to the Principal.</p>
                                            </div>
                                        )}
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h2 className="text-base font-extrabold text-slate-900 leading-snug">{selectedReport.subject}</h2>
                                                <p className="text-xs text-slate-400 mt-0.5">{selectedReport.submitted_at}</p>
                                                {selectedReport.submitted_by_role === "Subject Teacher" && (
                                                    <p className="mt-2 text-xs font-semibold text-blue-700">Submitted by: {selectedReport.submitted_by_name} · Subject Teacher · {selectedReport.student_name} · {selectedReport.grade} - {selectedReport.section}</p>
                                                )}
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {selectedReport.categories.map(cat => (
                                                        <span key={cat} className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-semibold border border-slate-200">{cat}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-2">
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getStatusStyle(effectiveAdviserReportStatus(selectedReport))}`}>{adviserReportStatusLabel(selectedReport)}</span>
                                            </div>
                                        </div>
                                        {selectedReport.status !== "Resolved" && (
                                            <div className="mt-3 max-w-xs">
                                                <p className="text-[11px] text-slate-400 mb-1 font-semibold">Concern Level</p>
                                                <ConcernBar level={selectedReport.concernLevel} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Message body */}
                                    <div ref={parentMessagesRef} className="flex-1 overflow-y-auto px-6 py-5">
                                        {/* Opening report message — hidden for adviser-forwarded student concerns */}
                                        {selectedReport.message && !selectedReport.subject.startsWith("[Student Concern] ") && (
                                          <div className="flex items-start gap-3 mb-5">
                                                <ParentAvatar name={selectedReport.submitted_by_name ?? selectedReport.parent_name} profilePicture={selectedReport.parent_profile_picture} initials={getInitials(selectedReport.submitted_by_name ?? selectedReport.parent_name)} className="w-9 h-9 rounded-full text-xs mt-0.5" />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-xs font-bold text-slate-800">{selectedReport.submitted_by_name ?? selectedReport.parent_name}{selectedReport.submitted_by_role ? ` (${selectedReport.submitted_by_role})` : ""}</p>
                                                        <span className="text-[10px] text-slate-400">{selectedReport.submitted_at}</span>
                                                    </div>
                                                    <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm border border-slate-100 text-sm text-slate-700 leading-relaxed">
                                                        {selectedReport.message}
                                                        <AttachmentChips attachments={selectedReport.attachments} />
                                                        {selectedReport.attachment && (
                                                            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl w-fit cursor-pointer hover:bg-slate-50 transition">
                                                                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                                                <span className="text-xs text-slate-600 font-semibold">{selectedReport.attachment}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {[...(selectedReport.replies ?? [])]
                                            .filter(reply => reply.sender === "Adviser" || reply.sender === selectedReport.parent_name)
                                            .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
                                            .map((reply, i) => {
                                                const isAdviserReply = reply.sender === "Adviser";
                                                return (
                                                    <div key={i} className={`flex items-start gap-3 mb-4 ${isAdviserReply ? "flex-row-reverse" : ""}`}>
                                                    <UserAvatar name={isAdviserReply ? "You" : reply.sender} className="w-9 h-9 rounded-full mt-0.5" fallbackClassName={isAdviserReply ? "bg-emerald-500" : getAvatarColor(reply.sender)} />
                                                        <div className={`flex-1 flex flex-col ${isAdviserReply ? "items-end" : "items-start"}`}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-[10px] text-slate-400">{reply.sent_at}</span>
                                                                <p className="text-xs font-bold text-slate-800">{isAdviserReply ? "You" : reply.sender}</p>
                                                            </div>
                                                            <div className={`${isAdviserReply ? "bg-emerald-500 text-white rounded-tr-none" : "bg-white text-slate-700 rounded-tl-none border border-slate-100"} rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed max-w-[85%]`}>
                                                                {reply.message && <p className="whitespace-pre-wrap">{reply.message}</p>}
                                                                <AttachmentChips attachments={reply.attachments} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>

                                    {/* Actions + Reply */}
                                    <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4 sm:px-6">
                                        {isResolved || isEscalatedAway ? (
                                            /* ── Adviser locked out after Guidance escalation ── */
                                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                                    <TriangleAlert className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-600">{isResolved ? "Conversation resolved" : isPrincipalEsc ? "Conversation handed over to Principal" : "Conversation handed over to Guidance"}</p>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">{isResolved ? "This concern has been resolved. No further messages can be sent." : isPrincipalEsc ? "This report has been escalated. Only the Principal and Parent can continue this conversation." : "This report has been escalated. Only the Guidance Counselor and Parent can continue this conversation."}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                                    <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100">
                                                        <Paperclip className="w-3.5 h-3.5" />
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
                                                    {selectedReport.status !== "Resolved" && (
                                                        <button onClick={() => setResolveTargetId(selectedReport.id)}
                                                            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100">
                                                            <CheckCircle className="w-3.5 h-3.5" /> Resolve
                                                        </button>
                                                    )}
                                                    {selectedReport.status !== "Resolved" && (
                                                        <button onClick={() => setEscalateTarget(selectedReport.id)}
                                                            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 text-[11px] font-bold text-orange-600 transition hover:bg-orange-100">
                                                            <TriangleAlert className="w-3.5 h-3.5" /> Escalate to Guidance
                                                        </button>
                                                    )}
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
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                                    <div className="flex-1 rounded-xl border border-slate-200 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition overflow-hidden bg-slate-50">
                                                        <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                                                            placeholder={`Reply to ${selectedReport.parent_name}... (Enter to send)`}
                                                            rows={2}
                                                            className="w-full px-3.5 pt-2.5 pb-2 text-sm text-slate-700 resize-none outline-none bg-transparent" />
                                                    </div>
                                                    <button onClick={sendReply} disabled={sendingReply || (!replyText.trim() && replyAttachments.length === 0)}
                                                        className={`flex min-h-11 w-full items-center justify-center rounded-xl p-2.5 transition sm:w-auto ${!sendingReply && (replyText.trim() || replyAttachments.length > 0) ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}>
                                                        {sendingReply ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Student report detail ── */}
                        {leftTab === "Student" && selectedStudRep && (() => {
                            const isLocked = !unlockedStudentReports.has(selectedStudRep.id) && selectedStudRep.status === "New";

                            // ── LOCKED view ──
                            if (isLocked) return (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="px-6 py-5 bg-white border-b border-slate-100">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide">🔒 Pending Review</span>
                                                </div>
                                                <h2 className="text-base font-extrabold text-slate-900 leading-snug mt-1">{selectedStudRep.title}</h2>
                                                <p className="text-xs text-slate-400 mt-0.5">{selectedStudRep.submitted_at}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-semibold border ${getStudentCategoryStyle(selectedStudRep.category)}`}>{selectedStudRep.category}</span>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getStudentStatusStyle(selectedStudRep.status)}`}>{selectedStudRep.status}</span>
                                        </div>
                                    </div>

                                    {/* Blurred preview + unlock */}
                                    <div className="flex-1 overflow-hidden relative px-6 py-5">
                                        <div className="flex items-start gap-3" style={{ filter: "blur(6px)", userSelect: "none", pointerEvents: "none" }}>
                                            <div className={`w-9 h-9 rounded-full ${getAvatarColor(selectedStudRep.student_name)} flex items-center justify-center text-white text-xs font-extrabold shrink-0 mt-0.5`}>{getStudentInitials(selectedStudRep.student_name)}</div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="text-xs font-bold text-slate-800">{selectedStudRep.student_name}</p>
                                                    <span className="text-[10px] text-slate-400">{selectedStudRep.submitted_at}</span>
                                                </div>
                                                <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm border border-slate-100 text-sm text-slate-700 leading-relaxed">
                                                    {selectedStudRep.description}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/60 backdrop-blur-[2px]">
                                            <div className="flex flex-col items-center gap-3 bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-7 text-center max-w-xs">
                                                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                                                    <span style={{ fontSize: 28 }}>🔒</span>
                                                </div>
                                                <p className="text-sm font-extrabold text-slate-900">Concern is locked</p>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    <span className="font-semibold text-slate-700">{selectedStudRep.category}</span><br />
                                                    {selectedStudRep.title}
                                                </p>
                                                <button
                                                    onClick={async () => {
                                                        await fetch(`/api/student-reports/${selectedStudRep.id}/status`, {
                                                            method: "PATCH",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ status: "Ongoing" }),
                                                        });
                                                        setUnlockedStudentReports(prev => new Set(prev).add(selectedStudRep.id));
                                                        setStudentReps(prev => prev.map(r => r.id === selectedStudRep.id ? { ...r, status: "Ongoing" } : r));
                                                        setSelectedStudRep(prev => prev ? { ...prev, status: "Ongoing" } : prev);
                                                    }}
                                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition shadow-md w-full justify-center"
                                                >
                                                    <Eye className="w-4 h-4" /> See the concern
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );

                            // ── UNLOCKED view ──
                            return (
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="px-6 py-5 bg-white border-b border-slate-100">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h2 className="text-base font-extrabold text-slate-900">{selectedStudRep.title}</h2>
                                                <p className="text-xs text-slate-400 mt-0.5">{selectedStudRep.submitted_at}</p>
                                                <span className={`inline-block mt-2 text-[11px] px-2 py-0.5 rounded-lg font-semibold ${getStudentCategoryStyle(selectedStudRep.category)}`}>{selectedStudRep.category}</span>
                                            </div>
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getStudentStatusStyle(selectedStudRep.status)}`}>{selectedStudRep.status}</span>
                                        </div>
                                    </div>

                                    {/* Message body + replies */}
                                    <div className="flex-1 overflow-y-auto px-6 py-5">
                                        {/* Student bubble */}
                                        <div className="flex items-start gap-3 mb-5">
                                            <div className={`w-9 h-9 rounded-full ${getAvatarColor(selectedStudRep.student_name)} flex items-center justify-center text-white text-xs font-extrabold shrink-0 mt-0.5`}>{getStudentInitials(selectedStudRep.student_name)}</div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-800 mb-1">{selectedStudRep.student_name} <span className="font-normal text-slate-400">· {selectedStudRep.grade_level}, {selectedStudRep.section}</span></p>
                                                <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm border border-slate-100 text-sm text-slate-700 leading-relaxed">
                                                    {selectedStudRep.description}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Adviser replies */}
                                        {selectedStudRep.replies?.map((reply, i) => (
                                            <div key={i} className="flex items-start gap-3 mb-4 flex-row-reverse">
                                                <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-extrabold shrink-0 mt-0.5">Me</div>
                                                <div className="flex-1 flex flex-col items-end">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] text-slate-400">{reply.sent_at}</span>
                                                        <p className="text-xs font-bold text-slate-800">You</p>
                                                    </div>
                                                    <div className="bg-emerald-500 text-white rounded-2xl rounded-tr-none px-4 py-3 shadow-sm text-sm leading-relaxed max-w-[85%]">
                                                        {reply.message}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Actions + Reply */}
                                    <div className="px-6 py-4 bg-white border-t border-slate-100">
                                        <div className="flex flex-wrap gap-2 mb-4">

                                            {selectedStudRep.status !== "Resolved" && (
                                                <button onClick={() => setStudentResolveTargetId(selectedStudRep.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition">
                                                    <CheckCircle className="w-3.5 h-3.5" /> Resolve
                                                </button>
                                            )}
                                            {/* Notify Parent — disabled after first send to prevent duplicate reports */}
                                            {notifiedStudentReports.has(selectedStudRep.id) ? (
                                                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-xs font-bold border border-slate-200 cursor-not-allowed">
                                                    <CheckCircle className="w-3.5 h-3.5" /> Parent Notified
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => setNotifyTarget(selectedStudRep)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold border border-blue-200 hover:bg-blue-100 transition"
                                                >
                                                    <Send className="w-3.5 h-3.5" /> Notify Parent
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Admin message detail (Principal) ── */}
                        {leftTab === "Principal" && selectedAdminMsg && (
                            <div className="flex-1 flex flex-col overflow-hidden">
                                <div className="px-6 py-5 bg-white border-b border-slate-100 border-l-4 border-l-violet-500">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-violet-600">
                                                <Shield className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-extrabold text-slate-900">{selectedAdminMsg.sender_name}</p>
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
                                        {!!selectedAdminMsg.categories?.length && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {selectedAdminMsg.categories.map((cat) => (
                                                    <span key={cat} className={`text-[11px] px-2 py-0.5 rounded-lg font-semibold ${getAdminCategoryStyle(cat)}`}>
                                                        {cat}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div ref={adminMessagesRef} className="flex-1 overflow-y-auto px-6 py-5">

                                    {/* Original message */}
                                    {(() => {
                                        const adviserSent = selectedAdminMsg.conversationId?.startsWith("adviser-sent-principal:");
                                        return (
                                            <div className={`flex items-start gap-3 mb-5 ${adviserSent ? "flex-row-reverse" : ""}`}>
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${adviserSent ? "bg-emerald-500" : "bg-violet-600"}`}>
                                                    {adviserSent ? "Me" : <Shield className="w-4 h-4 text-white" />}
                                                </div>
                                                <div className={`flex-1 flex flex-col ${adviserSent ? "items-end" : "items-start"}`}>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-xs font-bold text-slate-800">{adviserSent ? "You" : selectedAdminMsg.sender_name}</p>
                                                        <span className="text-[10px] text-slate-400">{selectedAdminMsg.sent_at}</span>
                                                    </div>
                                                    <div className={`px-4 py-3 shadow-sm text-sm leading-relaxed whitespace-pre-wrap rounded-2xl max-w-[85%] ${adviserSent ? "bg-emerald-500 text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"}`}>
                                                        {selectedAdminMsg.message}
                                                        <AttachmentChips attachments={selectedAdminMsg.attachments} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Conversation replies */}
                                    {selectedAdminMsg.replies?.map((reply, i) => {
                                        const mine = reply.sender === "Adviser";
                                        return (
                                            <div key={i} className={`flex items-start gap-3 mb-4 ${mine ? "flex-row-reverse" : ""}`}>
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-extrabold shrink-0 mt-0.5 ${mine ? "bg-emerald-500" : "bg-violet-600"}`}>
                                                    {mine ? "Me" : <Shield className="w-4 h-4 text-white" />}
                                                </div>
                                                <div className={`flex-1 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {mine && <span className="text-[10px] text-slate-400">{reply.sent_at}</span>}
                                                        <p className="text-xs font-bold text-slate-800">{mine ? "You" : "Principal"}</p>
                                                        {!mine && <span className="text-[10px] text-slate-400">{reply.sent_at}</span>}
                                                    </div>
                                                    <div className={`rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed max-w-[85%] ${mine ? "bg-emerald-500 text-white rounded-tr-none" : "bg-white text-slate-700 border border-slate-100 rounded-tl-none"}`}>
                                                        {reply.message && <p className="whitespace-pre-wrap">{reply.message}</p>}
                                                        <AttachmentChips attachments={reply.attachments} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                    }
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
                                        <div className="flex-1 rounded-xl border border-slate-200 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100 transition overflow-hidden bg-slate-50">
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
                                            disabled={sendingReply || (!replyText.trim() && replyAttachments.length === 0)}
                                            className={`p-2.5 rounded-xl transition ${!sendingReply && (replyText.trim() || replyAttachments.length > 0) ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
                                        >
                                            {sendingReply ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
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
            <ResolveConfirmationModal
                open={resolveTargetId !== null}
                saving={resolving}
                onCancel={() => { if (!resolving) setResolveTargetId(null); }}
                onConfirm={() => { void confirmResolve(); }}
            />
            <ResolveConfirmationModal
                open={studentResolveTargetId !== null}
                saving={resolvingStudent}
                onCancel={() => { if (!resolvingStudent) setStudentResolveTargetId(null); }}
                onConfirm={() => { void confirmStudentResolve(); }}
            />
            {showNewMessage && (
                <NewMessageModal
                    mode={leftTab === "Principal" ? "message" : "concern"}
                    onClose={() => setShowNewMessage(false)}
                    onSent={async () => { await Promise.all([loadReports(), loadAdminMessages()]); }}
                />
            )}

            {/* Notify Parent Modal */}
            {notifyTarget && (
                <NotifyParentModal
                    studRep={notifyTarget}
                    onSend={async (rep, msg) => {
                        const forwardedReport = await sendToParent(rep, msg);
                        // Switch to Parent tab so the adviser can see the forwarded report
                        setLeftTab("Parent");
                        if (forwardedReport) {
                            setSelectedReport(forwardedReport);
                            setSelectedParent(groupByParent([forwardedReport])[0] ?? null);
                            setUnlockedReports(prev => new Set(prev).add(forwardedReport.id));
                            setViewStep("detail");
                        } else {
                            setSelectedParent(null);
                            setSelectedReport(null);
                            setViewStep("list");
                        }
                    }}
                    onClose={() => setNotifyTarget(null)}
                />
            )}

            {/* Escalate to Guidance Confirmation Modal */}
            {escalateTarget !== null && (
                <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">
                        {escalateSuccess ? (
                            <div className="flex flex-col items-center gap-3 py-10 px-6 text-center">
                                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center">
                                    <TriangleAlert className="w-7 h-7 text-orange-500" />
                                </div>
                                <p className="text-base font-extrabold text-slate-900">Escalated to Guidance</p>
                                <p className="text-sm text-slate-500 leading-relaxed">
                                    This report has been escalated to the Guidance Counselor. Thank you!
                                </p>
                                <button
                                    onClick={() => { setEscalateTarget(null); setEscalateSuccess(false); }}
                                    className="mt-2 px-7 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition"
                                >
                                    Done
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="px-6 py-5 border-b border-slate-100">
                                    <h2 className="text-lg font-extrabold text-slate-900">Escalate to Guidance?</h2>
                                    <p className="text-sm text-slate-400 mt-1">
                                        Are you sure you want to escalate this report to the Guidance Counselor?
                                    </p>
                                </div>
                                <div className="flex items-center justify-end gap-3 px-6 py-4">
                                    <button
                                        onClick={() => setEscalateTarget(null)}
                                        disabled={escalating}
                                        className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (escalating) return;
                                            setEscalating(true);
                                            try {
                                                const escalated = await escalateToGuidance(escalateTarget);
                                                if (escalated) {
                                                    setEscalateTarget(null);
                                                    setEscalateSuccess(false);
                                                    setSuccessNotice("Concern escalated successfully. The Guidance Office can now review it in their Reports dashboard.");
                                                    window.setTimeout(() => setSuccessNotice(""), 5000);
                                                }
                                            } finally {
                                                setEscalating(false);
                                            }
                                        }}
                                        disabled={escalating}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition"
                                    >
                                        {escalating ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <TriangleAlert className="w-3.5 h-3.5" />}
                                        {escalating ? "Escalating..." : "Yes, Escalate"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            <AdviserReportsGuide onStepChange={setGuideTarget} />
        </div>
    );
}

export default function ReportsPage() {
    return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><ReportsPageContent /></Suspense>;
}
