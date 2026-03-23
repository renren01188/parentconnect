"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    LayoutDashboard, CalendarDays, FileText, Bell,
    LogOut, TrendingUp, TrendingDown, ExternalLink,
    AlertCircle, CalendarCheck, MessageSquare, CheckCheck,
    ChevronDown,
} from "lucide-react";
import Link from "next/link";
import Sidebar from "./components/Sidebar";

interface StudentInfo {
    id: string;
    name: string;
    studentId: string;
    grade: string;
    adviser: string;
    initials: string;
    stats: {
        totalPresent: string; presentDelta: string; presentUp: boolean;
        absentDays: string; absentDelta: string; absentUp: boolean;
        lateDays: string; lateDelta: string; lateUp: boolean;
        attendanceRate: string; rateLabel: string;
    };
    attendance: {
        date: string; day: string; status: string;
        timeIn: string; timeOut: string; rfid: string;
    }[];
}

const STUDENTS: StudentInfo[] = [
    {
        id: "1", name: "Carlos Santos Doe", studentId: "SES-2026-0891",
        grade: "Grade 6 - Rizal", adviser: "Mr. Jose Reyes", initials: "CS",
        stats: {
            totalPresent: "148", presentDelta: "+3 from last month", presentUp: true,
            absentDays: "2", absentDelta: "-1 from last month", absentUp: false,
            lateDays: "3", lateDelta: "+1 from last month", lateUp: true,
            attendanceRate: "96.1%", rateLabel: "Excellent standing",
        },
        attendance: [
            { date: "Nov 22, 2026", day: "Monday", status: "Present", timeIn: "07:30 AM", timeOut: "04:00 PM", rfid: "Verified" },
            { date: "Nov 21, 2026", day: "Friday", status: "Present", timeIn: "07:35 AM", timeOut: "04:00 PM", rfid: "Verified" },
            { date: "Nov 20, 2026", day: "Thursday", status: "Late", timeIn: "08:20 AM", timeOut: "04:00 PM", rfid: "Verified" },
            { date: "Nov 19, 2026", day: "Wednesday", status: "Present", timeIn: "07:28 AM", timeOut: "04:00 PM", rfid: "Verified" },
            { date: "Nov 18, 2026", day: "Tuesday", status: "Absent", timeIn: "—", timeOut: "—", rfid: "No Scan" },
        ],
    },
    {
        id: "2", name: "Maria Santos Doe", studentId: "SES-2026-1234",
        grade: "Grade 1 - Mabuhay", adviser: "Ms. Ana Cruz", initials: "MS",
        stats: {
            totalPresent: "142", presentDelta: "+5 from last month", presentUp: true,
            absentDays: "3", absentDelta: "-2 from last month", absentUp: false,
            lateDays: "5", lateDelta: "+2 from last month", lateUp: true,
            attendanceRate: "94.7%", rateLabel: "Excellent standing",
        },
        attendance: [
            { date: "Nov 22, 2026", day: "Monday", status: "Present", timeIn: "07:45 AM", timeOut: "03:30 PM", rfid: "Verified" },
            { date: "Nov 21, 2026", day: "Friday", status: "Late", timeIn: "08:15 AM", timeOut: "03:30 PM", rfid: "Verified" },
            { date: "Nov 20, 2026", day: "Thursday", status: "Present", timeIn: "07:50 AM", timeOut: "03:30 PM", rfid: "Verified" },
            { date: "Nov 19, 2026", day: "Wednesday", status: "Present", timeIn: "07:40 AM", timeOut: "03:30 PM", rfid: "Verified" },
            { date: "Nov 18, 2026", day: "Tuesday", status: "Absent", timeIn: "—", timeOut: "—", rfid: "No Scan" },
        ],
    },
];

const INITIAL_NOTIFICATIONS = [
    {
        id: 1, type: "alert" as const, icon: AlertCircle,
        title: "Absence Alert", time: "2 hours ago",
        msg: "Carlos was marked absent on Nov 18. Please contact the school office if this is an error.",
        unread: true, color: "bg-red-50 border-red-200", iconColor: "bg-red-500",
        studentName: "Carlos", teacherName: undefined, eventId: undefined,
    },
    {
        id: 2, type: "event" as const, icon: CalendarCheck,
        title: "Upcoming Event", time: "5 hours ago",
        msg: "Parent-Teacher Conference scheduled for Nov 28, 2026 at 2:00 PM.",
        unread: true, color: "bg-amber-50 border-amber-200", iconColor: "bg-amber-500",
        studentName: undefined, teacherName: undefined, eventId: "ptc-nov-28",
    },
    {
        id: 3, type: "message" as const, icon: MessageSquare,
        title: "Message from Teacher", time: "2 days ago",
        msg: "Ms. Ana Cruz sent you a message regarding Maria's recent project submission.",
        unread: false, color: "bg-slate-50 border-slate-200", iconColor: "bg-slate-500",
        studentName: undefined, teacherName: "Ms. Ana Cruz", eventId: undefined,
    },
];

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        Present: "bg-green-500 text-white",
        Late: "bg-yellow-400 text-white",
        Absent: "bg-red-500 text-white",
    };
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] ?? "bg-slate-200 text-slate-600"}`}>
            {status}
        </span>
    );
}

function RfidBadge({ value }: { value: string }) {
    const ok = value === "Verified";
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ok ? "bg-sky-500 text-white" : "bg-slate-200 text-slate-500"}`}>
            {value}
        </span>
    );
}

export default function ParentDashboard() {
    const router = useRouter();
    const [notifs, setNotifs] = useState(INITIAL_NOTIFICATIONS);
    const [selectedId, setSelectedId] = useState(STUDENTS[0].id);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
                setDropdownOpen(false);
        }
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const studentParam = params.get("student");
        if (!studentParam) return;
        const match = STUDENTS.find(s => s.id === studentParam);
        if (match) setSelectedId(match.id);
    }, []);

    const student = STUDENTS.find(s => s.id === selectedId) ?? STUDENTS[0];
    const unreadCount = notifs.filter(n => n.unread).length;
    const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, unread: false })));

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login/guardian");
    };

    function selectStudent(id: string) {
        setSelectedId(id);
        setDropdownOpen(false);
    }

    function handleNotifClick(notif: typeof INITIAL_NOTIFICATIONS[number]) {
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));
        if (notif.type === "alert" && notif.studentName) {
            router.push(`/dashboard/parent/attendance?student=${encodeURIComponent(notif.studentName)}`);
        } else if (notif.type === "message" && notif.teacherName) {
            router.push(`/dashboard/parent/reports?teacher=${encodeURIComponent(notif.teacherName)}`);
        } else if (notif.type === "event" && notif.eventId) {
            router.push(`/dashboard/parent/notifications?event=${encodeURIComponent(notif.eventId)}`);
        }
    }

    const statCards = [
        { label: "Total Present Days", value: student.stats.totalPresent, delta: student.stats.presentDelta, up: student.stats.presentUp, color: "text-sky-600", highlight: false },
        { label: "Absent Days", value: student.stats.absentDays, delta: student.stats.absentDelta, up: student.stats.absentUp, color: "text-red-500", highlight: false },
        { label: "Late Days", value: student.stats.lateDays, delta: student.stats.lateDelta, up: student.stats.lateUp, color: "text-amber-500", highlight: false },
        { label: "Attendance Rate", value: student.stats.attendanceRate, delta: student.stats.rateLabel, up: true, color: "text-blue-600", highlight: true },
    ];

    return (
        <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">

            <Sidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="mb-5">
                        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dashboard</h1>
                        <p className="text-slate-500 text-sm mt-0.5">Welcome back! Here&apos;s your child&apos;s overview</p>
                    </div>

                    {/* Student selector */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-bold text-slate-800 text-base">Select Student</h2>
                            <span className="text-xs text-slate-400">{STUDENTS.length} children enrolled</span>
                        </div>
                        <div className="relative" ref={dropdownRef}>
                            <button onClick={() => setDropdownOpen(p => !p)}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left">
                                <span style={{ width: 40, height: 40, minWidth: 40, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
                                    {student.initials}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800">{student.name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{student.grade} &bull; Student ID: {student.studentId}</p>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
                            </button>
                            {dropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                                    {STUDENTS.map(s => (
                                        <button key={s.id} type="button"
                                            onMouseDown={e => { e.preventDefault(); selectStudent(s.id); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50 ${s.id === selectedId ? "bg-blue-50" : "bg-white"}`}>
                                            <span style={{ width: 36, height: 36, minWidth: 36, borderRadius: "50%", background: s.id === "1" ? "#2563eb" : "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>
                                                {s.initials}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-semibold ${s.id === selectedId ? "text-blue-700" : "text-slate-800"}`}>{s.name}</p>
                                                <p className="text-xs text-slate-400">{s.grade} &bull; {s.studentId}</p>
                                            </div>
                                            {s.id === selectedId && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Student info */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-800 text-base">Student Information</h2>
                            <ExternalLink className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: "Student Name", value: student.name },
                                { label: "Student ID", value: student.studentId },
                                { label: "Grade & Section", value: student.grade },
                                { label: "Class Adviser", value: student.adviser },
                            ].map(({ label, value }) => (
                                <div key={label}>
                                    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                                    <p className="text-sm font-bold text-slate-800">{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                        {statCards.map(({ label, value, delta, up, color, highlight }) => (
                            <div key={label} className={`bg-white rounded-2xl border shadow-sm p-4 ${highlight ? "border-blue-200" : "border-slate-100"}`}>
                                <p className="text-xs text-slate-400 mb-2">{label}</p>
                                <p className={`text-3xl font-extrabold ${color}`}>{value}</p>
                                <div className="flex items-center gap-1 mt-2">
                                    {up ? <TrendingUp className={`w-3.5 h-3.5 ${highlight ? "text-blue-500" : "text-emerald-500"}`} />
                                        : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                                    <p className={`text-[11px] font-medium ${highlight ? "text-blue-500" : up ? "text-emerald-500" : "text-red-400"}`}>{delta}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Attendance table */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-bold text-slate-800 text-base">Monthly Attendance Record</h2>
                            <button className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                November 2026 <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {["Date", "Day", "Status", "Time In", "Time Out", "RFID Scan"].map(h => (
                                            <th key={h} className="text-left text-xs font-semibold text-slate-400 pb-3 pr-4">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {student.attendance.map((row, i) => (
                                        <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                                            <td className="py-3 pr-4 text-slate-700 font-medium text-xs">{row.date}</td>
                                            <td className="py-3 pr-4 text-slate-500 text-xs">{row.day}</td>
                                            <td className="py-3 pr-4"><StatusBadge status={row.status} /></td>
                                            <td className="py-3 pr-4 text-slate-600 text-xs">{row.timeIn}</td>
                                            <td className="py-3 pr-4 text-slate-600 text-xs">{row.timeOut}</td>
                                            <td className="py-3"><RfidBadge value={row.rfid} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-100">
                            <Link href={`/dashboard/parent/attendance?student=${selectedId}`}
                                className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                                View full attendance history →
                            </Link>
                        </div>
                    </div>

                    {/* Notifications */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-1">
                            <div>
                                <h2 className="font-bold text-slate-800 text-base">Notifications</h2>
                                <p className="text-xs text-slate-400 mt-0.5">{unreadCount} unread message{unreadCount !== 1 ? "s" : ""}</p>
                            </div>
                            {unreadCount > 0 && (
                                <button onClick={markAllRead}
                                    className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                                    <CheckCheck className="w-3.5 h-3.5" /> Mark all
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col gap-3 mt-4">
                            {notifs.map((notif) => {
                                const { id, icon: Icon, title, time, msg, unread, color, iconColor } = notif;
                                return (
                                    <div key={id} onClick={() => handleNotifClick(notif)}
                                        className={`flex gap-3 border rounded-xl p-4 relative transition-all cursor-pointer hover:shadow-md hover:brightness-95 ${color}`}>
                                        <div className={`w-9 h-9 rounded-xl ${iconColor} flex items-center justify-center shrink-0`}>
                                            <Icon className="w-[18px] h-[18px] text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800">{title}</p>
                                            <p className="text-xs text-slate-400 mb-1">{time}</p>
                                            <p className="text-xs text-slate-600 leading-relaxed">{msg}</p>
                                        </div>
                                        {unread && <span className="w-2 h-2 bg-red-500 rounded-full absolute top-4 right-4" />}
                                    </div>
                                );
                            })}
                        </div>
                        <Link href="/dashboard/parent/notifications"
                            className="flex items-center justify-center gap-1.5 w-full mt-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                            View All Notifications <span className="text-base">→</span>
                        </Link>
                    </div>
                </main>
            </div>
        </div>
    );
}