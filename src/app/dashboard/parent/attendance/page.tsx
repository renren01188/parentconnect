"use client";

/* eslint-disable react-hooks/set-state-in-effect */

/**
 * FILE: app/dashboard/parent/attendance/page.tsx
 *
 * Two enrolled children:
 *   - Carlos Santos Doe  → Grade 6 - Rizal  (different adviser, schedule, stats)
 *   - Maria Santos Doe   → Grade 1 - Mabuhay
 *
 * Selecting a student updates stats + attendance table.
 * Month dropdown updates the table rows for the active student.
 * Design matches screenshot exactly (blue sidebar, light-blue-gray bg, white cards).
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
    ChevronDown, TrendingUp, TrendingDown,
    Send, X, Paperclip, AlertCircle, CheckCircle, Loader2,
} from "lucide-react";

import Sidebar from "../components/Sidebar";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AttendanceStatus = "Present" | "Late" | "Absent" | "Excused";
type ExcuseStatus = "Pending" | "Declined" | "Approved";

interface AttendanceRecord {
    date: string;
    day: string;
    status: AttendanceStatus;
    timeIn: string;
    timeOut: string;
    rfidScan: "Verified" | "Manual" | "None";
}

interface MonthData {
    label: string;
    records: AttendanceRecord[];
}

interface StudentData {
    id: string;
    name: string;
    grade: string;
    section: string;
    studentId: string;
    adviser: string;
    initials: string;
    avatarBg: string;
    totalPresent: number;
    presentDelta: number;
    absentDays: number;
    absentDelta: number;
    lateDays: number;
    lateDelta: number;
    attendanceRate: number;
    rateLabel: string;
    months: MonthData[];
}

interface ExcuseTrackerItem {
    id: number;
    studentId: string;
    studentName: string;
    dateFrom: string;
    dateTo: string;
    status: ExcuseStatus;
    submittedAt: string;
    declineReason?: string;
}

interface AttachmentPayload {
    file_name: string;
    file_data: string;
    file_type: string;
}




// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function statusBadgeClass(status: AttendanceStatus) {
    switch (status) {
        case "Present": return "bg-green-500 text-white";
        case "Late": return "bg-yellow-400 text-white";
        case "Absent": return "bg-red-500 text-white";
        case "Excused": return "bg-blue-400 text-white";
    }
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDateLabel(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });
}

function rfidBadgeClass(scan: string) {
    if (scan === "Verified") return "bg-sky-500 text-white";
    if (scan === "Manual") return "bg-amber-400 text-white";
    return "bg-slate-200 text-slate-500";
}

interface ExcuseTrackerItem {
    id: number;
    studentId: string;
    studentName: string;
    dateFrom: string;
    dateTo: string;
    status: ExcuseStatus;
    submittedAt: string;
    declineReason?: string;
}

function dayCount(start: string, end: string) {
    if (!start || !end) return 0;
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${end}T00:00:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return 0;
    return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

function excuseStatusClass(status: ExcuseStatus) {
    if (status === "Approved") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (status === "Declined") return "bg-red-100 text-red-600 border-red-200";
    return "bg-amber-100 text-amber-700 border-amber-200";
}

function ExcuseLetterModal({ students, defaultStudentId, onClose }: {
    students: StudentData[];
    defaultStudentId: string;
    onClose: () => void;
}) {
    const [studentId, setStudentId] = useState(defaultStudentId);
    const [message, setMessage] = useState("");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [accepted, setAccepted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [trackedRequests, setTrackedRequests] = useState<ExcuseTrackerItem[]>([]);
    const [loadingLetters, setLoadingLetters] = useState(true);

    const selectedStudent = students.find(s => s.id === studentId) ?? students[0];
    const totalDays = (() => {
        if (!fromDate || !toDate) return 0;
        const s = new Date(`${fromDate}T00:00:00`);
        const e = new Date(`${toDate}T00:00:00`);
        if (e < s) return 0;
        return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    })();
    const invalidDateRange = !!fromDate && !!toDate && totalDays === 0;
    const canSubmit = !!studentId && !!message.trim() && !!fromDate && !!toDate
        && !invalidDateRange && attachments.length > 0 && accepted && !isSubmitting;

    // Load existing excuse letters on mount
    useEffect(() => {
        async function fetchLetters() {
            try {
                setLoadingLetters(true);
                const res = await fetch("/api/excuse-letters", { cache: "no-store" });
                const data = await res.json();
                if (data.success) {
                    const mapped: ExcuseTrackerItem[] = (data.letters || []).map((l: {
                        id: number;
                        student_id: string;
                        date_from: string;
                        date_to: string;
                        status: ExcuseStatus;
                        submitted_at: string;
                        decline_reason?: string;
                    }) => {
                        const st = students.find(s => s.studentId === l.student_id);
                        return {
                            id: l.id,
                            studentId: l.student_id,
                            studentName: st?.name ?? l.student_id,
                            dateFrom: l.date_from,
                            dateTo: l.date_to,
                            status: l.status,
                            submittedAt: new Date(l.submitted_at).toLocaleDateString("en-US", {
                                month: "long", day: "numeric", year: "numeric",
                            }),
                            declineReason: l.decline_reason ?? undefined,
                        };
                    });
                    setTrackedRequests(mapped);
                }
            } catch (e) {
                console.error("Failed to load excuse letters:", e);
            } finally {
                setLoadingLetters(false);
            }
        }
        fetchLetters();
    }, [students]);

    async function handleSubmitRequest() {
        if (!canSubmit) return;
        setIsSubmitting(true);
        setSubmitError("");

        try {
            // Convert files to base64
            const attachmentPayloads: AttachmentPayload[] = await Promise.all(
                attachments.map(file => new Promise<AttachmentPayload>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({
                        file_name: file.name,
                        file_data: (reader.result as string).split(",")[1],
                        file_type: file.type,
                    });
                    reader.onerror = () => reject(new Error("File read failed"));
                    reader.readAsDataURL(file);
                }))
            );

            const res = await fetch("/api/excuse-letters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    student_id: selectedStudent.studentId,
                    date_from: fromDate,
                    date_to: toDate,
                    message: message.trim(),
                    attachments: attachmentPayloads,
                }),
            });

            const data = await res.json();
            if (!data.success) {
                setSubmitError(data.message || "Submission failed. Please try again.");
                return;
            }

            setSubmitted(true);
        } catch {
            setSubmitError("Failed to connect to server. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    }

    function excuseStatusClass(status: ExcuseStatus) {
        if (status === "Approved") return "bg-emerald-100 text-emerald-700 border-emerald-200";
        if (status === "Declined") return "bg-red-100 text-red-600 border-red-200";
        return "bg-amber-100 text-amber-700 border-amber-200";
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-5">
            <div className="w-full max-w-[620px] max-h-[calc(100vh-40px)] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-lg font-extrabold text-slate-800">{submitted ? "Request Submitted" : "Excuse Letter Request"}</h2>
                        <p className="text-sm text-slate-400 mt-1">{submitted ? `Sent to ${selectedStudent.name}'s adviser for review.` : "Send an absence excuse to the adviser for approval."}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {submitted ? (
                    <div className="px-6 py-10 flex flex-col items-center text-center">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                            <CheckCircle className="w-8 h-8 text-emerald-600" />
                        </div>
                        <p className="text-sm text-slate-500 max-w-sm">Your excuse letter has been submitted and the adviser has been notified by email.</p>
                        <button type="button" onClick={onClose} className="mt-6 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition">Done</button>
                    </div>
                ) : (
                    <>
                        <div className="px-6 py-5 flex flex-col gap-5">

                            {/* Excuse Letter Status Tracker */}
                            <section className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
                                    <div>
                                        <h3 className="text-sm font-extrabold text-slate-800">Excuse Letter Status</h3>
                                        <p className="text-xs text-slate-400">Monitor submitted excuse letters.</p>
                                    </div>
                                </div>
                                <div className="divide-y divide-slate-200">
                                    {loadingLetters ? (
                                        <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                                        </div>
                                    ) : trackedRequests.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-6">No excuse letters submitted yet.</p>
                                    ) : trackedRequests.map((request) => (
                                        <div key={request.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-800 truncate">{request.studentName}</p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    {formatDateLabel(request.dateFrom)} – {formatDateLabel(request.dateTo)} · Submitted {request.submittedAt}
                                                </p>
                                            </div>
                                            {request.status === "Declined" && request.declineReason && (
                                                <div className="order-last w-full rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                                                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-500">Decline Reason</p>
                                                    <p className="mt-1 text-xs leading-relaxed text-red-700">{request.declineReason}</p>
                                                </div>
                                            )}
                                            <span className={`shrink-0 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${excuseStatusClass(request.status)}`}>
                                                {request.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Student selector */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Student to Excuse</label>
                                <div className="relative">
                                    <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
                                        className="w-full appearance-none px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-400">
                                        {students.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.grade} {s.section}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                </div>
                            </div>

                            {/* Date range */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">From Date</label>
                                    <input type="date" value={fromDate}
                                        min={new Date().toISOString().split("T")[0]}
                                        onChange={(e) => setFromDate(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1.5">To Date</label>
                                    <input type="date" value={toDate}
                                        min={fromDate || new Date().toISOString().split("T")[0]}
                                        onChange={(e) => setToDate(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-400" />
                                </div>
                            </div>
                            <div className={`rounded-xl px-4 py-3 border ${invalidDateRange ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-100"}`}>
                                <p className={`text-xs font-semibold ${invalidDateRange ? "text-red-600" : "text-blue-700"}`}>
                                    {invalidDateRange
                                        ? "Please choose a valid date range."
                                        : totalDays > 0
                                            ? `${selectedStudent.name} will be excused for ${totalDays} day${totalDays === 1 ? "" : "s"}.`
                                            : "Choose a date range to calculate the number of excused days."}
                                </p>
                            </div>

                            {/* Message */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">Message</label>
                                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
                                    placeholder="Write the reason for the absence..."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-slate-400" />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                                    Attachment <span className="text-red-500">*</span>
                                </label>

                                <input
                                    key={attachments.length}
                                    id="excuse-file-input"   // ← add this
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept="image/*,.pdf,.doc,.docx"
                                    style={{ display: "none" }}   // ← change this
                                    onChange={(e) => {
                                        const files = Array.from(e.target.files ?? []);
                                        if (files.length > 0) {
                                            setAttachments(prev => [...prev, ...files]);
                                        }
                                        setTimeout(() => { e.target.value = ""; }, 0);  // ← defer the reset
                                    }}
                                />

                                <label
                                    htmlFor="excuse-file-input"
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition cursor-pointer">
                                    <Paperclip className="w-6 h-6 text-slate-400" />
                                    <span className="text-sm font-bold text-slate-600">Click here to attach files</span>
                                    <span className="text-xs text-slate-400">Images, PDF, DOC, or DOCX</span>
                                </label>

                                {attachments.length > 0 && (
                                    <div className="mt-3 flex flex-col gap-2">
                                        {attachments.map((file, index) => (
                                            <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Paperclip className="w-4 h-4 text-blue-500 shrink-0" />
                                                    <span className="text-xs font-semibold text-slate-600 truncate">{file.name}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                                                    className="text-xs font-bold text-slate-400 hover:text-red-500">
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Confirmation checkbox */}
                            <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 cursor-pointer">
                                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
                                <span className="text-xs text-amber-800 leading-relaxed">I confirm that the attached excuse letter includes my signature and that the information submitted is true and valid for school approval.</span>
                            </label>

                            {submitError && (
                                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-red-600">{submitError}</p>
                                </div>
                            )}

                            {!canSubmit && !submitError && (
                                <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                                    <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-slate-500">Complete the message, student, date range, required attachment, and terms checkbox before sending.</p>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                            <button type="button" onClick={onClose}
                                className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50 transition">Cancel</button>
                            <button type="button" onClick={handleSubmitRequest} disabled={!canSubmit}
                                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white transition ${canSubmit ? "bg-blue-500 hover:bg-blue-600" : "bg-blue-300 cursor-not-allowed"}`}>
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {isSubmitting ? "Submitting..." : "Send for Approval"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentAttendancePage() {
    const [students, setStudents] = useState<StudentData[]>([]);
    const [selectedId, setSelectedId] = useState<string>("");
    const [studentDrop, setStudentDrop] = useState(false);
    const [monthIdx, setMonthIdx] = useState(0);
    const [monthDrop, setMonthDrop] = useState(false);
    const [showExcuseModal, setShowExcuseModal] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    const studentDropRef = useRef<HTMLDivElement>(null);
    const monthDropRef = useRef<HTMLDivElement>(null);

    const fetchAttendance = useCallback(async () => {
        try {
            setIsLoading(true);
            setError("");
            const res = await fetch("/api/parents/me", { cache: "no-store" });
            const data = await res.json();

            if (!data.success) {
                setError(data.message || "Failed to load data.");
                return;
            }

            const apiStudents: StudentData[] = await Promise.all(
                (data.students || [data.student]).map(async (s: {
                    id: number; lrn: string; name: string; grade: string; section: string;
                }) => {
                    const attRes = await fetch(`/api/attendance/parent-history?student_id=${s.lrn}`, { cache: "no-store" });
                    const attData = await attRes.json();

                    // Group records by month
                    const monthMap = new Map<string, AttendanceRecord[]>();
                    for (const rec of (attData.records || [])) {
                        const d = new Date(rec.attendance_date);
                        const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
                        if (!monthMap.has(label)) monthMap.set(label, []);
                        monthMap.get(label)!.push({
                            date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                            day: d.toLocaleDateString("en-US", { weekday: "long" }),
                            status: rec.status as AttendanceStatus,
                            timeIn: rec.time_in ? formatTime(rec.time_in) : "—",
                            timeOut: rec.time_out ? formatTime(rec.time_out) : "—",
                            rfidScan: rec.via === "RFID" ? "Verified" : rec.via === "Manual" ? "Manual" : "None",
                        });
                    }

                    const months: MonthData[] = Array.from(monthMap.entries()).map(([label, records]) => ({ label, records }));

                    const stats = attData.stats || {};
                    const total = (stats.present ?? 0) + (stats.late ?? 0) + (stats.absent ?? 0);
                    const rate = total > 0 ? Math.round(((stats.present ?? 0) / total) * 100 * 10) / 10 : 0;

                    return {
                        id: String(s.id),
                        name: s.name,
                        grade: s.grade,
                        section: s.section,
                        studentId: s.lrn,
                        adviser: "",
                        initials: getInitials(s.name),
                        avatarBg: "#2563eb",
                        totalPresent: stats.present ?? 0,
                        presentDelta: 0,
                        absentDays: stats.absent ?? 0,
                        absentDelta: 0,
                        lateDays: stats.late ?? 0,
                        lateDelta: 0,
                        attendanceRate: rate,
                        rateLabel: rate >= 95 ? "Excellent standing" : rate >= 85 ? "Good standing" : "Needs attention",
                        months: months.length > 0 ? months : [{ label: "No Records", records: [] }],
                    } satisfies StudentData;
                })
            );

            setStudents(apiStudents);
            setSelectedId(apiStudents[0]?.id ?? "");
        } catch {
            setError("Failed to connect to server.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

    useEffect(() => {
        function handleOutsideClick(e: MouseEvent) {
            if (studentDrop && studentDropRef.current && !studentDropRef.current.contains(e.target as Node)) {
                setStudentDrop(false);
            }
            if (monthDrop && monthDropRef.current && !monthDropRef.current.contains(e.target as Node)) {
                setMonthDrop(false);
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [studentDrop, monthDrop]);

    const student = students.find(s => s.id === selectedId) ?? students[0];
    const safeMonthIdx = student ? Math.min(monthIdx, student.months.length - 1) : 0;
    const currentMonth = student?.months[safeMonthIdx];

    function selectStudent(id: string) {
        setSelectedId(id);
        setMonthIdx(0);
        setStudentDrop(false);
    }

    // ── Loading state ──
    if (isLoading) {
        return (
            <div className="flex h-screen overflow-hidden font-sans" style={{ background: "#eef2f7" }}>
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Loading attendance records...</p>
                    </div>
                </main>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen overflow-hidden font-sans" style={{ background: "#eef2f7" }}>
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-red-500">
                        <AlertCircle className="w-8 h-8" />
                        <p className="text-sm">{error}</p>
                        <button onClick={fetchAttendance} className="mt-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-bold">Retry</button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden font-sans" style={{ background: "#eef2f7" }}>
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-8">

                {/* Page header */}
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Attendance</h1>
                        <p className="text-slate-500 text-sm mt-0.5">View your child&apos;s attendance records and history</p>
                    </div>
                    <button type="button" onClick={() => setShowExcuseModal(true)}
                        className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold shadow-sm shadow-blue-200 transition">
                        <Send className="w-4 h-4" />
                        Excuse Letter
                    </button>
                </div>

                {/* Student selector */}
                {students.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 p-5">
                        <p className="text-sm font-bold text-slate-700 mb-3">Select Student</p>
                        <div className="relative" ref={studentDropRef}>
                            <button onClick={() => setStudentDrop(p => !p)}
                                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left">
                                <span style={{ width: 44, height: 44, minWidth: 44, borderRadius: "50%", background: student.avatarBg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
                                    {student.initials}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800">{student.name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{student.grade} - {student.section}&nbsp;&bull;&nbsp;Student ID: {student.studentId}</p>
                                </div>
                                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform shrink-0 ${studentDrop ? "rotate-180" : ""}`} />
                            </button>
                            {studentDrop && (
                                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                                    {students.map(s => (
                                        <button key={s.id} type="button"
                                            onMouseDown={(e) => { e.preventDefault(); selectStudent(s.id); }}
                                            className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-blue-50 ${s.id === selectedId ? "bg-blue-50" : "bg-white"}`}>
                                            <span style={{ width: 40, height: 40, minWidth: 40, borderRadius: "50%", background: s.avatarBg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                                                {s.initials}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-semibold ${s.id === selectedId ? "text-blue-700" : "text-slate-800"}`}>{s.name}</p>
                                                <p className="text-xs text-slate-400">{s.grade} - {s.section}&nbsp;&bull;&nbsp;{s.studentId}</p>
                                            </div>
                                            {s.id === selectedId && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Stat cards */}
                {student && (
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Total Present Days</p>
                            <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.totalPresent}</p>
                            <div className="flex items-center gap-1.5">
                                <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-xs text-blue-400 font-medium">This school year</span>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Absent Days</p>
                            <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.absentDays}</p>
                            <div className="flex items-center gap-1.5">
                                <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-xs text-blue-400 font-medium">This school year</span>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Late Days</p>
                            <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.lateDays}</p>
                            <div className="flex items-center gap-1.5">
                                <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-xs text-blue-400 font-medium">This school year</span>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Attendance Rate</p>
                            <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.attendanceRate}%</p>
                            <p className="text-xs font-semibold text-blue-500">{student.rateLabel}</p>
                        </div>
                    </div>
                )}

                {/* Monthly Attendance Record */}
                {student && currentMonth && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <p className="text-base font-bold text-slate-800">Monthly Attendance Record</p>
                            <div className="relative" ref={monthDropRef}>
                                <button onClick={() => setMonthDrop(p => !p)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                                    {currentMonth.label}
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${monthDrop ? "rotate-180" : ""}`} />
                                </button>
                                {monthDrop && (
                                    <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-30 min-w-[170px] overflow-hidden">
                                        {student.months.map((m, idx) => (
                                            <button key={m.label} type="button"
                                                onMouseDown={(e) => { e.preventDefault(); setMonthIdx(idx); setMonthDrop(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-blue-50 ${idx === safeMonthIdx ? "text-blue-600 font-semibold bg-blue-50" : "text-slate-700"}`}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {["Date", "Day", "Status", "Time In", "Time Out", "RFID Scan"].map(h => (
                                            <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-400">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentMonth.records.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">No records for this month.</td>
                                        </tr>
                                    ) : currentMonth.records.map((rec, i) => (
                                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                                            <td className="px-6 py-3.5 text-sm font-medium text-slate-700">{rec.date}</td>
                                            <td className="px-6 py-3.5 text-sm text-slate-500">{rec.day}</td>
                                            <td className="px-6 py-3.5">
                                                <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${statusBadgeClass(rec.status)}`}>
                                                    {rec.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3.5 text-sm text-slate-600">{rec.timeIn}</td>
                                            <td className="px-6 py-3.5 text-sm text-slate-600">{rec.timeOut}</td>
                                            <td className="px-6 py-3.5">
                                                {rec.rfidScan !== "None" ? (
                                                    <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${rfidBadgeClass(rec.rfidScan)}`}>
                                                        {rec.rfidScan}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-xs">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {showExcuseModal && students.length > 0 && (
                <ExcuseLetterModal
                    students={students}
                    defaultStudentId={selectedId}
                    onClose={() => setShowExcuseModal(false)}
                />
            )}
        </div>
    );
}

// ── Helper used inside the page ───────────────────────────────────────────────
function formatTime(value: string | null) {
    if (!value) return "—";
    const parts = value.split(":");
    if (parts.length < 2) return value;
    let hour = Number(parts[0]);
    const minute = parts[1];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour.toString().padStart(2, "0")}:${minute} ${suffix}`;
}