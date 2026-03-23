"use client";

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

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
    LayoutDashboard, CalendarDays, FileText, Bell,
    LogOut, ChevronDown, TrendingUp, TrendingDown,
} from "lucide-react";

import Sidebar from "../components/Sidebar";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AttendanceStatus = "Present" | "Late" | "Absent";

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

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — 2 children with completely different data
// ─────────────────────────────────────────────────────────────────────────────

const STUDENTS: StudentData[] = [
    {
        id: "1",
        name: "Carlos Santos Doe",
        grade: "Grade 6",
        section: "Rizal",
        studentId: "SES-2026-0891",
        adviser: "Mr. Jose Reyes",
        initials: "CS",
        avatarBg: "#2563eb",   // blue-600
        totalPresent: 148,
        presentDelta: 3,
        absentDays: 2,
        absentDelta: -1,
        lateDays: 3,
        lateDelta: 1,
        attendanceRate: 96.1,
        rateLabel: "Excellent standing",
        months: [
            {
                label: "November 2026",
                records: [
                    { date: "Nov 22, 2026", day: "Monday", status: "Present", timeIn: "07:30 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Nov 21, 2026", day: "Friday", status: "Present", timeIn: "07:35 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Nov 20, 2026", day: "Thursday", status: "Late", timeIn: "08:20 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Nov 19, 2026", day: "Wednesday", status: "Present", timeIn: "07:28 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Nov 18, 2026", day: "Tuesday", status: "Absent", timeIn: "—", timeOut: "—", rfidScan: "None" },
                    { date: "Nov 15, 2026", day: "Friday", status: "Present", timeIn: "07:32 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                ],
            },
            {
                label: "October 2026",
                records: [
                    { date: "Oct 31, 2026", day: "Friday", status: "Present", timeIn: "07:29 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Oct 30, 2026", day: "Thursday", status: "Present", timeIn: "07:33 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Oct 29, 2026", day: "Wednesday", status: "Late", timeIn: "08:05 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Oct 28, 2026", day: "Tuesday", status: "Present", timeIn: "07:30 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Oct 25, 2026", day: "Saturday", status: "Absent", timeIn: "—", timeOut: "—", rfidScan: "None" },
                ],
            },
            {
                label: "September 2026",
                records: [
                    { date: "Sep 30, 2026", day: "Wednesday", status: "Present", timeIn: "07:40 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Sep 29, 2026", day: "Tuesday", status: "Present", timeIn: "07:35 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                    { date: "Sep 28, 2026", day: "Monday", status: "Present", timeIn: "07:42 AM", timeOut: "04:00 PM", rfidScan: "Verified" },
                ],
            },
        ],
    },
    {
        id: "2",
        name: "Maria Santos Doe",
        grade: "Grade 1",
        section: "Mabuhay",
        studentId: "SES-2026-1234",
        adviser: "Ms. Ana Cruz",
        initials: "MD",
        avatarBg: "#3b82f6",   // blue-500
        totalPresent: 142,
        presentDelta: 5,
        absentDays: 3,
        absentDelta: -2,
        lateDays: 5,
        lateDelta: 2,
        attendanceRate: 94.7,
        rateLabel: "Excellent standing",
        months: [
            {
                label: "November 2026",
                records: [
                    { date: "Nov 22, 2026", day: "Monday", status: "Present", timeIn: "07:45 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Nov 21, 2026", day: "Friday", status: "Late", timeIn: "08:15 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Nov 20, 2026", day: "Thursday", status: "Present", timeIn: "07:50 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Nov 19, 2026", day: "Wednesday", status: "Present", timeIn: "07:40 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Nov 18, 2026", day: "Tuesday", status: "Absent", timeIn: "—", timeOut: "—", rfidScan: "None" },
                    { date: "Nov 15, 2026", day: "Friday", status: "Present", timeIn: "07:45 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                ],
            },
            {
                label: "October 2026",
                records: [
                    { date: "Oct 31, 2026", day: "Friday", status: "Present", timeIn: "07:48 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Oct 30, 2026", day: "Thursday", status: "Late", timeIn: "08:20 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Oct 29, 2026", day: "Wednesday", status: "Present", timeIn: "07:44 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Oct 28, 2026", day: "Tuesday", status: "Present", timeIn: "07:50 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Oct 27, 2026", day: "Monday", status: "Late", timeIn: "08:10 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                ],
            },
            {
                label: "September 2026",
                records: [
                    { date: "Sep 30, 2026", day: "Wednesday", status: "Present", timeIn: "07:45 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                    { date: "Sep 29, 2026", day: "Tuesday", status: "Absent", timeIn: "—", timeOut: "—", rfidScan: "None" },
                    { date: "Sep 28, 2026", day: "Monday", status: "Present", timeIn: "07:50 AM", timeOut: "03:30 PM", rfidScan: "Verified" },
                ],
            },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Nav
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard/parent" },
    { label: "Attendance", icon: CalendarDays, href: "/dashboard/parent/attendance" },
    { label: "Reports", icon: FileText, href: "/dashboard/parent/reports" },
    { label: "Notifications", icon: Bell, href: "/dashboard/parent/notifications" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function statusBadgeClass(status: AttendanceStatus) {
    switch (status) {
        case "Present": return "bg-green-500 text-white";
        case "Late": return "bg-yellow-400 text-white";
        case "Absent": return "bg-red-500 text-white";
    }
}

function rfidBadgeClass(scan: string) {
    if (scan === "Verified") return "bg-sky-500 text-white";
    if (scan === "Manual") return "bg-amber-400 text-white";
    return "bg-slate-200 text-slate-500";
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ParentAttendancePage() {
    const [selectedId, setSelectedId] = useState(STUDENTS[0].id);
    const [studentDrop, setStudentDrop] = useState(false);
    const [monthIdx, setMonthIdx] = useState(0);
    const [monthDrop, setMonthDrop] = useState(false);

    // Refs to detect clicks outside each dropdown
    const studentDropRef = useRef<HTMLDivElement>(null);
    const monthDropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const studentParam = params.get("student");
        if (!studentParam) return;

        // FIX: uses .includes() so "Maria" matches "Maria Santos Doe"
        const match =
            STUDENTS.find(s => s.id === studentParam) ??
            STUDENTS.find(s => s.name.toLowerCase().includes(studentParam.toLowerCase()));

        if (match) {
            setSelectedId(match.id);
            setMonthIdx(0);
        }
    }, []);

    // Close dropdowns when clicking outside them
    useEffect(() => {
        function handleOutsideClick(e: MouseEvent) {
            // Only close student drop if click is outside its wrapper
            if (
                studentDrop &&
                studentDropRef.current &&
                !studentDropRef.current.contains(e.target as Node)
            ) {
                setStudentDrop(false);
            }
            // Only close month drop if click is outside its wrapper
            if (
                monthDrop &&
                monthDropRef.current &&
                !monthDropRef.current.contains(e.target as Node)
            ) {
                setMonthDrop(false);
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [studentDrop, monthDrop]);

    const student = STUDENTS.find(s => s.id === selectedId) ?? STUDENTS[0];
    // Clamp monthIdx in case new student has fewer months than the previous one
    const safeMonthIdx = Math.min(monthIdx, student.months.length - 1);
    const currentMonth = student.months[safeMonthIdx];

    function selectStudent(id: string) {
        setSelectedId(id);
        setMonthIdx(0);  // always reset to first month on student switch
        setStudentDrop(false);
    }



    return (
        <div className="flex h-screen overflow-hidden font-sans" style={{ background: "#eef2f7" }}>

            <Sidebar />

            {/* ── Main content ─────────────────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto p-8">

                {/* Page header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Attendance</h1>
                    <p className="text-slate-500 text-sm mt-0.5">View your child&apos;s attendance records and history</p>
                </div>

                {/* ── Student selector card ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 p-5">
                    <p className="text-sm font-bold text-slate-700 mb-3">Select Student</p>

                    <div className="relative" ref={studentDropRef}>
                        {/* Trigger button */}
                        <button
                            onClick={() => setStudentDrop(p => !p)}
                            className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left">
                            <span style={{ width: 44, height: 44, minWidth: 44, borderRadius: "50%", background: student.avatarBg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>
                                {student.initials}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800">{student.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {student.grade} - {student.section}&nbsp;&bull;&nbsp;Student ID: {student.studentId}
                                </p>
                            </div>
                            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform shrink-0 ${studentDrop ? "rotate-180" : ""}`} />
                        </button>

                        {/* Dropdown — no backdrop, closed by outside-click useEffect */}
                        {studentDrop && (
                            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-30 overflow-hidden">
                                {STUDENTS.map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault(); // prevent blur before click
                                            selectStudent(s.id);
                                        }}
                                        className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-blue-50 ${s.id === selectedId ? "bg-blue-50" : "bg-white"
                                            }`}>
                                        <span style={{ width: 40, height: 40, minWidth: 40, borderRadius: "50%", background: s.avatarBg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>
                                            {s.initials}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-semibold ${s.id === selectedId ? "text-blue-700" : "text-slate-800"}`}>
                                                {s.name}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {s.grade} - {s.section}&nbsp;&bull;&nbsp;{s.studentId}
                                            </p>
                                        </div>
                                        {s.id === selectedId && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Stat cards ── */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
                    {/* Total Present */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <p className="text-xs font-semibold text-slate-500 mb-2">Total Present Days</p>
                        <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.totalPresent}</p>
                        <div className="flex items-center gap-1.5">
                            {student.presentDelta >= 0
                                ? <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                : <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                            }
                            <span className="text-xs text-blue-400 font-medium">
                                {student.presentDelta >= 0 ? "+" : ""}{student.presentDelta} from last month
                            </span>
                        </div>
                    </div>

                    {/* Absent */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <p className="text-xs font-semibold text-slate-500 mb-2">Absent Days</p>
                        <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.absentDays}</p>
                        <div className="flex items-center gap-1.5">
                            {student.absentDelta >= 0
                                ? <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                : <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                            }
                            <span className="text-xs text-blue-400 font-medium">
                                {student.absentDelta >= 0 ? "+" : ""}{student.absentDelta} from last month
                            </span>
                        </div>
                    </div>

                    {/* Late */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <p className="text-xs font-semibold text-slate-500 mb-2">Late Days</p>
                        <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.lateDays}</p>
                        <div className="flex items-center gap-1.5">
                            {student.lateDelta >= 0
                                ? <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                                : <TrendingDown className="w-3.5 h-3.5 text-blue-400" />
                            }
                            <span className="text-xs text-blue-400 font-medium">
                                {student.lateDelta >= 0 ? "+" : ""}{student.lateDelta} from last month
                            </span>
                        </div>
                    </div>

                    {/* Attendance Rate */}
                    <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
                        <p className="text-xs font-semibold text-slate-500 mb-2">Attendance Rate</p>
                        <p className="text-4xl font-extrabold text-blue-500 leading-none mb-2">{student.attendanceRate}%</p>
                        <p className="text-xs font-semibold text-blue-500">{student.rateLabel}</p>
                    </div>
                </div>

                {/* ── Monthly Attendance Record ── */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                    {/* Table header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <p className="text-base font-bold text-slate-800">Monthly Attendance Record</p>

                        {/* Month dropdown */}
                        <div className="relative" ref={monthDropRef}>
                            <button
                                onClick={() => setMonthDrop(p => !p)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                                {currentMonth.label}
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${monthDrop ? "rotate-180" : ""}`} />
                            </button>
                            {monthDrop && (
                                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-xl z-30 min-w-[170px] overflow-hidden">
                                    {student.months.map((m, idx) => (
                                        <button
                                            key={m.label}
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                setMonthIdx(idx);
                                                setMonthDrop(false);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-blue-50 ${idx === safeMonthIdx ? "text-blue-600 font-semibold bg-blue-50" : "text-slate-700"
                                                }`}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Table */}
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
                                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                                            No records for this month.
                                        </td>
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

            </main>
        </div>
    );
}