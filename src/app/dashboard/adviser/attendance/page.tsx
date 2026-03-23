"use client";

import { useEffect, useRef, useState } from "react";
import {
    LogIn, LogOut as LogOutIcon,
    CreditCard, UserPlus, History, Check,
    ChevronDown, IdCard, ChevronLeft, ChevronRight,
    Calendar, AlertCircle, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
type ScanMode        = "Time In" | "Time Out";
type AttendanceStatus = "On Time" | "Late" | "Absent";
type AttendanceVia   = "RFID" | "Manual" | "Auto";

type AttendanceLog = {
    id: number;
    student_id: string;
    full_name: string;
    attendance_date?: string;
    time_logged: string;
    type: ScanMode;
    status: AttendanceStatus;
    via: AttendanceVia;
};

type Student = {
    id: number;
    student_id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    suffix?: string | null;
    gender?: string;
    grade?: string;
    section?: string;
    rfid_card?: string | null;
};

type HistorySummaryRow = {
    student_id: string;
    full_name: string;
    grade: string;
    section: string;
    time_in: string | null;
    time_out: string | null;
    time_in_status: AttendanceStatus | null;
    time_out_status: AttendanceStatus | null;
    via: AttendanceVia | null;
    remark: string | null;
    is_absent: boolean;
};

type HistoryStats = { total: number; present: number; late: number; absent: number };

interface AdviserInfo {
    section: string | null;
    grade: string | null;
    full_name: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatTime(value: string | null) {
    if (!value) return "—";
    const parts = value.split(":");
    if (parts.length < 2) return value;
    let hour = Number(parts[0]);
    const minute = parts[1];
    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour.toString().padStart(2, "0")}:${minute} ${suffix}`;
}

function formatDateLabel(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });
}

function getStatusClass(status: AttendanceStatus | null) {
    if (status === "On Time") return "bg-emerald-100 text-emerald-700";
    if (status === "Late")    return "bg-amber-100 text-amber-700";
    if (status === "Absent")  return "bg-red-100 text-red-600";
    return "bg-slate-100 text-slate-400";
}

function getInitials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts[0][0]?.toUpperCase() || "?";
}

function buildFullName(student: Student) {
    return [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean).join(" ");
}

function toLocalDateString(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// ── Main Page — sidebar removed, layout.tsx handles it ────────────────────────
export default function AdviserAttendancePage() {
    const [scannerMode,      setScannerMode]      = useState<ScanMode>("Time In");
    const [activeTopAction,  setActiveTopAction]  = useState<"register-rfid" | "time-in" | "time-out" | "history" | null>("time-in");
    const [scanValue,        setScanValue]        = useState("");
    const [scanMessage,      setScanMessage]      = useState("Waiting for RFID card tap...");
    const [logs,             setLogs]             = useState<AttendanceLog[]>([]);
    const [lastScanned,      setLastScanned]      = useState<AttendanceLog | null>(null);
    const [isLoadingLogs,    setIsLoadingLogs]    = useState(false);
    const [isSubmitting,     setIsSubmitting]     = useState(false);
    const [adviser,          setAdviser]          = useState<AdviserInfo | null>(null);
    const [students,         setStudents]         = useState<Student[]>([]);
    const [isLoadingStudents,setIsLoadingStudents]= useState(false);

    // Manual attendance
    const [selectedStudentId, setSelectedStudentId] = useState("");
    const [manualType,        setManualType]        = useState<ScanMode>("Time In");
    const [manualStatus,      setManualStatus]      = useState<AttendanceStatus>("On Time");
    const [manualRemark,      setManualRemark]      = useState("");
    const [manualMessage,     setManualMessage]     = useState("");
    const [isSavingManual,    setIsSavingManual]    = useState(false);

    // Register RFID modal
    const [showRegisterRfid, setShowRegisterRfid] = useState(false);
    const [rfidStudentId,    setRfidStudentId]    = useState("");
    const [newRfidValue,     setNewRfidValue]     = useState("");
    const [rfidMessage,      setRfidMessage]      = useState("Waiting for new RFID card tap...");
    const [isSavingRfid,     setIsSavingRfid]     = useState(false);

    // History
    const [showHistory,       setShowHistory]       = useState(false);
    const [historyDate,       setHistoryDate]       = useState(toLocalDateString(new Date()));
    const [historySummary,    setHistorySummary]    = useState<HistorySummaryRow[]>([]);
    const [historyStats,      setHistoryStats]      = useState<HistoryStats | null>(null);
    const [isLoadingHistory,  setIsLoadingHistory]  = useState(false);
    const [historyError,      setHistoryError]      = useState("");
    const [historySearch,     setHistorySearch]     = useState("");
    const [historyFilter,     setHistoryFilter]     = useState<"All" | "Present" | "Absent" | "Late">("All");

    const inputRef        = useRef<HTMLInputElement | null>(null);
    const newRfidInputRef = useRef<HTMLInputElement | null>(null);

    function focusScanner()        { inputRef.current?.focus(); }
    function focusNewRfidScanner() { newRfidInputRef.current?.focus(); }

    async function loadStudents() {
        try {
            setIsLoadingStudents(true);
            const res  = await fetch("/api/students?limit=200", { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                setStudents(data.data || []);
                if (data.adviser) setAdviser(data.adviser);
            }
        } catch (error) {
            console.error("Failed to load students:", error);
        } finally {
            setIsLoadingStudents(false);
        }
    }

    async function loadTodayLogs() {
        try {
            setIsLoadingLogs(true);
            const res  = await fetch("/api/attendance/today", { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                setLogs(data.logs || []);
                if (data.logs?.length > 0) setLastScanned(data.logs[0]);
            } else {
                setScanMessage(data.message || "Failed to load attendance logs");
            }
        } catch (error) {
            console.error("Failed to load logs:", error);
        } finally {
            setIsLoadingLogs(false);
        }
    }

    async function loadHistory(date: string) {
        setIsLoadingHistory(true); setHistoryError("");
        try {
            const res  = await fetch(`/api/attendance/history?date=${date}`, { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                setHistorySummary(data.summary || []);
                setHistoryStats(data.stats || null);
            } else {
                setHistoryError(data.message || "Failed to load history");
            }
        } catch {
            setHistoryError("Failed to connect to server");
        } finally {
            setIsLoadingHistory(false);
        }
    }

    function changeHistoryDate(offset: number) {
        const [y, m, d] = historyDate.split("-").map(Number);
        const next    = new Date(y, m - 1, d + offset);
        const nextStr = toLocalDateString(next);
        setHistoryDate(nextStr);
        loadHistory(nextStr);
    }

    async function handleScan() {
        const value = scanValue.trim();
        if (!value || isSubmitting) return;
        try {
            setIsSubmitting(true);
            setScanMessage("Processing RFID scan...");
            const res  = await fetch("/api/attendance/scan", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rfid_card: value, type: scannerMode }),
            });
            const data = await res.json();
            if (data.success) {
                const newLog: AttendanceLog = data.log;
                setLastScanned(newLog);
                setLogs(prev => [newLog, ...prev]);
                setScanMessage(`✓ ${newLog.full_name} recorded as ${newLog.status}`);
            } else {
                setScanMessage(`⚠ ${data.message || "Scan failed"}`);
            }
        } catch (error) {
            console.error("Scan failed:", error);
            setScanMessage("Failed to connect to server");
        } finally {
            setScanValue(""); setIsSubmitting(false);
            inputRef.current?.focus();
        }
    }

    async function handleManualSave() {
        if (!selectedStudentId || isSavingManual) return;
        try {
            setIsSavingManual(true);
            setManualMessage("Saving manual attendance...");
            const res  = await fetch("/api/attendance/manual", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id: selectedStudentId, type: manualType, status: manualStatus, remark: manualRemark }),
            });
            const data = await res.json();
            if (data.success) {
                const newLog: AttendanceLog = data.log;
                setLogs(prev => [newLog, ...prev]);
                setLastScanned(newLog);
                setManualMessage("Manual attendance saved successfully");
                setSelectedStudentId(""); setManualType("Time In");
                setManualStatus("On Time"); setManualRemark("");
            } else {
                setManualMessage(data.message || "Failed to save attendance");
            }
        } catch (error) {
            console.error("Manual save failed:", error);
            setManualMessage("Failed to connect to server");
        } finally {
            setIsSavingManual(false);
        }
    }

    async function handleRegisterNewRfid() {
        if (!rfidStudentId || !newRfidValue.trim() || isSavingRfid) return;
        try {
            setIsSavingRfid(true);
            setRfidMessage("Saving new RFID card...");
            const res  = await fetch("/api/students/register-rfid", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ student_id: rfidStudentId, rfid_card: newRfidValue.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setRfidMessage("New RFID successfully assigned");
                setRfidStudentId(""); setNewRfidValue("");
                await loadStudents();
            } else {
                setRfidMessage(data.message || "Failed to register RFID");
            }
        } catch (error) {
            console.error("RFID register failed:", error);
            setRfidMessage("Failed to connect to server");
        } finally {
            setIsSavingRfid(false);
            newRfidInputRef.current?.focus();
        }
    }

    useEffect(() => { loadTodayLogs(); loadStudents(); }, []);

    const todayLabel = new Date().toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
    });

    const sectionLabel = adviser?.grade && adviser?.section
        ? `Grade ${adviser.grade} · ${adviser.section}`
        : "Your Section";

    const todayStr = toLocalDateString(new Date());

    return (
        <main className="flex-1 overflow-y-auto px-6 py-6 bg-slate-100 min-h-screen font-sans">

            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">RFID Attendance</h1>
                    <p className="text-slate-400 text-sm mt-0.5">{todayLabel} · {sectionLabel}</p>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-slate-600">Scanner Ready</span>
                </div>
            </div>

            {/* Action cards */}
            <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-4">

                {/* Register RFID */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                        <UserPlus className="h-4 w-4 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">Register RFID</h3>
                    <p className="mt-1 text-xs text-slate-400">Assign a new RFID card to a student</p>
                    <button
                        onClick={() => { setShowRegisterRfid(true); setRfidMessage("Waiting for new RFID card tap..."); setTimeout(() => focusNewRfidScanner(), 100); }}
                        className="mt-4 w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 py-2.5 text-xs font-bold text-white transition-colors">
                        Register Card
                    </button>
                </div>

                {/* Time In */}
                <div className={`rounded-2xl border shadow-sm p-5 transition-all duration-200 ${activeTopAction === "time-in" ? "border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-200" : "border-slate-100 bg-white text-slate-800"}`}>
                    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${activeTopAction === "time-in" ? "bg-white/20" : "bg-emerald-50"}`}>
                        <LogIn className={`h-4 w-4 ${activeTopAction === "time-in" ? "text-white" : "text-emerald-600"}`} />
                    </div>
                    <h3 className="text-sm font-bold">Time In</h3>
                    <p className="mt-1 text-xs opacity-80">Students arriving for class</p>
                    <button
                        onClick={() => { setScannerMode("Time In"); setActiveTopAction("time-in"); setShowHistory(false); setScanMessage("Waiting for RFID card tap..."); focusScanner(); }}
                        className={`mt-4 w-full rounded-xl py-2.5 text-xs font-bold transition-colors ${activeTopAction === "time-in" ? "bg-white text-emerald-600" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}>
                        {activeTopAction === "time-in" ? "Scanning…" : "Start Scanning"}
                    </button>
                </div>

                {/* Time Out */}
                <div className={`rounded-2xl border shadow-sm p-5 transition-all duration-200 ${activeTopAction === "time-out" ? "border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-200" : "border-slate-100 bg-white text-slate-800"}`}>
                    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${activeTopAction === "time-out" ? "bg-white/20" : "bg-emerald-50"}`}>
                        <LogOutIcon className={`h-4 w-4 ${activeTopAction === "time-out" ? "text-white" : "text-emerald-600"}`} />
                    </div>
                    <h3 className="text-sm font-bold">Time Out</h3>
                    <p className="mt-1 text-xs opacity-80">Students leaving the class</p>
                    <button
                        onClick={() => { setScannerMode("Time Out"); setActiveTopAction("time-out"); setShowHistory(false); setScanMessage("Waiting for RFID card tap..."); focusScanner(); }}
                        className={`mt-4 w-full rounded-xl py-2.5 text-xs font-bold transition-colors ${activeTopAction === "time-out" ? "bg-white text-emerald-600" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}>
                        {activeTopAction === "time-out" ? "Scanning…" : "Start Scanning"}
                    </button>
                </div>

                {/* History */}
                <div className={`rounded-2xl border shadow-sm p-5 transition-all duration-200 ${activeTopAction === "history" ? "border-emerald-500 bg-emerald-500 text-white ring-2 ring-emerald-200" : "border-slate-100 bg-white text-slate-800"}`}>
                    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${activeTopAction === "history" ? "bg-white/20" : "bg-emerald-50"}`}>
                        <History className={`h-4 w-4 ${activeTopAction === "history" ? "text-white" : "text-emerald-600"}`} />
                    </div>
                    <h3 className="text-sm font-bold">History</h3>
                    <p className="mt-1 text-xs opacity-80">View past attendance records</p>
                    <button
                        onClick={() => { setActiveTopAction("history"); setShowHistory(true); loadHistory(historyDate); }}
                        className={`mt-4 w-full rounded-xl py-2.5 text-xs font-bold transition-colors ${activeTopAction === "history" ? "bg-white text-emerald-600" : "bg-emerald-500 hover:bg-emerald-600 text-white"}`}>
                        {activeTopAction === "history" ? "Viewing History" : "View History"}
                    </button>
                </div>
            </div>

            {/* History Panel */}
            {showHistory && (
                <div className="mb-5 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                            <History className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-base font-bold text-slate-800">Attendance History</h3>
                            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{sectionLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => changeHistoryDate(-1)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                                <ChevronLeft className="w-4 h-4 text-slate-500" />
                            </button>
                            <div className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                <Calendar className="w-4 h-4 text-emerald-500" />
                                <input type="date" value={historyDate} max={todayStr}
                                    onChange={e => { setHistoryDate(e.target.value); loadHistory(e.target.value); }}
                                    className="text-sm font-semibold text-slate-700 bg-transparent outline-none cursor-pointer" />
                            </div>
                            <button onClick={() => changeHistoryDate(1)} disabled={historyDate >= todayStr}
                                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                            </button>
                            <button onClick={() => loadHistory(historyDate)}
                                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-colors">
                                {isLoadingHistory ? "Loading…" : "Refresh"}
                            </button>
                        </div>
                    </div>

                    <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between flex-wrap gap-3">
                        <p className="text-sm font-bold text-emerald-700">{formatDateLabel(historyDate)}</p>
                        {historyStats && (
                            <div className="flex items-center gap-3 text-xs font-semibold">
                                <span className="bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">✓ Present: {historyStats.present}</span>
                                <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">⏰ Late: {historyStats.late}</span>
                                <span className="bg-red-100 text-red-600 px-2.5 py-1 rounded-full">✗ Absent: {historyStats.absent}</span>
                                <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">Total: {historyStats.total}</span>
                            </div>
                        )}
                    </div>

                    {!historyError && (
                        <div className="px-5 py-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                                    </svg>
                                    <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                                        placeholder="Search by name or student ID..."
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {(["All","Present","Absent","Late"] as const).map(f => (
                                        <button key={f} onClick={() => setHistoryFilter(f)}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                                                historyFilter === f
                                                    ? f === "Late" ? "bg-amber-400 text-white shadow-sm"
                                                      : f === "Absent" ? "bg-red-500 text-white shadow-sm"
                                                      : "bg-emerald-500 text-white shadow-sm"
                                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            }`}>{f}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {historyError && (
                        <div className="flex items-center gap-2 px-5 py-4 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0" />{historyError}
                        </div>
                    )}

                    {isLoadingHistory && (
                        <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                            Loading attendance history…
                        </div>
                    )}

                    {!isLoadingHistory && !historyError && (() => {
                        const filtered = historySummary.filter(row => {
                            const matchSearch = historySearch === "" ||
                                row.full_name.toLowerCase().includes(historySearch.toLowerCase()) ||
                                row.student_id.toLowerCase().includes(historySearch.toLowerCase());
                            const matchFilter =
                                historyFilter === "All"     ? true :
                                historyFilter === "Present" ? row.time_in_status === "On Time" :
                                historyFilter === "Late"    ? row.time_in_status === "Late" :
                                row.is_absent;
                            return matchSearch && matchFilter;
                        });
                        return (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[700px] text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            {["Student","Time In","Status","Time Out","Via"].map(h => (
                                                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.length === 0 ? (
                                            <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                                                {historySummary.length === 0 ? "No students found for this section." : "No results match your search or filter."}
                                            </td></tr>
                                        ) : (
                                            filtered.map(row => (
                                                <tr key={row.student_id}
                                                    className={`border-b border-slate-50 last:border-0 transition-colors ${row.is_absent ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-slate-50/60"}`}>
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${row.is_absent ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                                                                {getInitials(row.full_name)}
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-slate-800 text-sm">{row.full_name}</p>
                                                                <p className="text-[11px] text-slate-400">{row.student_id}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3 text-sm text-slate-600 font-medium">{formatTime(row.time_in)}</td>
                                                    <td className="px-5 py-3">
                                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(row.time_in_status)}`}>
                                                            {row.time_in_status ?? "No Record"}
                                                        </span>
                                                        {row.is_absent && row.via === "Auto" && (
                                                            <span className="ml-1.5 text-[10px] text-slate-400 italic">auto</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-sm text-slate-600 font-medium">{formatTime(row.time_out)}</td>
                                                    <td className="px-5 py-3">
                                                        {row.via ? (
                                                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                                                <IdCard className="h-3.5 w-3.5" />{row.via}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-slate-300">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* Main grid */}
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">

                {/* Live Scanner */}
                <div className="xl:col-span-4">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <h3 className="text-base font-bold text-slate-800">Live Scanner</h3>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">{scannerMode}</span>
                        </div>
                        <div className="p-6 flex flex-col items-center">
                            <input ref={inputRef} value={scanValue}
                                onChange={e => setScanValue(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleScan(); } }}
                                className="absolute opacity-0 pointer-events-none" autoFocus />
                            <button onClick={focusScanner}
                                className="flex h-52 w-52 flex-col items-center justify-center rounded-full border-[3px] border-dashed border-emerald-300 text-emerald-600 hover:bg-emerald-50 transition-colors">
                                <CreditCard className="mb-2 h-10 w-10" />
                                <span className="text-xl font-bold">Scan Now</span>
                            </button>
                            <p className="mt-4 text-center text-sm text-slate-400">{scanMessage}</p>
                            <div className="mt-4 w-full rounded-xl bg-emerald-50 px-4 py-4 text-center">
                                <p className="text-xs text-slate-400 font-medium">Last Scanned</p>
                                {lastScanned ? (
                                    <>
                                        <p className="mt-1 text-lg font-extrabold text-emerald-700">{lastScanned.full_name}</p>
                                        <p className="mt-0.5 text-sm text-slate-500">{formatTime(lastScanned.time_logged)} — {lastScanned.status}</p>
                                    </>
                                ) : (
                                    <p className="mt-2 text-sm text-slate-400">No scan yet.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-5 xl:col-span-8">

                    {/* Manual Attendance */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <h3 className="text-base font-bold text-slate-800">Manual Attendance</h3>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">Backup Option</span>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                                <div className="md:col-span-8">
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Student ({sectionLabel})</label>
                                    <div className="relative">
                                        <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
                                            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition">
                                            <option value="">{isLoadingStudents ? "Loading students..." : "Select student..."}</option>
                                            {students.map(s => <option key={s.student_id} value={s.student_id}>{buildFullName(s)}</option>)}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                                <div className="md:col-span-4">
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">Type</label>
                                    <div className="relative">
                                        <select value={manualType} onChange={e => setManualType(e.target.value as ScanMode)}
                                            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition">
                                            <option value="Time In">Time In</option>
                                            <option value="Time Out">Time Out</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Status</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {(["On Time","Late","Absent"] as AttendanceStatus[]).map(status => (
                                        <button key={status} type="button" onClick={() => setManualStatus(status)}
                                            className={`h-10 rounded-xl border text-xs font-bold transition-all ${
                                                manualStatus === status
                                                    ? status === "On Time" ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                                                      : status === "Late"  ? "border-amber-400 bg-amber-400 text-white shadow-sm"
                                                      : "border-red-500 bg-red-500 text-white shadow-sm"
                                                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                                            }`}>{status}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-4">
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-600">Remark</label>
                                    <span className="text-xs text-slate-400">Optional</span>
                                </div>
                                <input value={manualRemark} onChange={e => setManualRemark(e.target.value)}
                                    placeholder="e.g. Excuse letter submitted"
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                            </div>
                            <button onClick={handleManualSave} disabled={isSavingManual}
                                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-bold text-white transition-colors disabled:opacity-60">
                                <Check className="h-4 w-4" />
                                {isSavingManual ? "Saving..." : "Save Attendance"}
                            </button>
                            {manualMessage && <p className="mt-2.5 text-sm text-slate-500">{manualMessage}</p>}
                        </div>
                    </div>

                    {/* Today's Log */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <h3 className="text-base font-bold text-slate-800">Today&apos;s Log · {sectionLabel}</h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">{logs.length} records</span>
                                <button onClick={loadTodayLogs}
                                    className="rounded-lg bg-slate-800 hover:bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition-colors">
                                    {isLoadingLogs ? "Refreshing..." : "Refresh"}
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[600px] text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {["Student","Time","Type","Status","Via"].map(h => (
                                            <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.length === 0 ? (
                                        <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">
                                            {isLoadingLogs ? "Loading attendance logs..." : "No attendance records for today yet."}
                                        </td></tr>
                                    ) : (
                                        logs.map(log => (
                                            <tr key={log.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 shrink-0">
                                                            {getInitials(log.full_name)}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-800 text-sm">{log.full_name}</p>
                                                            <p className="text-[11px] text-slate-400">{log.student_id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3 text-sm text-slate-500">{formatTime(log.time_logged)}</td>
                                                <td className="px-5 py-3 text-sm text-slate-500">{log.type}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(log.status)}`}>
                                                        {log.status}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                                                        <IdCard className="h-3.5 w-3.5" />{log.via}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Register RFID Modal */}
            {showRegisterRfid && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-800">Register RFID</h3>
                                <p className="mt-0.5 text-xs text-slate-400">Assign a new RFID card to a student in {sectionLabel}</p>
                            </div>
                            <button onClick={() => setShowRegisterRfid(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6">
                            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Student</label>
                            <div className="relative">
                                <select value={rfidStudentId} onChange={e => setRfidStudentId(e.target.value)}
                                    className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition">
                                    <option value="">{isLoadingStudents ? "Loading students..." : "Select student..."}</option>
                                    {students.map(s => <option key={s.student_id} value={s.student_id}>{buildFullName(s)}</option>)}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                            <div className="mt-5">
                                <label className="mb-1.5 block text-xs font-semibold text-slate-600">New RFID Card</label>
                                <input ref={newRfidInputRef} value={newRfidValue}
                                    onChange={e => {
                                        const cleaned = e.target.value.replace(/\r|\n/g, "").trim();
                                        setNewRfidValue(cleaned);
                                        setRfidMessage(cleaned ? "RFID captured. Review the UID, then click Save New RFID." : "Waiting for new RFID card tap...");
                                    }}
                                    onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
                                    className="absolute opacity-0 pointer-events-none" />
                                <button onClick={focusNewRfidScanner}
                                    className="flex h-36 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                                    <CreditCard className="mb-2 h-8 w-8" />
                                    <span className="text-sm font-bold">Tap New RFID Card</span>
                                    <span className="mt-1 text-xs text-emerald-500">Click here, then scan the replacement card</span>
                                </button>
                                <p className="mt-2.5 text-xs text-slate-500">{rfidMessage}</p>
                                {newRfidValue && (
                                    <div className="mt-2.5 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                                        New RFID UID: <span className="font-bold text-slate-800">{newRfidValue}</span>
                                    </div>
                                )}
                            </div>
                            <div className="mt-5 flex items-center justify-end gap-3">
                                <button onClick={() => setShowRegisterRfid(false)}
                                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={handleRegisterNewRfid} disabled={!rfidStudentId || !newRfidValue.trim() || isSavingRfid}
                                    className="rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-colors disabled:opacity-60">
                                    {isSavingRfid ? "Saving..." : "Save New RFID"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}