"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Send, UserCheck, ChevronRight,
    Filter, CheckCheck, Wifi, AlertTriangle, CheckCircle,
    UserX, X, TriangleAlert, Megaphone, Eye, FileText, Bell,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { type NotificationType } from "../data";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

interface Notification {
    id: string;        // now a string like "rfid-1", "report-2-new"
    type: NotificationType;
    title: string;
    message: string;
    time: string;
    date: "today" | "yesterday" | "older";
    read: boolean;
    parentName?: string;
    section?: string;
}



// ── Helpers ───────────────────────────────────────────────────────────────────
function getNotifStyle(type: NotificationType) {
    switch (type) {
        case "rfid": return { icon: Wifi, iconClass: "bg-emerald-500 text-white" };
        case "report": return { icon: FileText, iconClass: "bg-emerald-500 text-white" };
        case "absence": return { icon: UserX, iconClass: "bg-emerald-500 text-white" };
        case "escalated": return { icon: AlertTriangle, iconClass: "bg-slate-100 text-slate-500" };
        case "resolved": return { icon: CheckCircle, iconClass: "bg-slate-100 text-slate-500" };
        case "announcement": return { icon: Bell, iconClass: "bg-slate-100 text-slate-500" };
    }
}

// ── Modal Backdrop ────────────────────────────────────────────────────────────
function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
            <div onClick={e => e.stopPropagation()}>{children}</div>
        </div>
    );
}

// ── Announcement Modal ────────────────────────────────────────────────────────
type AnnouncementStep = "compose" | "confirm" | "sent";

function AnnouncementModal({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState<AnnouncementStep>("compose");
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const [deliveredCount, setDeliveredCount] = useState(0);
    const CHAR_LIMIT = 500;
    const tooLong = text.length > CHAR_LIMIT;
    const isEmpty = text.trim().length === 0;

    async function sendAnnouncement() {
        setSending(true);
        setError("");
        try {
            const res = await fetch("/api/adviser/announcements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text.trim() }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) {
                throw new Error(data?.message || "Failed to send announcement.");
            }
            setDeliveredCount(Number(data.deliveredCount ?? 0));
            setStep("sent");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send announcement.");
        } finally {
            setSending(false);
        }
    }

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><Megaphone className="w-4 h-4 text-emerald-600" /></div>
                        <span className="text-base font-bold text-slate-800">{step === "sent" ? "Announcement Sent" : "Send Announcement"}</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-6 py-5">
                    {step === "compose" && (
                        <>
                            <p className="text-sm text-slate-500 mb-3">Write a message to send to all parents of your advisory class.</p>
                            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Reminder: Parent-teacher conference is on March 22 at 2:00 PM..." rows={5}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition resize-none placeholder:text-slate-400" />
                            <div className="flex items-center justify-between mt-1.5 mb-4">
                                <span className={`text-xs ${tooLong ? "text-red-500 font-semibold" : "text-slate-400"}`}>{text.length}/{CHAR_LIMIT} characters</span>
                                {tooLong && <span className="text-xs text-red-500 font-medium">Message too long</span>}
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                                <button onClick={() => setStep("confirm")} disabled={isEmpty || tooLong}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Send className="w-3.5 h-3.5" /> Review & Send
                                </button>
                            </div>
                        </>
                    )}
                    {step === "confirm" && (
                        <>
                            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                                <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 font-medium leading-relaxed">This announcement will be sent to <strong>all parents</strong> in your advisory class.</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-5">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Your message</p>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{text}</p>
                            </div>
                            {error && (
                                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
                                    <p className="text-xs font-semibold text-red-600">{error}</p>
                                </div>
                            )}
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => setStep("compose")} disabled={sending} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">Edit Message</button>
                                <button onClick={sendAnnouncement} disabled={sending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Send className="w-3.5 h-3.5" /> {sending ? "Sending..." : "Confirm & Send"}
                                </button>
                            </div>
                        </>
                    )}
                    {step === "sent" && (
                        <div className="flex flex-col items-center py-4 gap-3">
                            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle className="w-7 h-7 text-emerald-500" /></div>
                            <p className="text-base font-bold text-slate-800">Announcement Sent!</p>
                            <p className="text-sm text-slate-400 text-center">Your announcement has been delivered to {deliveredCount} parent{deliveredCount === 1 ? "" : "s"}.</p>
                            <button onClick={onClose} className="mt-2 px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors">Done</button>
                        </div>
                    )}
                </div>
            </div>
        </ModalBackdrop>
    );
}




// ── Announcement View Modal ───────────────────────────────────────────────────
function AnnouncementViewModal({ notif, onClose }: { notif: Notification; onClose: () => void }) {
    return (
        <ModalBackdrop onClose={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><Bell className="w-4 h-4 text-slate-600" /></div>
                        <span className="text-base font-bold text-slate-800">{notif.title}</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-6 py-5">
                    <p className="text-xs text-slate-400 mb-3">{notif.time}</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{notif.message}</p>
                    <div className="flex justify-end mt-6">
                        <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">Close</button>
                    </div>
                </div>
            </div>
        </ModalBackdrop>
    );
}

// ── Notification Row ──────────────────────────────────────────────────────────
const NOTIF_HINT: Record<NotificationType, string> = {
    rfid: "View late students →",
    report: "View parent report →",
    absence: "View absent students →",
    escalated: "View escalated report →",
    resolved: "View resolved report →",
    announcement: "View announcement",
};

function NotifRow({ n, onClick }: { n: Notification; onClick: (n: Notification) => void }) {
    const { icon: Icon, iconClass } = getNotifStyle(n.type);
    return (
        <div role="button" tabIndex={0} onClick={() => onClick(n)} onKeyDown={e => e.key === "Enter" && onClick(n)}
            className={`group flex items-start gap-3.5 px-5 py-3.5 border-b border-slate-50 cursor-pointer transition-colors last:border-b-0 ${n.read ? "bg-white hover:bg-slate-50" : "bg-emerald-50/60 hover:bg-emerald-50"}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconClass}`}>
                <Icon className="w-[17px] h-[17px]" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 flex-wrap">
                        {n.title.startsWith("[Guidance]") && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-600">Guidance</span>
                        )}
                        {n.title.startsWith("[Principal]") && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-600">Principal</span>
                        )}
                        {n.title.startsWith("[ICT]") && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">ICT</span>
                        )}
                        <span className="text-sm font-semibold text-slate-800">
                            {n.title.replace(/^\[(Guidance|Principal|ICT)\]\s*/, "")}
                        </span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{n.time}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                    </div>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {n.message.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                        i % 2 === 1
                            ? <strong key={i} className="text-slate-700 font-bold">{part}</strong>
                            : part
                    )}
                </p>
                <p className="text-[10.5px] text-emerald-500 font-medium mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {NOTIF_HINT[n.type]}
                </p>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
    const router = useRouter();
    const { setNotifUnreadCount } = useNotifContext();


    const [notifications, setNotifs] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<string>("all");
    const [filterRead, setFilterRead] = useState<string>("all");
    const [filterDate, setFilterDate] = useState<string>("all");
    const [showFilter, setShowFilter] = useState(false);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await fetch("/api/adviser/notifications", { cache: "no-store" });
            const data = await res.json();
            if (data.success) {
                setNotifs(data.notifications);
                setNotifUnreadCount(data.unreadCount);
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    }, [setNotifUnreadCount]);

    useEffect(() => {
        fetchNotifications();

        const client = supabaseBrowser;
        if (!client) return;

        const channel = client
            .channel("adviser-principal-announcements")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "principal_announcements" },
                () => { fetchNotifications(); }
            )
            .subscribe();

        return () => { client.removeChannel(channel); };
    }, []);
    const filterRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (showFilter && filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setShowFilter(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showFilter]);
    const [showAnnouncement, setShowAnnouncement] = useState(false);

    const [viewNotif, setViewNotif] = useState<Notification | null>(null);



    const unread = notifications.filter(n => !n.read).length;
    const markAll = async () => {
        const unreadKeys = notifications.filter(n => !n.read).map(n => n.id);
        setNotifs(p => p.map(n => ({ ...n, read: true }))); // optimistic update
        setNotifUnreadCount(0);
        if (unreadKeys.length === 0) return;
        await fetch("/api/adviser/notifications/read", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mark_all: true, notif_keys: unreadKeys }),
        });
    };
    const markOne = useCallback(async (id: string) => {
        setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n)); // optimistic update
        setNotifUnreadCount(Math.max(0, notifications.filter(n => !n.read).length - 1));
        await fetch("/api/adviser/notifications/read", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notif_key: id }),
        });
    }, [setNotifUnreadCount]);

    const filteredNotifications = notifications.filter(n => {
        if (filterType !== "all" && n.type !== filterType) return false;
        if (filterRead === "unread" && n.read) return false;
        if (filterRead === "read" && !n.read) return false;
        if (filterDate !== "all" && n.date !== filterDate) return false;
        return true;
    });

    const unreadNotifs = filteredNotifications.filter(n => !n.read);
    const readNotifs = filteredNotifications.filter(n => n.read);
    const today = readNotifs.filter(n => n.date === "today");
    const yesterday = readNotifs.filter(n => n.date === "yesterday");
    const older = readNotifs.filter(n => n.date === "older");

    const summary = [
        { label: "RFID Alerts", icon: Wifi, count: notifications.filter(n => n.type === "rfid").length },
        { label: "New Reports", icon: FileText, count: notifications.filter(n => ["report", "escalated", "resolved"].includes(n.type)).length },
        { label: "Absence Alerts", icon: UserX, count: notifications.filter(n => n.type === "absence").length },
        { label: "Announcements", icon: Bell, count: notifications.filter(n => n.type === "announcement").length },
    ];

    const handleNotifClick = useCallback((n: Notification) => {
        markOne(n.id);
        switch (n.type) {
            case "rfid": router.push("/dashboard/adviser/students?status=Late"); break;
            case "absence": router.push(`/dashboard/adviser/students?status=Absent&section=${encodeURIComponent(n.section ?? "")}`); break;
            case "report": router.push(n.parentName ? `/dashboard/adviser/reports?parent=${encodeURIComponent(n.parentName)}` : "/dashboard/adviser/reports"); break;
            case "escalated": router.push(n.parentName ? `/dashboard/adviser/reports?parent=${encodeURIComponent(n.parentName)}&status=Escalated` : "/dashboard/adviser/reports?status=Escalated"); break;
            case "resolved": router.push(n.parentName ? `/dashboard/adviser/reports?parent=${encodeURIComponent(n.parentName)}&status=Resolved` : "/dashboard/adviser/reports?status=Resolved"); break;
            case "announcement": setViewNotif(n); break;
        }
    }, [markOne, router]);

    return (
        <div className="flex flex-col h-full overflow-auto p-6 bg-slate-50">
            {showAnnouncement && <AnnouncementModal onClose={() => setShowAnnouncement(false)} />}

            {viewNotif && <AnnouncementViewModal notif={viewNotif} onClose={() => setViewNotif(null)} />}

            <div className="flex items-start justify-between mb-5">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Notifications</h1>
                    <p className="text-slate-400 text-sm mt-0.5">Stay updated on attendance, reports, and school activities</p>
                </div>
                <button onClick={markAll}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:border-emerald-400 hover:text-emerald-600 transition-colors shadow-sm">
                    <CheckCheck className="w-4 h-4" /> Mark All Read
                </button>
            </div>

            <div className="flex gap-5 items-start">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-800">All Notifications</span>
                            {unread > 0 && <span className="bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">{unread} unread</span>}
                        </div>
                        <div className="relative" ref={filterRef}>
                            <button
                                onClick={() => setShowFilter(p => !p)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-colors ${showFilter ? "border-emerald-400 text-emerald-600 bg-emerald-50" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                                <Filter className="w-3.5 h-3.5" /> Filter
                                {(filterType !== "all" || filterRead !== "all" || filterDate !== "all") && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                )}
                            </button>
                            {showFilter && (
                                <div className="absolute right-0 top-9 z-50 w-56 bg-white rounded-2xl border border-slate-200 shadow-lg p-4 flex flex-col gap-4">
                                    <div>
                                        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest mb-2">Type</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {["all", "rfid", "report", "absence", "announcement", "escalated", "resolved"].map(t => (
                                                <button key={t} onClick={() => setFilterType(t)}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-colors ${filterType === t ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                                    {t === "all" ? "All" : t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest mb-2">Status</p>
                                        <div className="flex gap-1.5">
                                            {["all", "unread", "read"].map(r => (
                                                <button key={r} onClick={() => setFilterRead(r)}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-colors ${filterRead === r ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                                    {r === "all" ? "All" : r}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest mb-2">Date</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {["all", "today", "yesterday", "older"].map(d => (
                                                <button key={d} onClick={() => setFilterDate(d)}
                                                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-colors ${filterDate === d ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                                                    {d === "all" ? "All" : d === "older" ? "Earlier" : d}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => { setFilterType("all"); setFilterRead("all"); setFilterDate("all"); }}
                                        className="text-[11px] text-slate-400 hover:text-red-400 font-semibold text-right transition-colors">
                                        Reset filters
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        {loading && (
                            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                                Loading notifications...
                            </div>
                        )}
                        {!loading && filteredNotifications.length === 0 && (
                            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                                {notifications.length === 0 ? "No notifications yet." : "No notifications match your filters."}
                            </div>
                        )}
                        {unreadNotifs.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">New</p>
                                {unreadNotifs.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} />)}
                            </>
                        )}
                        {today.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">Today</p>
                                {today.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} />)}
                            </>
                        )}
                        {yesterday.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">Yesterday</p>
                                {yesterday.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} />)}
                            </>
                        )}
                        {older.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">Earlier</p>
                                {older.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} />)}
                            </>
                        )}
                    </div>
                </div>

                <div className="w-[248px] flex-shrink-0 flex flex-col gap-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <p className="text-sm font-bold text-slate-800 mb-4">Notification Summary</p>
                        <div className="flex flex-col gap-3">
                            {summary.map(({ label, icon: Icon, count }) => (
                                <div key={label} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5 text-sm text-slate-600"><Icon className="w-4 h-4 text-slate-400" />{label}</div>
                                    <span className="text-sm font-extrabold text-slate-800">{count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <p className="text-sm font-bold text-slate-800 mb-3">Quick Actions</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => setShowAnnouncement(true)}
                                className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors">
                                <span className="flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Send Announcement</span>
                                <ChevronRight className="w-4 h-4" />
                            </button>
                            <button onClick={() => router.push("/dashboard/adviser/attendance")}
                                className="flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-medium transition-colors border border-slate-100">
                                <span className="flex items-center gap-2"><UserCheck className="w-3.5 h-3.5" /> Take Attendance</span>
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                            </button>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
