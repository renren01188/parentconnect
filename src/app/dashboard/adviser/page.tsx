"use client";

import { useState, useEffect } from "react";
import {
  Users, ScanLine, FileText, Bell,
  CheckCircle, XCircle, Clock, ChevronRight,
  ScanLine as ScanIcon,
} from "lucide-react";
import Link from "next/link";

interface RfidLog {
  id: number;
  student_id: string;
  full_name: string;
  time_logged: string;
  type: string;
  status: "On Time" | "Late" | "Absent";
  via: string;
}

interface ParentReport {
  id: number;
  parent_name: string;
  subject: string;
  is_read: boolean;
}

interface AbsentStudent {
  id: number;
  student_id: string;
  full_name: string;
}

interface DashboardStats {
  total_students: number;
  present: number;
  absent: number;
  late: number;
  pending_reports: number;
}

interface AdviserInfo {
  section: string | null;
  grade: string | null;
  full_name: string;
}

const AVATAR_COLORS = [
  "bg-emerald-500","bg-blue-500","bg-orange-500","bg-pink-500",
  "bg-purple-500","bg-teal-500","bg-red-500","bg-indigo-500",
  "bg-amber-500","bg-cyan-500",
];

function getInitial(name: string) {
  return name.trim()[0]?.toUpperCase() ?? "?";
}
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function formatTime(value: string) {
  if (!value) return "-";
  const parts = value.split(":");
  if (parts.length < 2) return value;
  let hour = Number(parts[0]);
  const minute = parts[1];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour.toString().padStart(2, "0")}:${minute} ${suffix}`;
}

// ── Main Page — sidebar removed, layout.tsx handles it ────────────────────────
export default function AdviserDashboardPage() {
  const [adviser,        setAdviser]  = useState<AdviserInfo | null>(null);
  const [stats,          setStats]    = useState<DashboardStats>({ total_students: 0, present: 0, absent: 0, late: 0, pending_reports: 0 });
  const [logs,           setLogs]     = useState<RfidLog[]>([]);
  const [reports,        setReports]  = useState<ParentReport[]>([]);
  const [absentStudents, setAbsent]   = useState<AbsentStudent[]>([]);
  const [loading,        setLoading]  = useState(true);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [logsRes, stuRes] = await Promise.all([
          fetch("/api/attendance/today", { cache: "no-store" }),
          fetch("/api/students?limit=200",  { cache: "no-store" }),
        ]);

        const logsData = await logsRes.json();
        if (logsData.success) setLogs(logsData.logs || []);

        const stuData = await stuRes.json();
        if (stuData.success) {
          if (stuData.adviser) setAdviser(stuData.adviser);
          const all     = stuData.data as any[];
          const present = all.filter(s => s.today_status === "Present").length;
          const late    = all.filter(s => s.today_status === "Late").length;
          const absent  = all.filter(s => s.today_status === "Absent").length;
          setStats({ total_students: stuData.pagination.total, present, late, absent, pending_reports: 0 });
          setAbsent(
            all.filter(s => s.today_status === "Absent").slice(0, 5)
               .map(s => ({ id: s.id, student_id: s.student_id, full_name: s.full_name }))
          );
        }
      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const sectionLabel = adviser?.grade && adviser?.section
    ? `Grade ${adviser.grade} · ${adviser.section}`
    : "Your Section";

  const statCards = [
    { label: "Students", value: stats.total_students, sub: "Enrolled in class", icon: Users,       color: "text-slate-700",   iconBg: "bg-slate-100"  },
    { label: "Present",  value: stats.present,        sub: "Here today",        icon: CheckCircle, color: "text-emerald-600", iconBg: "bg-emerald-50" },
    { label: "Absent",   value: stats.absent,         sub: "Not in today",      icon: XCircle,     color: "text-red-500",     iconBg: "bg-red-50"     },
    { label: "Late",     value: stats.late,           sub: "Late arrivals",     icon: Clock,       color: "text-amber-500",   iconBg: "bg-amber-50"   },
    { label: "Reports",  value: stats.pending_reports,sub: "Pending review",    icon: FileText,    color: "text-blue-500",    iconBg: "bg-blue-50"    },
  ];

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6 bg-slate-100 min-h-screen font-sans">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-medium text-slate-600">Scanner Online</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        {statCards.map(({ label, value, sub, icon: Icon, color, iconBg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className={`text-3xl font-extrabold ${color}`}>{loading ? "—" : value}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* Today's RFID Log */}
        <div className="xl:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-800">Today&apos;s RFID Log</h2>
            <Link href="/dashboard/adviser/attendance"
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors">
              <ScanIcon className="w-3.5 h-3.5" /> Take Attendance
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/60">
                  {["Time","Student","Status","Type"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-400 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="py-10 text-center text-slate-400 text-sm">Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-slate-400 text-sm">No attendance records yet today.</td></tr>
                ) : (
                  logs.slice(0, 8).map(log => (
                    <tr key={log.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 text-sm text-slate-500 font-medium whitespace-nowrap">{formatTime(log.time_logged)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-full ${avatarColor(log.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {getInitial(log.full_name)}
                          </div>
                          <span className="text-sm font-semibold text-slate-700">{log.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          log.status === "On Time" ? "bg-emerald-100 text-emerald-700" :
                          log.status === "Late"    ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-600"
                        }`}>{log.status}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">{log.type}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="xl:col-span-5 flex flex-col gap-5">

          {/* Parent Reports */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Parent Reports</h2>
              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
                {stats.pending_reports} Pending
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {reports.length === 0 ? (
                [
                  { name: "Maria Santos Doe",     subject: "Concern about math performance", read: false },
                  { name: "Juan dela Cruz Parent", subject: "Request for school records",    read: false },
                  { name: "Pedro Reyes Parent",   subject: "Absence excuse letter",         read: true  },
                ].map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${r.read ? "bg-slate-100 text-slate-400" : "bg-emerald-500 text-white"}`}>
                        {r.read ? "Read" : "New"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{r.name}</p>
                        <p className="text-xs text-slate-400 truncate">{r.subject}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 ml-2" />
                  </div>
                ))
              ) : (
                reports.slice(0, 4).map(r => (
                  <div key={r.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${r.is_read ? "bg-slate-100 text-slate-400" : "bg-emerald-500 text-white"}`}>
                        {r.is_read ? "Read" : "New"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{r.parent_name}</p>
                        <p className="text-xs text-slate-400 truncate">{r.subject}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 ml-2" />
                  </div>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100">
              <Link href="/dashboard/adviser/reports"
                className="block text-center text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                View All Reports
              </Link>
            </div>
          </div>

          {/* Absent Today */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Absent Today</h2>
              <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full">
                {loading ? "—" : `${stats.absent} Students`}
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {loading ? (
                <p className="py-8 text-center text-slate-400 text-sm">Loading…</p>
              ) : absentStudents.length === 0 ? (
                <p className="py-8 text-center text-slate-400 text-sm">🎉 All students are present!</p>
              ) : (
                absentStudents.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarColor(s.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {getInitial(s.full_name)}
                      </div>
                      <span className="text-sm font-semibold text-slate-700">{s.full_name}</span>
                    </div>
                    <button className="text-xs font-semibold text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                      Notify
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}