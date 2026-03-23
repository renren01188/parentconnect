"use client";

// FILE: app/dashboard/parent/reports/page.tsx

import React, { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
    Plus, X, Clock, Paperclip, Send, ChevronDown,
    Upload, Info, CheckCircle, AlertCircle,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import { useNotifContext } from "../context/NotificationContext";
import { INITIAL_REPORTS, type Report, type MessageStatus, type ChatMessage } from "../data";

type FilterTab = "All Messages" | "Adviser" | "Principal" | "Unread";
type Category  = "Academic Concern" | "Behavioral Issue" | "Health/Medical" | "Attendance" | "Permission Request" | "General Inquiry" | "Other";
type Priority  = "Low" | "Medium" | "High" | "Urgent";

const RECIPIENTS = {
    "Class Advisers": [
        { id: "ac", name: "Ms. Ana Cruz",    role: "Grade 3 - Mabuhay",  jobTitle: "Class Adviser", initials: "AC", color: "#f59e0b" },
        { id: "ml", name: "Ms. Maria Lopez", role: "Grade 3 - Bayanihan", jobTitle: "Class Adviser", initials: "ML", color: "#10b981" },
    ],
    "School Administration": [
        { id: "rp", name: "Mr. Roberto Palma", role: "Principal", jobTitle: "Principal", initials: "RP", color: "#8b5cf6" },
    ],
};

const CATEGORIES: Category[] = ["Academic Concern","Behavioral Issue","Health/Medical","Attendance","Permission Request","General Inquiry","Other"];
const PRIORITIES: Priority[]  = ["Low","Medium","High","Urgent"];

function StatusBadge({ status }: { status: MessageStatus }) {
    const styles: Record<MessageStatus, string> = {
        "Pending Response": "bg-amber-100 text-amber-700 border border-amber-300",
        "Resolved":         "bg-emerald-100 text-emerald-700 border border-emerald-300",
        "Read":             "bg-sky-100 text-sky-600 border border-sky-200",
        "Unread":           "bg-slate-100 text-slate-500 border border-slate-200",
    };
    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${styles[status]}`}>
            {status === "Pending Response" && <AlertCircle className="w-3 h-3" />}
            {status}
        </span>
    );
}

function RadioOption({ label, checked, onClick, ringColor = "#2563eb" }: { label: string; checked: boolean; onClick: () => void; ringColor?: string }) {
    return (
        <button type="button" onClick={onClick}
            style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "7px 12px", borderRadius: 8,
                border: checked ? `2px solid ${ringColor}` : "1.5px solid #e2e8f0",
                background: "#fff", color: checked ? "#1e293b" : "#64748b",
                fontSize: 13, fontWeight: checked ? 600 : 400,
                cursor: "pointer", whiteSpace: "nowrap",
            }}>
            <span style={{
                width: 15, height: 15, minWidth: 15, borderRadius: "50%",
                border: `2px solid ${checked ? ringColor : "#cbd5e1"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#fff", flexShrink: 0,
            }}>
                {checked && <span style={{ width: 7, height: 7, borderRadius: "50%", background: ringColor }} />}
            </span>
            {label}
        </button>
    );
}

function NewReportModal({ onClose, onSubmit }: {
    onClose: () => void;
    onSubmit: (r: Omit<Report, "id"|"messages"|"time"|"unread"|"grade"|"section">) => void;
}) {
    const [recipientId,   setRecipientId]   = useState("ac");
    const [recipientOpen, setRecipientOpen] = useState(false);
    const [subject,       setSubject]       = useState("");
    const [category,      setCategory]      = useState<Category>("Academic Concern");
    const [priority,      setPriority]      = useState<Priority>("Medium");
    const [message,       setMessage]       = useState("");
    const [submitted,     setSubmitted]     = useState(false);

    const recipientRef = useRef<HTMLDivElement>(null);
    const allRecs      = Object.values(RECIPIENTS).flat();
    const selectedRec  = allRecs.find(r => r.id === recipientId)!;
    const PRIORITY_COLORS: Record<Priority, string> = { Low: "#94a3b8", Medium: "#f59e0b", High: "#ef4444", Urgent: "#dc2626" };

    useEffect(() => {
        function h(e: MouseEvent) {
            if (recipientOpen && recipientRef.current && !recipientRef.current.contains(e.target as Node)) setRecipientOpen(false);
        }
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [recipientOpen]);

    useEffect(() => {
        function h(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose]);

    const canSubmit = subject.trim() && message.trim();

    function handleSubmit() {
        if (!canSubmit) return;
        onSubmit({ recipientName: selectedRec.name, recipientRole: selectedRec.role, recipientInitials: selectedRec.initials, recipientColor: selectedRec.color, subject: subject.trim(), preview: message.trim().slice(0, 80) + "...", status: "Pending Response" });
        setSubmitted(true);
    }

    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: "20px 24px 20px 0" }}
            onClick={onClose}>
            <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: 480, maxHeight: "calc(100vh - 40px)", overflowY: "auto", display: "flex", flexDirection: "column" }}
                onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "22px 24px 18px", borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>New Report</h2>
                        <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>Submit a report or concern to school staff</p>
                    </div>
                    <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", marginTop: 2 }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#475569"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}>
                        <X style={{ width: 16, height: 16 }} />
                    </button>
                </div>
                {submitted ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px", gap: 12 }}>
                        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <CheckCircle style={{ width: 28, height: 28, color: "#10b981" }} />
                        </div>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Report Submitted!</p>
                        <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", margin: 0 }}>
                            Your report has been sent to {selectedRec?.name}. You&apos;ll be notified when they respond.
                        </p>
                        <button onClick={onClose} style={{ marginTop: 8, padding: "10px 28px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#1d4ed8")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#2563eb")}>
                            Done
                        </button>
                    </div>
                ) : (
                    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
                        <div>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Send To <span style={{ color: "#ef4444" }}>*</span></label>
                            <div className="relative" ref={recipientRef}>
                                <button type="button" onClick={() => setRecipientOpen(p => !p)}
                                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", textAlign: "left", cursor: "pointer", boxSizing: "border-box" }}>
                                    <span style={{ width: 34, height: 34, minWidth: 34, borderRadius: "50%", background: selectedRec.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{selectedRec.initials}</span>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>{selectedRec.name}</p>
                                        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{selectedRec.jobTitle}</p>
                                    </div>
                                    <ChevronDown style={{ width: 16, height: 16, color: "#94a3b8", transform: recipientOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                                </button>
                                {recipientOpen && (
                                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff", borderRadius: 12, border: "1.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 30, overflow: "hidden" }}>
                                        {Object.entries(RECIPIENTS).map(([group, members]) => (
                                            <div key={group}>
                                                <p style={{ padding: "7px 14px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", background: "#f8fafc", borderBottom: "1px solid #f1f5f9", margin: 0 }}>{group}</p>
                                                {members.map(r => (
                                                    <button key={r.id} type="button"
                                                        onMouseDown={e => { e.preventDefault(); setRecipientId(r.id); setRecipientOpen(false); }}
                                                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", textAlign: "left", background: recipientId === r.id ? "#eff6ff" : "#fff", border: "none", cursor: "pointer" }}>
                                                        <span style={{ width: 36, height: 36, minWidth: 36, borderRadius: "50%", background: r.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{r.initials}</span>
                                                        <div>
                                                            <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0 }}>{r.name}</p>
                                                            <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{r.jobTitle}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Subject <span style={{ color: "#ef4444" }}>*</span></label>
                            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter subject..."
                                style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#334155", outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>Category <span style={{ color: "#ef4444" }}>*</span></label>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {CATEGORIES.map(cat => <RadioOption key={cat} label={cat} checked={category === cat} onClick={() => setCategory(cat)} />)}
                            </div>
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>Priority Level</label>
                            <div style={{ display: "flex", gap: 6 }}>
                                {PRIORITIES.map(p => <RadioOption key={p} label={p} checked={priority === p} onClick={() => setPriority(p)} ringColor={PRIORITY_COLORS[p]} />)}
                            </div>
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Message <span style={{ color: "#ef4444" }}>*</span></label>
                            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your concern or inquiry in detail..." rows={5}
                                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#334155", resize: "none", outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Attachments</label>
                            <div style={{ border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", background: "#fafafa" }}>
                                <Upload style={{ width: 24, height: 24, color: "#cbd5e1" }} />
                                <p style={{ fontSize: 13, color: "#64748b", fontWeight: 500, margin: 0 }}>Click to upload or drag and drop</p>
                                <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>PDF, DOC, DOCX, JPG, PNG (max. 10MB)</p>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "12px 14px" }}>
                            <Info style={{ width: 15, height: 15, color: "#3b82f6", flexShrink: 0, marginTop: 1 }} />
                            <p style={{ fontSize: 12, color: "#1d4ed8", margin: 0, lineHeight: 1.6 }}>
                                <span style={{ fontWeight: 700 }}>Important Information</span><br />
                                Your report will be sent directly to the selected staff member. You&apos;ll receive a notification when they respond. For urgent matters, please call the school office at (02) 8123-4567.
                            </p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
                            <button type="button" onClick={onClose}
                                style={{ padding: "9px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                                Cancel
                            </button>
                            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
                                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 10, border: "none", background: canSubmit ? "#2563eb" : "#93c5fd", color: "#fff", fontSize: 13, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed" }}
                                onMouseEnter={e => { if (canSubmit) e.currentTarget.style.background = "#1d4ed8"; }}
                                onMouseLeave={e => { if (canSubmit) e.currentTarget.style.background = "#2563eb"; }}>
                                <Send style={{ width: 13, height: 13 }} /> Submit Report
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentReportsPage() {
    const searchParams = useSearchParams();
    const { setUnreadReportsCount } = useNotifContext();

    const [reports,      setReports]      = useState<Report[]>(INITIAL_REPORTS);
    const [activeFilter, setActiveFilter] = useState<FilterTab>("All Messages");
    const [selectedId,   setSelectedId]   = useState<number>(INITIAL_REPORTS[0].id);
    const [showModal,    setShowModal]     = useState(false);
    const [replyText,    setReplyText]     = useState("");

    // Sync sidebar Reports badge whenever unread count changes
    useEffect(() => {
        const count = reports.filter(r => r.unread).length;
        setUnreadReportsCount(count);
    }, [reports, setUnreadReportsCount]);

    // Read ?teacher= param on page load and open that thread
    useEffect(() => {
        const teacherParam = searchParams.get("teacher");
        if (!teacherParam) return;
        const match = INITIAL_REPORTS.find(
            r => r.recipientName.toLowerCase() === teacherParam.toLowerCase()
        );
        if (match) {
            setSelectedId(match.id);
            setReports(prev => prev.map(r =>
                r.id === match.id ? { ...r, unread: false } : r
            ));
            setReplyText("");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedReport = reports.find(r => r.id === selectedId) ?? reports[0];

    const filteredReports = reports.filter(r => {
        if (activeFilter === "Adviser")   return r.recipientRole === "Class Adviser";
        if (activeFilter === "Principal") return r.recipientRole === "Principal";
        if (activeFilter === "Unread")    return r.unread === true;
        return true;
    });

    const counts: Record<FilterTab, number> = {
        "All Messages": reports.length,
        "Adviser":      reports.filter(r => r.recipientRole === "Class Adviser").length,
        "Principal":    reports.filter(r => r.recipientRole === "Principal").length,
        "Unread":       reports.filter(r => r.unread).length,
    };

    function handleSelect(id: number) {
        setSelectedId(id);
        setReports(prev => prev.map(r => r.id === id ? { ...r, unread: false } : r));
        setReplyText("");
    }

    function handleSendReply() {
        if (!replyText.trim()) return;
        const msg: ChatMessage = {
            id: selectedReport.messages.length + 1, sender: "parent", senderName: "You (John Doe)",
            timestamp: new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
            text: replyText.trim(),
        };
        setReports(prev => prev.map(r => r.id === selectedId ? { ...r, messages: [...r.messages, msg], preview: replyText.trim().slice(0, 80), time: "Just now" } : r));
        setReplyText("");
    }

    function handleNewReport(data: Omit<Report, "id"|"messages"|"time"|"unread"|"grade"|"section">) {
        const nr: Report = {
            ...data, id: reports.length + 1, time: "Just now", unread: false,
            grade: "Grade 3", section: "Mabuhay",
            messages: [{
                id: 1, sender: "parent", senderName: "You (John Doe)",
                timestamp: new Date().toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
                text: "(Your submitted message)",
            }],
        };
        setReports(prev => [nr, ...prev]);
        setSelectedId(nr.id);
        setShowModal(false);
    }

    return (
        <div className="flex h-screen overflow-hidden font-sans bg-slate-100">
            <Sidebar />
            <div className="flex-1 overflow-hidden flex flex-col px-6 py-6 gap-5 min-w-0">
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Reports &amp; Messages</h1>
                        <p className="text-slate-500 text-sm mt-0.5">Submit reports and communicate with school staff</p>
                    </div>
                    <button onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
                        style={{ background: "#2563eb", color: "#fff" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#1d4ed8")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#2563eb")}>
                        <Plus className="w-4 h-4" /> New Report
                    </button>
                </div>

                <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
                    <div className="w-[420px] flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-100">
                            {(["All Messages","Adviser","Principal","Unread"] as FilterTab[]).map(tab => {
                                const isActive = activeFilter === tab;
                                return (
                                    <button key={tab} onClick={() => setActiveFilter(tab)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
                                        style={{ background: isActive ? "#2563eb" : "transparent", color: isActive ? "#fff" : "#64748b" }}>
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

                        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                            {filteredReports.length === 0 ? (
                                <p className="py-12 text-center text-sm text-slate-400">No messages found.</p>
                            ) : filteredReports.map(r => (
                                <button key={r.id} onClick={() => handleSelect(r.id)}
                                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors hover:bg-blue-50/50 ${
                                        r.id === selectedId ? "bg-blue-50 border-l-[3px] border-l-blue-500" : "border-l-[3px] border-l-transparent"
                                    }`}>
                                    <span style={{ width: 38, height: 38, minWidth: 38, borderRadius: "50%", background: r.recipientColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 2 }}>
                                        {r.recipientInitials}
                                    </span>
                                    <div className="w-[105px] flex-shrink-0 pt-0.5">
                                        <p className="text-sm font-bold text-slate-800 leading-tight">{r.recipientName}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">{r.recipientRole}</p>
                                    </div>
                                    <div className="flex-1 min-w-0 pt-0.5">
                                        <div className="flex items-start justify-between gap-2 mb-0.5">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {r.unread && <span style={{ width: 8, height: 8, minWidth: 8, borderRadius: "50%", background: "#3b82f6", marginTop: 3 }} />}
                                                <p className={`text-sm truncate ${r.unread ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>{r.subject}</p>
                                            </div>
                                            <StatusBadge status={r.status} />
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[11px] text-slate-400 truncate flex-1">{r.preview}</p>
                                            <span className="text-[10px] text-slate-400 whitespace-nowrap flex items-center gap-0.5 shrink-0">
                                                <Clock className="w-2.5 h-2.5" /> {r.time}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-w-0">
                        {!selectedReport ? (
                            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a conversation</div>
                        ) : (
                            <>
                                <div className="px-6 py-4 border-b border-slate-100">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span style={{ width: 46, height: 46, minWidth: 46, borderRadius: "50%", background: selectedReport.recipientColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15 }}>
                                            {selectedReport.recipientInitials}
                                        </span>
                                        <div>
                                            <p className="text-base font-extrabold text-slate-800">{selectedReport.recipientName}</p>
                                            <p className="text-xs text-slate-400">
                                                {selectedReport.recipientRole}
                                                {selectedReport.grade && ` • ${selectedReport.grade} - ${selectedReport.section}`}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-700 mb-2">
                                        <span className="text-slate-400 font-medium">Subject: </span>
                                        <span className="font-semibold">{selectedReport.subject}</span>
                                    </p>
                                    <StatusBadge status={selectedReport.status} />
                                </div>

                                <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                                    {selectedReport.messages.map(msg => (
                                        <div key={msg.id}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span style={{ width: 28, height: 28, minWidth: 28, borderRadius: "50%", background: msg.sender === "parent" ? "#2563eb" : selectedReport.recipientColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 10 }}>
                                                    {msg.sender === "parent" ? "JD" : selectedReport.recipientInitials}
                                                </span>
                                                <span className="text-sm font-bold text-slate-700">{msg.senderName}</span>
                                                <span className="text-xs text-slate-400">{msg.timestamp}</span>
                                            </div>
                                            <div className="ml-9 bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="px-5 pb-4 pt-3 border-t border-slate-100">
                                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSendReply(); }}
                                        placeholder="Type your message here..." rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none placeholder:text-slate-400 mb-3" />
                                    <div className="flex items-center justify-between">
                                        <button className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                                            style={{ color: "#64748b", background: "transparent" }}
                                            onMouseEnter={e => { e.currentTarget.style.color = "#2563eb"; e.currentTarget.style.background = "#f1f5f9"; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.background = "transparent"; }}>
                                            <Paperclip className="w-4 h-4" /> Attach File
                                        </button>
                                        <button onClick={handleSendReply} disabled={!replyText.trim()}
                                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
                                            style={{ background: replyText.trim() ? "#2563eb" : "#93c5fd", color: "#fff", cursor: replyText.trim() ? "pointer" : "not-allowed" }}
                                            onMouseEnter={e => { if (replyText.trim()) e.currentTarget.style.background = "#1d4ed8"; }}
                                            onMouseLeave={e => { if (replyText.trim()) e.currentTarget.style.background = "#2563eb"; }}>
                                            <Send className="w-4 h-4" /> Send Message
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {showModal && <NewReportModal onClose={() => setShowModal(false)} onSubmit={handleNewReport} />}
        </div>
    );
}