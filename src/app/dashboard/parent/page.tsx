"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    MessageSquare, CheckCheck,
    Clock, Ban, Calendar, Users,
} from "lucide-react";
import Link from "next/link";
import Sidebar from "./components/Sidebar";
import ParentDashboardGuide from "./components/ParentDashboardGuide";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { useDebouncedRealtimeRefresh } from "@/hooks/useDebouncedRealtimeRefresh";
import { useParentSession } from "./ParentSessionGate";
import { attendedDayCount, calculateAttendanceRate } from "@/lib/attendanceRate.cjs";
import { dashboardPath } from "@/lib/routeAliases";

interface StudentInfo {
    id: string;
    name: string;
    studentId: string;
    grade: string;
    initials: string;
    avatarColor: string;
    stats: {
        totalPresent: string; presentDelta: string; presentUp: boolean;
        absentDays: string; absentDelta: string; absentUp: boolean;
        lateDays: string; lateDelta: string; lateUp: boolean;
        attendanceRate: string; rateLabel: string;
    };
    attendance: {
        attendanceDate?: string; date: string; day: string; status: string;
        timeIn: string; timeOut: string; rfid: string;
    }[];
    checkInTime: string;
    checkInDay: string;
    hasClassToday: boolean;
    isAtSchool: boolean;
}

type ParentNotificationPreview = {
    id: number;
    type: "message";
    icon: typeof MessageSquare;
    title: string;
    time: string;
    msg: string;
    unread: boolean;
    color: string;
    iconColor: string;
    announcementId?: number;
    notificationIds?: number[];
    reportId?: number;
    staffMessageConversationId?: number;
    parentDeletionNotificationId?: number;
};

type ParentAnnouncementPreview = {
    id: number;
    title: string;
    message: string;
    senderName: string;
    senderRole: string;
    time: string;
    unread: boolean;
};

type ParentDashboardNotification = {
    id: number;
    title: string;
    msg: string;
    time: string;
    unread: boolean;
    announcementId?: number;
    announcementTitle?: string;
    notificationIds?: number[];
    reportId?: number;
    staffMessageConversationId?: number;
    parentDeletionNotificationId?: number;
    senderName?: string;
    senderRole?: string;
    teacherName?: string;
};

type ParentScheduledDeletionNotice = {
    scheduledDeletionId: number;
    deleteAfter: string | null;
    approvedAt: string | null;
};

function scheduledDeletionDateLabel(value: string | null) {
    if (!value) return "the date provided by the school";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "the date provided by the school";
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

function parentReportDateLabel(value: unknown) {
    const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "Recently";
    return date.toLocaleDateString("en-US", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MANILA_TIME_ZONE = "Asia/Manila";

function manilaGreeting(value = new Date()) {
    const hour = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: MANILA_TIME_ZONE,
        hour: "numeric",
        hourCycle: "h23",
    }).format(value));
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

function studentAvatarColor(studentId: string) {
    const palette = ["#2563eb", "#0ea5e9", "#4f46e5", "#7c3aed", "#0891b2"];
    const hash = [...studentId].reduce((total, character) => total + character.charCodeAt(0), 0);
    return palette[hash % palette.length];
}

function emptyStudentInfo(student: { id: number; name: string; lrn: string; grade: string; section: string }): StudentInfo {
    const name = String(student.name ?? "").trim() || "Student";
    const studentId = String(student.lrn ?? "").trim();
    const initials = name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "ST";
    const checkInDay = new Intl.DateTimeFormat("en-US", {
        timeZone: MANILA_TIME_ZONE,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(new Date());

    return {
        id: String(student.id),
        name,
        studentId,
        grade: [student.grade, student.section].filter(Boolean).join(" - "),
        initials,
        avatarColor: studentAvatarColor(studentId || String(student.id)),
        stats: {
            totalPresent: "0", presentDelta: "No attendance records", presentUp: false,
            absentDays: "0", absentDelta: "No attendance records", absentUp: false,
            lateDays: "0", lateDelta: "No attendance records", lateUp: false,
            attendanceRate: "0.0%", rateLabel: "No attendance records",
        },
        attendance: [],
        checkInTime: "Not yet in",
        checkInDay,
        hasClassToday: true,
        isAtSchool: false,
    };
}

function manilaDateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: MANILA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDateKey(dateKey: string, days: number) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));
    return date.toISOString().slice(0, 10);
}

function manilaSchoolWeek() {
    const today = manilaDateKey();
    const [year, month, day] = today.split("-").map(Number);
    // Date-only attendance values are school-calendar dates. UTC avoids a
    // browser's timezone changing which weekday that saved date represents.
    const sundayFirstDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const monday = shiftDateKey(today, -((sundayFirstDay + 6) % 7));
    return WEEK_DAYS.map((label, index) => ({ label, dateKey: shiftDateKey(monday, index) }));
}

function WeekDots({ attendance }: { attendance: StudentInfo["attendance"] }) {
    const attendanceByDate = new Map(attendance.flatMap((record) =>
        record.attendanceDate ? [[record.attendanceDate, record.status] as const] : [],
    ));
    const schoolWeek = manilaSchoolWeek();
    return (
        <div className="flex gap-2 mt-3">
            {schoolWeek.map(({ label, dateKey }) => {
                const status = attendanceByDate.get(dateKey);
                let bg = "bg-slate-200"; let icon = "–";
                if (status === "Present") { bg = "bg-teal-400"; icon = "✓"; }
                else if (status === "Late") { bg = "bg-yellow-400"; icon = "–"; }
                else if (status === "Absent") { bg = "bg-red-400"; icon = "–"; }
                else if (status === "Excused") { bg = "bg-sky-400"; icon = "✓"; }
                return (
                    <div key={dateKey} className="flex flex-col items-center gap-1">
                        <span
                            aria-label={`${label}: ${status ?? "No attendance record"}`}
                            title={`${label}: ${status ?? "No attendance record"}`}
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${bg}`}
                        >{icon}</span>
                        <span className="text-[10px] text-slate-400">{label}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function ParentDashboard() {
    const router = useRouter();
    const { session, refreshSession } = useParentSession();
    const [notifs, setNotifs] = useState<ParentNotificationPreview[]>([]);
    const [announcements, setAnnouncements] = useState<ParentAnnouncementPreview[]>([]);
    const [scheduledDeletionNotice, setScheduledDeletionNotice] = useState<ParentScheduledDeletionNotice | null>(null);
    const [students, setStudents] = useState<StudentInfo[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [parentName, setParentName] = useState("Parent");
    const [profileLoading, setProfileLoading] = useState(true);
    const [reportsData, setReportsData] = useState<{ title: string; meta: string; isNew: boolean }[]>([]);
    const [messagesData, setMessagesData] = useState<{ initials: string; name: string; preview: string; color: string }[]>([]);
    const [guideTarget, setGuideTarget] = useState<string | null>(null);
    const [greeting, setGreeting] = useState(() => manilaGreeting());

    useEffect(() => {
        const updateGreeting = () => setGreeting(manilaGreeting());
        updateGreeting();
        const timer = window.setInterval(updateGreeting, 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const loadParentStudent = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
            try {
                const data = session;
                if (!data?.success) {
                    router.push("/login/guardian");
                    return;
                }

                const linkedStudentRows = (
                    Array.isArray(data.students) && data.students.length > 0
                        ? data.students
                        : data.student ? [data.student] : []
                ) as Array<{
                    id: number;
                    name: string;
                    lrn: string;
                    grade: string;
                    section: string;
                }>;
                const linkedStudents = linkedStudentRows.map(emptyStudentInfo);

                const firstStudent = linkedStudents[0];
                setParentName(data.parent.name || "Parent");
                setStudents(linkedStudents);
                setSelectedId((current) => linkedStudents.some((student) => student.id === current)
                    ? current
                    : firstStudent?.id ?? "");

                // These snapshots are independent. Starting them together
                // removes a deployed network waterfall without weakening the
                // server-side authorization each endpoint performs.
                const [attendanceResults, notificationResult, reportsResult] = await Promise.all([
                    Promise.all(
                        linkedStudents.map(s =>
                            fetch(`/api/attendance/parent-history?student_id=${s.studentId}`, { cache: "no-store" })
                                .then(r => r.json())
                                .catch(() => null)
                        )
                    ),
                    fetch("/api/parents/notifications", { cache: "no-store" })
                        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
                        .catch(() => ({ ok: false, data: null })),
                    fetch("/api/reports/parent-adviser?role=parent", { cache: "no-store" })
                        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
                        .catch(() => ({ ok: false, data: null })),
                ]);

                linkedStudents.forEach((s, i) => {
                    const data = attendanceResults[i];
                    if (!data?.success) return;
                    s.hasClassToday = data.todayClassStatus !== "No Class For Today";
                    const present = Number(data.stats?.present ?? 0);
                    const late = Number(data.stats?.late ?? 0);
                    const absent = Number(data.stats?.absent ?? 0);
                    const total = present + late + absent;
                    const rate = calculateAttendanceRate({ present, late, absent }).toFixed(1);
                    s.stats = {
                        totalPresent: String(attendedDayCount({ present, late })),
                        presentDelta: total > 0 ? "" : "No attendance records",
                        presentUp: true,
                        absentDays: String(absent),
                        absentDelta: total > 0 ? "" : "No attendance records",
                        absentUp: false,
                        lateDays: String(late),
                        lateDelta: total > 0 ? "" : "No attendance records",
                        lateUp: false,
                        attendanceRate: `${rate}%`,
                        rateLabel: total === 0 ? "No attendance records" : Number(rate) >= 95 ? "Excellent" : Number(rate) >= 85 ? "Good" : "Needs Attention",
                    };
                    // Keep every saved date for the overall stats, then let
                    // WeekDots select only the current Manila school week.
                    s.attendance = Array.isArray(data.records) ? data.records.map((r: any) => {
                        const dateObj = new Date(`${r.attendance_date}T00:00:00Z`);
                        return {
                            attendanceDate: r.attendance_date,
                            date: dateObj.toLocaleDateString("en-US", { timeZone: MANILA_TIME_ZONE, month: "short", day: "numeric", year: "numeric" }),
                            day: dateObj.toLocaleDateString("en-US", { timeZone: MANILA_TIME_ZONE, weekday: "long" }),
                            status: r.status === "On Time" ? "Present" : r.status,
                            timeIn: r.time_in ?? "—",
                            timeOut: r.time_out ?? "—",
                            rfid: r.time_in ? "Verified" : "No Scan",
                        };
                    }) : [];
                    // Check-in info from today's record
                    const todayIso = manilaDateKey();
                    const todayRecord = s.attendance.find((record) => record.attendanceDate === todayIso);
                    s.isAtSchool = s.hasClassToday && Boolean(todayRecord?.timeIn && todayRecord.timeIn !== "—");
                    s.checkInTime = !s.hasClassToday
                        ? "No Class For Today"
                        : todayRecord?.timeIn && todayRecord.timeIn !== "—"
                        ? (() => {
                            const [h, m] = todayRecord.timeIn.split(":");
                            const hour = Number(h);
                            const suffix = hour >= 12 ? "PM" : "AM";
                            return `${String(hour % 12 || 12).padStart(2, "0")}:${m} ${suffix}`;
                        })()
                        : "Not yet in";
                    s.checkInDay = new Intl.DateTimeFormat("en-US", {
                        timeZone: MANILA_TIME_ZONE,
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                    }).format(new Date());
                });

                const notifData = notificationResult.data;
                const realNotifications: ParentDashboardNotification[] = Array.isArray(notifData?.notifications)
                    ? notifData.notifications
                    : [];
                setScheduledDeletionNotice(notifData?.scheduledDeletionNotice ?? null);
                setNotifs(realNotifications.slice(0, 3).map((notif) => ({
                    id: notif.id,
                    type: "message",
                    icon: MessageSquare,
                    title: notif.title,
                    time: notif.time,
                    msg: notif.msg,
                    unread: notif.unread,
                    color: notif.unread ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200",
                    iconColor: "bg-blue-500",
                    announcementId: notif.announcementId,
                    notificationIds: notif.notificationIds,
                    reportId: notif.reportId,
                    staffMessageConversationId: notif.staffMessageConversationId,
                    parentDeletionNotificationId: notif.parentDeletionNotificationId,
                })));
                setAnnouncements(realNotifications
                    .filter((notif) => typeof notif.announcementId === "number")
                    .slice(0, 3)
                    .map((notif) => {
                        const senderRole = String(notif.senderRole ?? "School staff").trim() || "School staff";
                        const senderName = String(notif.senderName ?? notif.teacherName ?? senderRole).trim() || senderRole;
                        return {
                            id: notif.id,
                            title: String(notif.announcementTitle ?? notif.title ?? "School announcement").trim() || "School announcement",
                            message: String(notif.msg ?? "").trim() || "No announcement message was provided.",
                            senderName,
                            senderRole,
                            time: notif.time,
                            unread: notif.unread,
                        };
                    }));
                const reportsJson = reportsResult.data;
                if (reportsResult.ok && reportsJson?.success) {
                    const reports = (reportsJson.reports ?? []).slice(0, 3);
                    setReportsData(reports.map((r: any) => ({
                        title: r.subject,
                        meta: `${r.isStudentSubmittedConcern ? "Student concern" : r.unread ? "New" : "Viewed"} · ${parentReportDateLabel(r.createdAt ?? r.created_at ?? r.submittedAt)}`,
                        isNew: Boolean(r.unread),
                    })));
                    setMessagesData(reports.slice(0, 3).map((r: any) => ({
                        initials: (r.recipientName ?? r.adviser_name ?? "Class Adviser").split(" ").map((p: string) => p[0]).join("").slice(0, 2).toUpperCase(),
                        name: r.recipientName ?? r.adviser_name ?? "Class Adviser",
                        preview: (r.subject ?? "").slice(0, 18) + "...",
                        color: "#6366f1",
                    })));
                }
            } catch {
                // ParentSessionGate owns authentication redirects. A failed
                // dashboard snapshot must retain the verified session instead
                // of turning a transient data error into a logout.
            } finally {
                if (!background) setProfileLoading(false);
            }
    }, [router, session]);

    useEffect(() => { void loadParentStudent(); }, [loadParentStudent]);

    // Dashboard cards are a view of protected parent, attendance, report,
    // and notification APIs. Re-read them in place after the account's
    // data-free invalidation; never navigate or reset the selected child.
    const scheduleDashboardRefresh = useDebouncedRealtimeRefresh(
        () => loadParentStudent({ background: true }),
    );
    useSessionInvalidation((event) => {
        if (!event.scope) {
            scheduleDashboardRefresh();
            return;
        }
        if (event.scope === "students" || event.scope === "accounts") {
            void refreshSession();
            return;
        }
        if (["attendance", "reports", "notifications", "announcements", "staff-messages"].includes(event.scope ?? "")) {
            scheduleDashboardRefresh();
        }
    });


    const student = students.find(s => s.id === selectedId) ?? students[0];
    const unreadCount = notifs.filter(n => n.unread).length;
    const guideHighlight = (target: string) => guideTarget === target
        ? "relative z-[85] pointer-events-none rounded-2xl ring-4 ring-blue-400 ring-offset-4 ring-offset-[#f4f6fb]"
        : "";
    const handleGuideStepChange = useCallback((target: string | null) => {
        setGuideTarget(target);
        window.dispatchEvent(new CustomEvent("parent-dashboard-guide-target", { detail: target }));
    }, []);
    const markAllRead = () => {
        setNotifs(prev => prev.map(n => ({ ...n, unread: false })));
        fetch("/api/parents/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                attendanceLogIds: notifs.filter(notif => notif.id < 0).map(notif => -notif.id),
                reportIds: notifs.flatMap(notif => notif.reportId ? [notif.reportId] : []),
                staffMessageConversationIds: [...new Set(notifs.flatMap(notif =>
                    notif.staffMessageConversationId ? [notif.staffMessageConversationId] : []
                ))],
                notificationIds: notifs
                    .filter(notif => !notif.reportId && !notif.staffMessageConversationId && notif.id > 0)
                    .filter(notif => !notif.parentDeletionNotificationId)
                    .flatMap(notif => notif.notificationIds ?? [notif.id]),
                parentDeletionNotificationIds: notifs.flatMap(notif =>
                    notif.parentDeletionNotificationId ? [notif.parentDeletionNotificationId] : []
                ),
            }),
        }).catch(() => null);
    };

    function selectStudent(id: string) {
        setSelectedId(id);
    }

    function handleNotifClick(notif: ParentNotificationPreview) {
        setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));
        fetch("/api/parents/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                notif.staffMessageConversationId
                    ? { staffMessageConversationId: notif.staffMessageConversationId }
                    : notif.reportId
                        ? { reportId: notif.reportId }
                        : notif.parentDeletionNotificationId
                            ? { parentDeletionNotificationId: notif.parentDeletionNotificationId }
                            : notif.announcementId
                                ? { notificationIds: notif.notificationIds ?? [notif.id] }
                                : notif.id < 0
                                    ? { attendanceLogId: -notif.id }
                                    : { notificationId: notif.id }
            ),
        }).catch(() => null);
        if (notif.staffMessageConversationId) {
            router.push(dashboardPath("parent", `/reports?conversation=${encodeURIComponent(`staff-message:${notif.staffMessageConversationId}`)}`));
            return;
        }
        if (notif.reportId) {
            router.push(dashboardPath("parent", `/reports?reportId=${notif.reportId}`));
            return;
        }
        router.push(dashboardPath("parent", "/notifications"));
    }

    if (profileLoading || !student) {
        return (
            <div className="flex min-h-screen flex-col overflow-x-clip bg-[#f4f6fb] font-sans md:flex-row md:overflow-visible">
                <Sidebar />
                <div className="flex flex-1 items-center justify-center text-sm font-semibold text-slate-400">
                    Loading parent dashboard...
                </div>
            </div>
        );
    }

    // Big stat cards
    const statCards = [
        {
            icon: Calendar, value: student.stats.totalPresent, label: "Days Present",
            delta: `↑ ${student.stats.presentDelta}`, bg: "#1e3a5f", badgeBg: "#1a4a7a",
        },
        {
            icon: Clock, value: student.stats.attendanceRate, label: "Attendance Rate",
            delta: student.stats.rateLabel, bg: "#174a3a", badgeBg: "#166534",
        },
        {
            icon: Ban, value: student.stats.absentDays, label: "Absences",
            delta: `↓ ${student.stats.absentDelta}`, bg: "#4a1a1a", badgeBg: "#6b2020",
        },
        {
            icon: Clock, value: student.stats.lateDays, label: "Late Arrivals",
            delta: `↑ ${student.stats.lateDelta}`, bg: "#3a3010", badgeBg: "#5a4a10",
        },
    ];

    return (
        <div className="flex min-h-screen flex-col overflow-x-clip bg-[#f4f6fb] font-sans md:flex-row md:overflow-visible">

            <Sidebar />

            <div className="flex min-w-0 flex-1 flex-col">
                <main className="flex-1 px-3 py-5 pb-8 sm:px-4 md:px-8 md:py-6 md:pb-8">

                    {/* ── Header ── */}
                    <div className="mb-5">
                        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dashboard</h1>
                        <p className="text-slate-400 text-sm mt-0.5">
                            Welcome back, {parentName.split(" ")[0]} — here&apos;s {student.name.split(" ")[0]}&apos;s overview
                        </p>
                    </div>

                    {/* ── Select Student ── */}
                    {scheduledDeletionNotice && (
                        <div role="alert" className="mb-5 rounded-2xl border border-red-300 bg-red-50 px-4 py-4 text-red-950 shadow-sm sm:px-5">
                            <p className="text-sm font-extrabold">Your account is scheduled for deletion</p>
                            <p className="mt-1 text-sm leading-6 text-red-800">
                                Your ParentConnect account is scheduled for deletion on <strong>{scheduledDeletionDateLabel(scheduledDeletionNotice.deleteAfter)}</strong>.
                                Contact the ICT office immediately if this is unexpected.
                            </p>
                        </div>
                    )}

                    <div data-parent-guide="student-switcher" className={`mb-4 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm sm:px-5 ${guideHighlight("student-switcher")}`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                                <Users className="w-4 h-4 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-800 leading-tight">Select Student</p>
                                <p className="text-xs text-slate-400">{students.length} child linked to this account</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
                            {students.map(s => {
                                const isActive = s.id === selectedId;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => selectStudent(s.id)}
                                        className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all md:min-w-[240px] md:flex-1 ${isActive
                                            ? "border-blue-500 bg-blue-50 shadow-sm"
                                            : "border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-blue-50/50"
                                            }`}
                                    >
                                        <span
                                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                                            style={{ background: s.avatarColor }}
                                        >
                                            {s.initials}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold truncate ${isActive ? "text-blue-700" : "text-slate-800"}`}>
                                                {s.name}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-0.5 truncate">{s.grade}</p>
                                            <p className="text-[10px] text-slate-300 truncate">{s.studentId}</p>
                                        </div>
                                        {isActive && (
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Absence Alert Banner ── */}
                    {/* ── Presence Banner ── */}
                    <div
                        data-parent-guide="today-status"
                        className={`mb-5 flex flex-col gap-4 rounded-2xl px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${guideHighlight("today-status")}`}
                        style={{ background: "linear-gradient(135deg, #1e2d4d 0%, #16213e 100%)" }}
                    >
                        <div className="min-w-0">
                            <p className="text-white font-bold text-base leading-snug">
                                {student.hasClassToday
                                    ? `${greeting}, ${parentName.split(" ")[0]}! ${student.name.split(" ")[0]} is ${student.isAtSchool ? "at school" : "not yet in"}.`
                                    : `No class for ${student.name.split(" ")[0]} today.`}
                            </p>
                            <p className="text-slate-400 text-xs mt-1">{student.checkInDay}</p>
                        </div>
                        <div className="shrink-0 sm:text-right">
                            <p className="text-slate-400 text-[10px] uppercase tracking-wider mb-0.5">{student.hasClassToday ? "Checked in today" : "Class schedule"}</p>
                            <p className="text-white font-extrabold text-2xl leading-tight">{student.checkInTime}</p>
                            <p className={`${student.hasClassToday ? "text-green-400" : "text-slate-300"} text-[11px] mt-0.5 font-semibold`}>
                                {student.hasClassToday
                                    ? student.isAtSchool ? "✓ RFID Verified" : "No scan recorded today"
                                    : "Based on the ICT schedule"}
                            </p>
                        </div>
                    </div>

                    {/* ── Big Stat Cards ── */}
                    <div data-parent-guide="attendance-summary" className={`mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 ${guideHighlight("attendance-summary")}`}>
                        {statCards.map(({ icon: Icon, value, label, delta, bg, badgeBg }) => (
                            <div key={label} className="rounded-2xl p-4 flex flex-col" style={{ background: bg }}>
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(255,255,255,0.12)" }}>
                                    <Icon className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
                                </div>
                                <p className="text-white font-extrabold text-3xl md:text-4xl leading-none">{value}</p>
                                <p className="text-slate-300 text-xs mt-1.5 font-medium">{label}</p>
                                <div className="mt-3">
                                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: badgeBg }}>
                                        {delta}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ── Bottom 4 Mini Cards ── */}
                    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">

                        {/* This Week */}
                        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">This Week</p>
                            <WeekDots attendance={student.attendance} />
                            <div className="flex items-center gap-3 mt-3">
                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> Present
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                    <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Late
                                </span>
                            </div>
                        </div>

                        {/* Reports */}
                        <div className="rounded-2xl border border-slate-100 shadow-sm p-4" style={{ background: "#1a3a2a" }}>
                            <p className="text-[10px] font-bold text-green-300 uppercase tracking-widest mb-2">Reports</p>
                            <div className="flex flex-col gap-2">
                                {reportsData.map((r, i) => (
                                    <div key={`${r.title}-${i}`} className="flex items-start gap-2">
                                        <span className="w-2 h-2 mt-1 rounded-full shrink-0" style={{ background: r.isNew ? "#4ade80" : "#6ee7b7" }} />
                                        <div className="min-w-0 break-words">
                                            <p className="break-words text-xs font-semibold leading-tight text-white">{r.title}</p>
                                            <p className="break-words text-[10px] text-green-300">{r.meta}</p>
                                        </div>
                                    </div>
                                ))}
                                {reportsData.length === 0 && (
                                    <p className="text-green-200/70 text-xs leading-tight">No reports yet</p>
                                )}
                            </div>
                        </div>

                        {/* Announcements */}
                        <div className="rounded-2xl border border-slate-100 shadow-sm p-4" style={{ background: "#3a1a1a" }}>
                            <p className="text-[10px] font-bold text-red-300 uppercase tracking-widest mb-2">Announcements</p>
                            <div className="flex flex-col gap-2">
                                {announcements.map((announcement) => (
                                    <div key={announcement.id} className="flex items-start gap-2">
                                        <span className="w-2 h-2 mt-1 rounded-full bg-red-400 shrink-0" />
                                        <div className="min-w-0 break-words">
                                            <p className="break-words text-xs font-semibold leading-tight text-white">{announcement.title}</p>
                                            <p className="mt-0.5 line-clamp-2 break-words text-[10px] leading-tight text-red-100">{announcement.message}</p>
                                            <p className="mt-1 break-words text-[10px] text-red-300">
                                                {announcement.senderName}{announcement.senderName !== announcement.senderRole ? ` · ${announcement.senderRole}` : ""} · {announcement.time}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {announcements.length === 0 && (
                                    <p className="text-red-200/70 text-xs leading-tight">No announcements yet</p>
                                )}
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="rounded-2xl border border-slate-100 shadow-sm p-4" style={{ background: "#1a1a3a" }}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Messages</p>
                                {unreadCount > 0 && (
                                    <span className="bg-green-400 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">{unreadCount} new</span>
                                )}
                            </div>
                            <div className="flex flex-col gap-2">
                                {messagesData.map((m, i) => (
                                    <div key={`${m.name}-${i}`} className="flex items-center gap-2">
                                        <span
                                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                                            style={{ background: m.color }}
                                        >
                                            {m.initials}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-white text-xs font-semibold leading-tight truncate">{m.name}</p>
                                            <p className="text-indigo-300 text-[10px] truncate">{m.preview}</p>
                                        </div>
                                    </div>
                                ))}
                                {messagesData.length === 0 && (
                                    <p className="text-indigo-200/70 text-xs leading-tight">No messages yet</p>
                                )}
                            </div>
                        </div>
                    </div>



                    {/* ── Notifications ── */}
                    <div data-parent-guide="notifications" className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5 ${guideHighlight("notifications")}`}>
                        <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-bold text-slate-800 text-base">Notifications</h2>
                                <p className="text-xs text-slate-400 mt-0.5">{unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}</p>
                            </div>
                            {unreadCount > 0 && (
                                <button onClick={markAllRead}
                                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:min-h-0 sm:w-auto sm:py-1.5">
                                    <CheckCheck className="w-3.5 h-3.5" /> Mark all
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col gap-3 mt-4">
                            {notifs.map((notif) => {
                                const { id, icon: Icon, title, time, msg, unread, color, iconColor } = notif;
                                return (
                                    <div key={id} onClick={() => handleNotifClick(notif)}
                                        className={`relative flex gap-3 rounded-xl border p-4 transition-all cursor-pointer hover:shadow-md hover:brightness-95 ${color}`}>
                                        <div className={`w-9 h-9 rounded-xl ${iconColor} flex items-center justify-center shrink-0`}>
                                            <Icon className="w-[18px] h-[18px] text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="break-words text-sm font-bold text-slate-800">{title}</p>
                                            <p className="text-xs text-slate-400 mb-1">{time}</p>
                                            <p className="break-words text-xs leading-relaxed text-slate-600">{msg}</p>
                                        </div>
                                        {unread && <span className="w-2 h-2 bg-red-500 rounded-full absolute top-4 right-4" />}
                                    </div>
                                );
                            })}
                            {notifs.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-semibold text-slate-400">
                                    No notifications yet.
                                </div>
                            )}
                        </div>
                        <Link href={dashboardPath("parent", "/notifications")}
                            className="mt-4 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50">
                            View All Notifications <span className="text-base">→</span>
                        </Link>
                    </div>

                </main>
            </div>
            <ParentDashboardGuide onStepChange={handleGuideStepChange} />
        </div>
    );
}
