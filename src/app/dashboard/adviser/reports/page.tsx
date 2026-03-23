"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
    AlertTriangle, Clock, CheckCircle,
    ChevronRight, Paperclip, Send, MessageSquare,
    TriangleAlert, Upload,
    GraduationCap, User, X, Shield, Monitor,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import {
    MOCK_REPORTS, MOCK_STUDENT_REPORTS, MOCK_ADMIN_MESSAGES,
    type Report, type ReportStatus, type ReportCategory,
    type StudentReport, type StudentReportStatus, type StudentReportCategory,
    type AdminMessage, type AdminSender, type AdminMsgStatus,
} from "../data";

// ── Types (local only) ────────────────────────────────────────────────────────
interface ParentGroup {
    parent_name: string;
    student_name: string;
    initials: string;
    reports: Report[];
    unread: number;
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
function getAvatarColor(name: string) {
    const colors = ["bg-emerald-500","bg-blue-500","bg-violet-500","bg-orange-500","bg-pink-500","bg-teal-500"];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
}
function getStatusStyle(status: ReportStatus) {
    switch (status) {
        case "New":       return "bg-emerald-500 text-white";
        case "Read":      return "bg-slate-200 text-slate-600";
        case "Ongoing":   return "bg-blue-100 text-blue-600";
        case "Resolved":  return "bg-emerald-100 text-emerald-700";
        case "Escalated": return "bg-red-100 text-red-600";
    }
}
function getStudentStatusStyle(status: StudentReportStatus) {
    switch (status) {
        case "New":       return "bg-emerald-500 text-white";
        case "Ongoing":   return "bg-amber-100 text-amber-700";
        case "Escalated": return "bg-red-100 text-red-600";
        case "Resolved":  return "bg-sky-100 text-sky-700";
    }
}
function getAdminMsgStatusStyle(status: AdminMsgStatus) {
    switch (status) {
        case "New":     return "bg-violet-500 text-white";
        case "Read":    return "bg-slate-200 text-slate-600";
        case "Replied": return "bg-emerald-100 text-emerald-700";
    }
}
function getCategoryStyle(cat: ReportCategory) {
    switch (cat) {
        case "Academic Concern": return "bg-blue-50 text-blue-600 border border-blue-200";
        case "Request":          return "bg-amber-50 text-amber-600 border border-amber-200";
        case "Absence Excuse":   return "bg-teal-50 text-teal-600 border border-teal-200";
        case "Behavioral":       return "bg-red-50 text-red-500 border border-red-200";
        case "Other":            return "bg-slate-100 text-slate-500 border border-slate-200";
    }
}
function getStudentCategoryStyle(cat: StudentReportCategory) {
    switch (cat) {
        case "Behavioral": return "bg-rose-50 text-rose-600 border border-rose-200";
        case "Safety":     return "bg-red-50 text-red-600 border border-red-200";
        case "Academic":   return "bg-sky-50 text-sky-600 border border-sky-200";
        case "Other":      return "bg-slate-100 text-slate-500 border border-slate-200";
    }
}
function getAdminCategoryStyle(cat: string) {
    switch (cat) {
        case "Announcement": return "bg-violet-50 text-violet-600 border border-violet-200";
        case "Directive":    return "bg-red-50 text-red-600 border border-red-200";
        case "Reminder":     return "bg-amber-50 text-amber-600 border border-amber-200";
        case "Request":      return "bg-blue-50 text-blue-600 border border-blue-200";
        default:             return "bg-slate-100 text-slate-500 border border-slate-200";
    }
}
function groupByParent(reports: Report[]): ParentGroup[] {
    const map: Record<string, ParentGroup> = {};
    for (const r of reports) {
        if (!map[r.parent_name]) {
            map[r.parent_name] = { parent_name: r.parent_name, student_name: r.student_name, initials: getInitials(r.parent_name), reports: [], unread: 0 };
        }
        map[r.parent_name].reports.push(r);
        if (r.status === "New") map[r.parent_name].unread++;
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
type LeftTab   = "Parent" | "Student" | "Principal" | "ICT";
type MsgCategory = "Academic Concern" | "Behavioral Issue" | "Health/Medical" | "Attendance" | "General Inquiry" | "Other";
const MSG_CATEGORIES: MsgCategory[] = ["Academic Concern","Behavioral Issue","Health/Medical","Attendance","General Inquiry","Other"];

const PARENTS_LIST = [
    { id: "p1", name: "Maria Santos Doe's Parent", student: "Maria Santos Doe",  type: "parent" as const },
    { id: "p2", name: "Juan dela Cruz's Parent",   student: "Juan dela Cruz",    type: "parent" as const },
    { id: "p3", name: "Pedro Reyes's Parent",      student: "Pedro Reyes",       type: "parent" as const },
    { id: "p4", name: "Ana Reyes's Parent",        student: "Ana Reyes",         type: "parent" as const },
    { id: "p5", name: "Sofia Torres's Parent",     student: "Sofia Torres",      type: "parent" as const },
];
const ADMIN_RECIPIENTS = [
    { id: "a1", name: "Principal Esperanza Villanueva", email: "principal@santiagoes.edu.ph", role: "Principal", type: "admin" as const },
    { id: "a2", name: "ICT Coordinator Rolan Bautista", email: "ict@santiagoes.edu.ph",       role: "ICT",       type: "admin" as const },
];
type Recipient = (typeof PARENTS_LIST[0]) | (typeof ADMIN_RECIPIENTS[0]);

// ── New Message Modal ─────────────────────────────────────────────────────────
function NewMessageModal({ onClose }: { onClose: () => void }) {
    const [recipientId,   setRecipientId]   = useState("");
    const [recipientOpen, setRecipientOpen] = useState(false);
    const [subject,       setSubject]       = useState("");
    const [category,      setCategory]      = useState<MsgCategory>("Academic Concern");
    const [message,       setMessage]       = useState("");
    const [submitted,     setSubmitted]     = useState(false);
    const recipientRef = useRef<HTMLDivElement>(null);
    const allRecipients: Recipient[] = [...ADMIN_RECIPIENTS, ...PARENTS_LIST];
    const selectedRecipient = allRecipients.find(r => r.id === recipientId);
    const canSubmit = recipientId && subject.trim() && message.trim();

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

    function RecipientAvatar({ r }: { r: Recipient }) {
        if (r.type === "admin") {
            const isICT = (r as typeof ADMIN_RECIPIENTS[0]).role === "ICT";
            return (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isICT ? "bg-cyan-500" : "bg-violet-600"}`}>
                    {isICT ? <Monitor className="w-4 h-4 text-white" /> : <Shield className="w-4 h-4 text-white" />}
                </div>
            );
        }
        return (
            <div className={`w-8 h-8 rounded-full ${getAvatarColor(r.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {getInitials(r.name)}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-start justify-end p-5" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[calc(100vh-40px)] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-xl font-extrabold text-slate-900">New Message</h2>
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
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Send To <span className="text-red-500">*</span></label>
                            <div className="relative" ref={recipientRef}>
                                <button type="button" onClick={() => setRecipientOpen(p => !p)}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-left hover:border-emerald-300 transition">
                                    {selectedRecipient ? (
                                        <><RecipientAvatar r={selectedRecipient} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{selectedRecipient.name}</p>
                                            <p className="text-xs text-slate-400">{selectedRecipient.type === "admin" ? (selectedRecipient as typeof ADMIN_RECIPIENTS[0]).email : `Student: ${(selectedRecipient as typeof PARENTS_LIST[0]).student}`}</p>
                                        </div></>
                                    ) : <p className="text-sm text-slate-400 flex-1">Select a recipient...</p>}
                                    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${recipientOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                {recipientOpen && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">School Admin</p></div>
                                        {ADMIN_RECIPIENTS.map(r => {
                                            const isICT = r.role === "ICT";
                                            return (
                                                <button key={r.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); }}
                                                    className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === r.id ? "bg-violet-50" : ""}`}>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isICT ? "bg-cyan-500" : "bg-violet-600"}`}>
                                                        {isICT ? <Monitor className="w-4 h-4 text-white" /> : <Shield className="w-4 h-4 text-white" />}
                                                    </div>
                                                    <div><p className="text-sm font-semibold text-slate-800">{r.name}</p><p className="text-xs text-slate-400">{r.email}</p></div>
                                                    {recipientId === r.id && <CheckCircle className="w-4 h-4 text-violet-500 ml-auto shrink-0" />}
                                                </button>
                                            );
                                        })}
                                        <div className="px-3 py-2 bg-slate-50 border-t border-b border-slate-100"><p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Parents</p></div>
                                        {PARENTS_LIST.map(p => (
                                            <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); setRecipientId(p.id); setRecipientOpen(false); }}
                                                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-slate-50 transition ${recipientId === p.id ? "bg-emerald-50" : ""}`}>
                                                <div className={`w-8 h-8 rounded-full ${getAvatarColor(p.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{getInitials(p.name)}</div>
                                                <div><p className="text-sm font-semibold text-slate-800">{p.name}</p><p className="text-xs text-slate-400">Student: {p.student}</p></div>
                                                {recipientId === p.id && <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Subject <span className="text-red-500">*</span></label>
                            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter subject..."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-2">Category <span className="text-red-500">*</span></label>
                            <div className="flex flex-wrap gap-2">
                                {MSG_CATEGORIES.map(cat => (
                                    <button key={cat} type="button" onClick={() => setCategory(cat)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${category === cat ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                                        <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${category === cat ? "border-emerald-500" : "border-slate-300"}`}>
                                            {category === cat && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                        </span>
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Message <span className="text-red-500">*</span></label>
                            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message..." rows={5}
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 resize-none outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">Attachments</label>
                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition">
                                <Upload className="w-6 h-6 text-slate-300" />
                                <p className="text-sm font-medium text-slate-500">Click to upload or drag and drop</p>
                                <p className="text-xs text-slate-400">PDF, DOC, DOCX, JPG, PNG (max. 10MB)</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">Cancel</button>
                            <button onClick={() => { if (canSubmit) setSubmitted(true); }} disabled={!canSubmit}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition ${canSubmit ? "bg-emerald-500 hover:bg-emerald-600" : "bg-emerald-300 cursor-not-allowed"}`}>
                                <Send className="w-3.5 h-3.5" /> Send Message
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdviserReportsPage() {
    const searchParams = useSearchParams();
    const { setUnreadCount } = useNotifContext();

    const [filterTab,        setFilterTab]        = useState<FilterTab>("All");
    const [leftTab,          setLeftTab]          = useState<LeftTab>("Parent");
    const [selectedParent,   setSelectedParent]   = useState<ParentGroup | null>(null);
    const [selectedReport,   setSelectedReport]   = useState<Report | null>(null);
    const [responseText,     setResponseText]     = useState("");
    const [markAs,           setMarkAs]           = useState<"Resolved" | "Escalated" | null>(null);
    const [reports,          setReports]          = useState<Report[]>(MOCK_REPORTS);
    const [sentMsg,          setSentMsg]          = useState("");
    const [selectedStudent,  setSelectedStudent]  = useState<StudentGroup | null>(null);
    const [selectedStReport, setSelectedStReport] = useState<StudentReport | null>(null);
    const [studentReports,   setStudentReports]   = useState<StudentReport[]>(MOCK_STUDENT_REPORTS);
    const [stReply,          setStReply]          = useState("");
    const [stSentMsg,        setStSentMsg]        = useState("");
    const [adminMessages,    setAdminMessages]    = useState<AdminMessage[]>(MOCK_ADMIN_MESSAGES);
    const [selectedAdmin,    setSelectedAdmin]    = useState<AdminMessage | null>(null);
    const [adminReply,       setAdminReply]       = useState("");
    const [adminSentMsg,     setAdminSentMsg]     = useState("");
    const [showMsgModal,     setShowMsgModal]     = useState(false);

    // ── Counts ────────────────────────────────────────────────────────────────
    const pendingParent    = reports.filter(r => r.status === "New").length;
    const escalatedParent  = reports.filter(r => r.status === "Escalated").length;
    const pendingStudent   = studentReports.filter(r => r.status === "New").length;
    const escalatedStudent = studentReports.filter(r => r.status === "Escalated").length;
    const newPrincipal     = adminMessages.filter(m => m.sender === "Principal" && m.status === "New").length;
    const newICT           = adminMessages.filter(m => m.sender === "ICT"       && m.status === "New").length;
    const totalPending     = pendingParent + pendingStudent;
    const totalEscalated   = escalatedParent + escalatedStudent;

    // ── FIXED: only count actionable items for the sidebar badge ─────────────
    // New parent reports + New student reports + Escalated (both) + New admin messages
    useEffect(() => {
        const actionable =
            reports.filter(r => r.status === "New" || r.status === "Escalated").length +
            studentReports.filter(r => r.status === "New" || r.status === "Escalated").length +
            adminMessages.filter(m => m.status === "New").length;
        setUnreadCount(actionable);
    }, [reports, studentReports, adminMessages, setUnreadCount]);

    // URL deep-link
    useEffect(() => {
        const parentParam = searchParams.get("parent");
        const statusParam = searchParams.get("status");
        if (statusParam === "Escalated") setFilterTab("Escalated");
        else if (statusParam === "Resolved") setFilterTab("All");
        else if (statusParam === "Pending")  setFilterTab("Pending");
        if (parentParam) {
            const allGroups = groupByParent(MOCK_REPORTS);
            const match = allGroups.find(g => g.parent_name.toLowerCase() === decodeURIComponent(parentParam).toLowerCase());
            if (match) {
                setSelectedParent(match);
                if (statusParam) {
                    const statusReport = match.reports.find(r => r.status.toLowerCase() === statusParam.toLowerCase());
                    if (statusReport) {
                        setSelectedReport({ ...statusReport, status: statusReport.status === "New" ? "Read" : statusReport.status });
                        setReports(prev => prev.map(r => r.id === statusReport.id && r.status === "New" ? { ...r, status: "Read" } : r));
                        return;
                    }
                }
                if (match.reports.length > 0) {
                    const first = match.reports[0];
                    setSelectedReport({ ...first, status: first.status === "New" ? "Read" : first.status });
                    setReports(prev => prev.map(r => r.id === first.id && r.status === "New" ? { ...r, status: "Read" } : r));
                }
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const groups = groupByParent(reports);
    const filteredGroups = groups.map(g => {
        let filtered = g.reports;
        if (filterTab === "Pending")   filtered = g.reports.filter(r => r.status === "New");
        if (filterTab === "Ongoing")   filtered = g.reports.filter(r => r.status === "Ongoing" || r.status === "Read");
        if (filterTab === "Escalated") filtered = g.reports.filter(r => r.status === "Escalated");
        return { ...g, reports: filtered };
    }).filter(g => g.reports.length > 0);

    function handleSelectParent(group: ParentGroup) { setSelectedParent(group); setSelectedReport(null); setResponseText(""); setSentMsg(""); setMarkAs(null); }
    function handleSelectReport(report: Report) {
        setReports(prev => prev.map(r => r.id === report.id && r.status === "New" ? { ...r, status: "Read" } : r));
        setSelectedReport({ ...report, status: report.status === "New" ? "Read" : report.status });
        setResponseText(""); setSentMsg(""); setMarkAs(null);
    }
    function handleSendResponse() {
        if (!responseText.trim() || !selectedReport) return;
        const finalStatus = markAs ?? (selectedReport.status === "Escalated" ? "Escalated" : "Ongoing");
        setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, status: finalStatus } : r));
        setSelectedReport(prev => prev ? { ...prev, status: finalStatus } : null);
        setSentMsg("Response sent successfully.");
        setResponseText(""); setMarkAs(null);
        setTimeout(() => setSentMsg(""), 3000);
    }

    const studentGroups = groupByStudent(studentReports);
    const filteredStudentGroups = studentGroups.map(g => {
        let filtered = g.reports;
        if (filterTab === "Pending")   filtered = g.reports.filter(r => r.status === "New");
        if (filterTab === "Ongoing")   filtered = g.reports.filter(r => r.status === "Ongoing");
        if (filterTab === "Escalated") filtered = g.reports.filter(r => r.status === "Escalated");
        return { ...g, reports: filtered };
    }).filter(g => g.reports.length > 0);

    function handleSelectStudent(group: StudentGroup) { setSelectedStudent(group); setSelectedStReport(null); setStReply(""); setStSentMsg(""); }
    function handleSelectStudentReport(report: StudentReport) {
        setStudentReports(prev => prev.map(r => r.id === report.id && r.status === "New" ? { ...r, status: "Ongoing" } : r));
        setSelectedStReport({ ...report, status: report.status === "New" ? "Ongoing" : report.status });
        setStReply(""); setStSentMsg("");
    }
    function handleSendStudentReply(action: "reply" | "resolve" | "escalate") {
        if (!selectedStReport) return;
        if (action === "reply" && !stReply.trim()) return;
        const newStatus: StudentReportStatus = action === "resolve" ? "Resolved" : action === "escalate" ? "Escalated" : "Ongoing";
        setStudentReports(prev => prev.map(r => r.id === selectedStReport.id ? { ...r, status: newStatus } : r));
        setSelectedStReport(prev => prev ? { ...prev, status: newStatus } : null);
        setStSentMsg(action === "reply" ? "Reply sent." : action === "resolve" ? "Marked as resolved." : "Escalated to principal.");
        setStReply("");
        setTimeout(() => setStSentMsg(""), 3000);
    }

    const principalMessages = adminMessages.filter(m => m.sender === "Principal");
    const ictMessages       = adminMessages.filter(m => m.sender === "ICT");
    function handleSelectAdminMsg(msg: AdminMessage) {
        setAdminMessages(prev => prev.map(m => m.id === msg.id && m.status === "New" ? { ...m, status: "Read" } : m));
        setSelectedAdmin({ ...msg, status: msg.status === "New" ? "Read" : msg.status });
        setAdminReply(""); setAdminSentMsg("");
    }
    function handleSendAdminReply() {
        if (!adminReply.trim() || !selectedAdmin) return;
        setAdminMessages(prev => prev.map(m => m.id === selectedAdmin.id ? { ...m, status: "Replied" } : m));
        setSelectedAdmin(prev => prev ? { ...prev, status: "Replied" } : null);
        setAdminSentMsg("Reply sent successfully.");
        setAdminReply("");
        setTimeout(() => setAdminSentMsg(""), 3000);
    }

    const currentAdminList = leftTab === "Principal" ? principalMessages : ictMessages;
    const stShowEscalate   = selectedStReport?.status !== "Escalated" && selectedStReport?.status !== "Resolved";
    const stShowResolve    = selectedStReport?.status !== "Resolved";
    const stShowMarkOngoing= selectedStReport?.status !== "Ongoing" && selectedStReport?.status !== "Resolved" && selectedStReport?.status !== "Escalated";

    const leftTabs: { key: LeftTab; label: string; icon: React.ReactNode; activeColor: string }[] = [
        { key: "Parent",    label: "Parents",   icon: <User className="w-3.5 h-3.5" />,          activeColor: "border-emerald-500 text-emerald-700" },
        { key: "Student",   label: "Students",  icon: <GraduationCap className="w-3.5 h-3.5" />, activeColor: "border-teal-500 text-teal-600"       },
        { key: "Principal", label: "Principal", icon: <Shield className="w-3.5 h-3.5" />,        activeColor: "border-violet-500 text-violet-700"   },
        { key: "ICT",       label: "ICT",       icon: <Monitor className="w-3.5 h-3.5" />,       activeColor: "border-cyan-500 text-cyan-600"       },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden p-5 gap-4 bg-slate-50">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Reports</h1>
                    <p className="text-slate-400 text-sm mt-0.5">Parent-submitted concerns and report management</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-3 py-2 rounded-xl">
                        <Clock className="w-3.5 h-3.5" />{totalPending} Pending
                    </div>
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-600 text-xs font-bold px-3 py-2 rounded-xl">
                        <TriangleAlert className="w-3.5 h-3.5" />{totalEscalated} Escalated
                    </div>
                    {newPrincipal > 0 && (
                        <div className="flex items-center gap-1.5 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-bold px-3 py-2 rounded-xl">
                            <Shield className="w-3.5 h-3.5" />{newPrincipal} from Principal
                        </div>
                    )}
                    {newICT > 0 && (
                        <div className="flex items-center gap-1.5 bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold px-3 py-2 rounded-xl">
                            <Monitor className="w-3.5 h-3.5" />{newICT} from ICT
                        </div>
                    )}
                    <button onClick={() => setShowMsgModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition shadow-sm">
                        <MessageSquare className="w-4 h-4" /> Message
                    </button>
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {(["All","Pending","Ongoing","Escalated"] as FilterTab[]).map(tab => {
                    const count = tab === "Pending" ? totalPending : tab === "Escalated" ? totalEscalated : null;
                    return (
                        <button key={tab} onClick={() => { setFilterTab(tab); setSelectedParent(null); setSelectedReport(null); setSelectedStudent(null); setSelectedStReport(null); setSelectedAdmin(null); }}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${filterTab === tab ? "bg-emerald-500 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                            {tab}
                            {count !== null && count > 0 && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filterTab === tab ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Three-panel layout */}
            <div className="flex-1 overflow-hidden flex gap-4 min-h-0">

                {/* Panel 1 */}
                <div className="w-[240px] xl:w-[260px] shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="grid grid-cols-2 border-b border-slate-100 shrink-0">
                        {leftTabs.map(tab => (
                            <button key={tab.key}
                                onClick={() => { setLeftTab(tab.key); setSelectedParent(null); setSelectedReport(null); setSelectedStudent(null); setSelectedStReport(null); setSelectedAdmin(null); }}
                                className={`flex items-center justify-center gap-1 py-2.5 text-[11px] font-bold transition border-b-2 relative ${leftTab === tab.key ? tab.activeColor : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                                {tab.icon}
                                <span>{tab.label}</span>
                                {tab.key === "Principal" && newPrincipal > 0 && <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center">{newPrincipal}</span>}
                                {tab.key === "ICT"       && newICT       > 0 && <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-cyan-500 text-white text-[9px] font-bold flex items-center justify-center">{newICT}</span>}
                            </button>
                        ))}
                    </div>

                    {leftTab === "Parent" && (
                        <div className="flex-1 overflow-y-auto">
                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Parents ({filteredGroups.length})</p>
                            </div>
                            {filteredGroups.length === 0 ? <div className="py-16 text-center text-slate-400 text-sm">No reports found.</div>
                                : filteredGroups.map(group => (
                                    <button key={group.parent_name} onClick={() => handleSelectParent(group)}
                                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all border-b border-slate-50 hover:bg-slate-50 ${selectedParent?.parent_name === group.parent_name ? "bg-emerald-50 border-l-[3px] border-l-emerald-500" : "border-l-[3px] border-l-transparent"}`}>
                                        <div className={`w-10 h-10 rounded-full ${getAvatarColor(group.parent_name)} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>{group.initials}</div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs text-slate-700 font-semibold leading-snug truncate">{group.parent_name}</p>
                                            <p className="text-xs text-slate-400 leading-snug mt-0.5">Student: {group.student_name}</p>
                                            <p className="text-[11px] text-slate-400 mt-1">{group.reports.length} report{group.reports.length > 1 ? "s" : ""}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            {group.unread > 0 && <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{group.unread}</span>}
                                            <ChevronRight className="w-4 h-4 text-slate-300" />
                                        </div>
                                    </button>
                                ))}
                        </div>
                    )}

                    {leftTab === "Student" && (
                        <div className="flex-1 overflow-y-auto">
                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Students ({filteredStudentGroups.length})</p>
                            </div>
                            {filteredStudentGroups.length === 0 ? <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400"><GraduationCap className="w-8 h-8 text-slate-200" /><p className="text-sm">No student reports yet</p></div>
                                : filteredStudentGroups.map(group => (
                                    <button key={group.student_name} onClick={() => handleSelectStudent(group)}
                                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all border-b border-slate-50 hover:bg-slate-50 ${selectedStudent?.student_name === group.student_name ? "bg-teal-50 border-l-[3px] border-l-teal-500" : "border-l-[3px] border-l-transparent"}`}>
                                        <div className="w-10 h-10 rounded-full bg-teal-500 ring-2 ring-teal-200 flex items-center justify-center text-white text-xs font-bold shrink-0">{group.initials}</div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs text-slate-700 font-semibold leading-snug truncate">{group.student_name}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">ID: {group.student_id}</p>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <span className="text-[11px] text-white font-semibold px-1.5 py-0.5 rounded-full bg-teal-500">{group.grade_level}</span>
                                                <span className="text-[11px] text-slate-500 font-semibold px-1.5 py-0.5 rounded-full bg-slate-100">{group.section}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            {group.unread > 0 && <span className="w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">{group.unread}</span>}
                                            <ChevronRight className="w-4 h-4 text-slate-300" />
                                        </div>
                                    </button>
                                ))}
                        </div>
                    )}

                    {(leftTab === "Principal" || leftTab === "ICT") && (
                        <div className="flex-1 overflow-y-auto">
                            <div className={`px-4 py-3 border-b border-slate-100 shrink-0 ${leftTab === "Principal" ? "bg-violet-50/50" : "bg-cyan-50/50"}`}>
                                <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${leftTab === "Principal" ? "text-violet-500" : "text-cyan-600"}`}>
                                    {leftTab === "Principal" ? <Shield className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                                    {leftTab} ({currentAdminList.length})
                                </p>
                            </div>
                            {currentAdminList.length === 0 ? <div className="py-16 text-center text-slate-400 text-sm">No messages.</div>
                                : currentAdminList.map(msg => (
                                    <button key={msg.id} onClick={() => handleSelectAdminMsg(msg)}
                                        className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all border-b border-slate-50 hover:bg-slate-50 ${
                                            selectedAdmin?.id === msg.id
                                                ? leftTab === "Principal" ? "bg-violet-50 border-l-[3px] border-l-violet-500" : "bg-cyan-50 border-l-[3px] border-l-cyan-500"
                                                : "border-l-[3px] border-l-transparent"
                                        }`}>
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${leftTab === "Principal" ? "bg-violet-600" : "bg-cyan-500"}`}>
                                            {leftTab === "Principal" ? <Shield className="w-4 h-4 text-white" /> : <Monitor className="w-4 h-4 text-white" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getAdminMsgStatusStyle(msg.status)}`}>{msg.status}</span>
                                                {msg.priority === "High" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">High</span>}
                                            </div>
                                            <p className="text-xs font-semibold text-slate-700 leading-snug line-clamp-2">{msg.subject}</p>
                                            <p className="text-[11px] text-slate-400 mt-1">{msg.sent_at.split("·")[0].trim()}</p>
                                        </div>
                                        {msg.status === "New" && <span className="w-2 h-2 rounded-full bg-violet-500 mt-2 shrink-0" />}
                                    </button>
                                ))}
                        </div>
                    )}
                </div>

                {/* Panel 2 */}
                <div className="flex-1 min-w-[280px] max-w-[400px] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    {leftTab === "Parent" && !selectedParent && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center"><MessageSquare className="w-7 h-7 text-slate-300" /></div>
                            <p className="text-sm font-medium text-center text-slate-400">Select a parent to view their reports</p>
                        </div>
                    )}
                    {leftTab === "Parent" && selectedParent && (
                        <>
                            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3 shrink-0">
                                <div className={`w-10 h-10 rounded-full ${getAvatarColor(selectedParent.parent_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{selectedParent.initials}</div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{selectedParent.parent_name}</p>
                                    <p className="text-xs text-slate-400">{selectedParent.reports.length} concern{selectedParent.reports.length > 1 ? "s" : ""} submitted</p>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {selectedParent.reports.map(report => (
                                    <button key={report.id} onClick={() => handleSelectReport(report)}
                                        className={`w-full text-left px-5 py-4 transition-all border-b border-slate-50 hover:bg-slate-50 ${selectedReport?.id === report.id ? "bg-emerald-50 border-l-[3px] border-l-emerald-500" : "border-l-[3px] border-l-transparent"}`}>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${getStatusStyle(report.status)}`}>{report.status}</span>
                                            <span className="text-[11px] text-slate-400 shrink-0">{report.submitted_at.split("·")[0].trim()}</span>
                                        </div>
                                        <span className={`inline-block mb-2 text-[11px] font-semibold px-2.5 py-1 rounded-full ${getCategoryStyle(report.category)}`}>{report.category}</span>
                                        <p className="text-sm font-semibold text-slate-800 leading-snug">{report.subject}</p>
                                        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{report.message}</p>
                                        {report.attachment && <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-400"><Paperclip className="w-3.5 h-3.5" />{report.attachment}</div>}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {leftTab === "Student" && !selectedStudent && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center"><GraduationCap className="w-7 h-7 text-slate-300" /></div>
                            <p className="text-sm font-medium text-center text-slate-400">Select a student to view their reports</p>
                        </div>
                    )}
                    {leftTab === "Student" && selectedStudent && (
                        <>
                            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3 shrink-0">
                                <div className="w-10 h-10 rounded-full bg-teal-500 ring-2 ring-teal-200 flex items-center justify-center text-white text-xs font-bold shrink-0">{selectedStudent.initials}</div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{selectedStudent.student_name}</p>
                                    <p className="text-xs text-slate-400">{selectedStudent.grade_level} — {selectedStudent.section}</p>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {selectedStudent.reports.map(report => (
                                    <button key={report.id} onClick={() => handleSelectStudentReport(report)}
                                        className={`w-full text-left px-5 py-4 transition-all border-b border-slate-50 hover:bg-slate-50 ${selectedStReport?.id === report.id ? "bg-teal-50 border-l-[3px] border-l-teal-500" : "border-l-[3px] border-l-transparent"}`}>
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${getStudentStatusStyle(report.status)}`}>{report.status}</span>
                                            <span className="text-[11px] text-slate-400 shrink-0">{report.submitted_at.split("·")[0].trim()}</span>
                                        </div>
                                        <span className={`inline-block mb-2 text-[11px] font-semibold px-2.5 py-1 rounded-full ${getStudentCategoryStyle(report.category)}`}>{report.category}</span>
                                        <p className="text-sm font-semibold text-slate-800 leading-snug">{report.title}</p>
                                        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{report.description}</p>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {(leftTab === "Principal" || leftTab === "ICT") && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${leftTab === "Principal" ? "bg-violet-100" : "bg-cyan-100"}`}>
                                {leftTab === "Principal" ? <Shield className="w-7 h-7 text-violet-400" /> : <Monitor className="w-7 h-7 text-cyan-400" />}
                            </div>
                            <p className="text-sm font-medium text-center text-slate-400">{selectedAdmin ? `Viewing message from ${leftTab}` : `Select a ${leftTab} message on the left to read it`}</p>
                        </div>
                    )}
                </div>

                {/* Panel 3 */}
                <div className="flex-[1.5] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    {leftTab === "Parent" && !selectedReport && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center"><MessageSquare className="w-7 h-7 text-slate-300" /></div>
                            <p className="text-sm font-medium text-center text-slate-400">Select a report to read and respond</p>
                        </div>
                    )}
                    {leftTab === "Parent" && selectedReport && (
                        <>
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${getStatusStyle(selectedReport.status)}`}>{selectedReport.status}</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">👤 Parent Report</span>
                                    <span className="ml-auto text-xs text-slate-400 font-medium">Report #{String(selectedReport.id).padStart(3, "0")}</span>
                                </div>
                                <span className={`inline-block mb-2 text-[11px] font-semibold px-2.5 py-1 rounded-full ${getCategoryStyle(selectedReport.category)}`}>{selectedReport.category}</span>
                                <h3 className="text-lg font-bold text-slate-800 leading-snug">{selectedReport.subject}</h3>
                                <p className="text-xs text-slate-400 mt-1">{selectedReport.submitted_at}</p>
                            </div>
                            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <div className={`w-8 h-8 rounded-full ${getAvatarColor(selectedReport.parent_name)} flex items-center justify-center text-white text-[11px] font-bold shrink-0`}>{getInitials(selectedReport.parent_name)}</div>
                                        <div>
                                            <span className="text-sm font-semibold text-slate-700 block">{selectedReport.parent_name}</span>
                                            <span className="text-xs text-slate-400">Student: {selectedReport.student_name}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">{selectedReport.message}</p>
                                    {selectedReport.attachment && (
                                        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-3.5 py-2.5 rounded-lg w-fit cursor-pointer hover:bg-emerald-100 transition">
                                            <Paperclip className="w-4 h-4" />{selectedReport.attachment}
                                        </div>
                                    )}
                                </div>
                                {selectedReport.status === "Escalated" && (
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3.5">
                                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-red-600 font-medium leading-relaxed">This report has been escalated to the Principal. You can still respond to the parent.</p>
                                    </div>
                                )}
                                {selectedReport.status === "Resolved" && (
                                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3.5">
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-emerald-700 font-medium leading-relaxed">This report has been marked as resolved.</p>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-2">Write Response</label>
                                    <textarea value={responseText} onChange={e => setResponseText(e.target.value)} placeholder="Type your response to the parent here..." rows={4}
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition resize-none placeholder:text-slate-400" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-2">Mark Report As</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={() => setMarkAs(markAs === "Resolved" ? null : "Resolved")}
                                            className={`h-11 rounded-xl border text-sm font-bold transition-all ${markAs === "Resolved" ? "border-emerald-500 bg-emerald-500 text-white shadow-sm" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
                                            <span className="flex items-center justify-center gap-2"><CheckCircle className="w-4 h-4" /> Resolved</span>
                                        </button>
                                        <button onClick={() => setMarkAs(markAs === "Escalated" ? null : "Escalated")}
                                            className={`h-11 rounded-xl border text-sm font-bold transition-all ${markAs === "Escalated" ? "border-red-500 bg-red-500 text-white shadow-sm" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
                                            <span className="flex items-center justify-center gap-2"><TriangleAlert className="w-4 h-4" /> Escalate</span>
                                        </button>
                                    </div>
                                </div>
                                {sentMsg && (
                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl">
                                        <CheckCircle className="w-4 h-4 shrink-0" />{sentMsg}
                                    </div>
                                )}
                                <button onClick={handleSendResponse} disabled={!responseText.trim()}
                                    className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-base font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                                    <Send className="w-5 h-5" /> Send Response
                                </button>
                            </div>
                        </>
                    )}
                    {leftTab === "Student" && !selectedStReport && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center"><GraduationCap className="w-7 h-7 text-slate-300" /></div>
                            <p className="text-sm font-medium text-center text-slate-400">Select a student report to read and respond</p>
                        </div>
                    )}
                    {leftTab === "Student" && selectedStReport && (
                        <>
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${getStudentStatusStyle(selectedStReport.status)}`}>{selectedStReport.status}</span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">👨‍🎓 Student Report</span>
                                    <span className="ml-auto text-xs text-slate-400 font-medium">Report #{String(selectedStReport.id).padStart(4, "0")}</span>
                                </div>
                                <span className={`inline-block mb-2 text-[11px] font-semibold px-2.5 py-1 rounded-full ${getStudentCategoryStyle(selectedStReport.category)}`}>{selectedStReport.category}</span>
                                <h3 className="text-lg font-bold text-slate-800 leading-snug">{selectedStReport.title}</h3>
                                <p className="text-xs text-slate-400 mt-1">{selectedStReport.submitted_at}</p>
                            </div>
                            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                                <div className="bg-teal-50/60 rounded-xl p-5 border border-teal-100">
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-teal-500 ring-2 ring-teal-200 flex items-center justify-center text-white text-[11px] font-bold shrink-0">{getStudentInitials(selectedStReport.student_name)}</div>
                                        <div>
                                            <span className="text-sm font-semibold text-slate-700 block">{selectedStReport.student_name}</span>
                                            <span className="text-xs text-slate-400">{selectedStReport.grade_level} — {selectedStReport.section} · ID: {selectedStReport.student_id}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">{selectedStReport.description}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-center text-gray-500">
                                    Report submitted directly by student {selectedStReport.student_name} via the student portal. • {selectedStReport.submitted_at}
                                </div>
                                {selectedStReport.status === "Escalated" && (
                                    <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3.5">
                                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-red-600 font-medium leading-relaxed">This report has been escalated to the Principal.</p>
                                    </div>
                                )}
                                {selectedStReport.status === "Resolved" && (
                                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3.5">
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-emerald-700 font-medium leading-relaxed">This report has been marked as resolved.</p>
                                    </div>
                                )}
                                {selectedStReport.status !== "Resolved" && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-2">Adviser Response</label>
                                            <textarea value={stReply} onChange={e => setStReply(e.target.value)} placeholder="Write your response to the student..." rows={4}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 focus:bg-white transition resize-none placeholder:text-slate-400" />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button onClick={() => handleSendStudentReply("reply")} disabled={!stReply.trim()}
                                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${stReply.trim() ? "bg-teal-500 hover:bg-teal-600 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                                                <Send className="w-4 h-4" /> Send Reply
                                            </button>
                                            {stShowMarkOngoing && <button onClick={() => handleSendStudentReply("reply")} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition">Mark Ongoing</button>}
                                            {stShowEscalate   && <button onClick={() => handleSendStudentReply("escalate")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"><TriangleAlert className="w-4 h-4" /> Escalate to Principal</button>}
                                            {stShowResolve    && <button onClick={() => handleSendStudentReply("resolve")}  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 transition"><CheckCircle className="w-4 h-4" /> Resolve</button>}
                                        </div>
                                    </>
                                )}
                                {stSentMsg && (
                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl">
                                        <CheckCircle className="w-4 h-4 shrink-0" />{stSentMsg}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                    {(leftTab === "Principal" || leftTab === "ICT") && !selectedAdmin && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${leftTab === "Principal" ? "bg-violet-100" : "bg-cyan-100"}`}>
                                {leftTab === "Principal" ? <Shield className="w-7 h-7 text-violet-400" /> : <Monitor className="w-7 h-7 text-cyan-400" />}
                            </div>
                            <p className="text-sm font-medium text-center text-slate-400">Select a message from {leftTab === "Principal" ? "the Principal" : "ICT"} to read it</p>
                        </div>
                    )}
                    {(leftTab === "Principal" || leftTab === "ICT") && selectedAdmin && (
                        <>
                            <div className={`px-6 py-4 border-b border-slate-100 shrink-0 ${leftTab === "Principal" ? "bg-violet-50/40" : "bg-cyan-50/40"}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${getAdminMsgStatusStyle(selectedAdmin.status)}`}>{selectedAdmin.status}</span>
                                    {selectedAdmin.priority === "High" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">🔴 High Priority</span>}
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${leftTab === "Principal" ? "bg-violet-100 text-violet-700" : "bg-cyan-100 text-cyan-700"}`}>
                                        {leftTab === "Principal" ? "🏫 From Principal" : "💻 From ICT"}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 leading-snug">{selectedAdmin.subject}</h3>
                                <p className="text-xs text-slate-400 mt-1">{selectedAdmin.sent_at}</p>
                            </div>
                            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                                <div className={`rounded-xl p-5 border ${leftTab === "Principal" ? "bg-violet-50/50 border-violet-100" : "bg-cyan-50/50 border-cyan-100"}`}>
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${leftTab === "Principal" ? "bg-violet-600" : "bg-cyan-500"}`}>
                                            {leftTab === "Principal" ? <Shield className="w-4 h-4 text-white" /> : <Monitor className="w-4 h-4 text-white" />}
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-slate-700 block">{selectedAdmin.sender_name}</span>
                                            <span className="text-xs text-slate-400">{selectedAdmin.sender_email}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">{selectedAdmin.message}</p>
                                </div>
                                {selectedAdmin.status === "Replied" && (
                                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3.5">
                                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-emerald-700 font-medium leading-relaxed">You have already replied to this message.</p>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-2">Write Reply</label>
                                    <textarea value={adminReply} onChange={e => setAdminReply(e.target.value)} placeholder={`Write your reply to ${leftTab === "Principal" ? "the Principal" : "ICT Coordinator"}...`} rows={4}
                                        className={`w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:bg-white transition resize-none placeholder:text-slate-400 ${leftTab === "Principal" ? "border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100" : "border-slate-200 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"}`} />
                                </div>
                                {adminSentMsg && (
                                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl">
                                        <CheckCircle className="w-4 h-4 shrink-0" />{adminSentMsg}
                                    </div>
                                )}
                                <button onClick={handleSendAdminReply} disabled={!adminReply.trim()}
                                    className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-xl text-base font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${leftTab === "Principal" ? "bg-violet-600 hover:bg-violet-700" : "bg-cyan-500 hover:bg-cyan-600"}`}>
                                    <Send className="w-5 h-5" /> Send Reply
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {showMsgModal && <NewMessageModal onClose={() => setShowMsgModal(false)} />}
        </div>
    );
}