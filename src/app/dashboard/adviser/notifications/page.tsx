"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Send, UserCheck, ChevronRight,
    Filter, CheckCheck, Wifi, AlertTriangle, CheckCircle,
    UserX, X, TriangleAlert, Megaphone, Eye, FileText, Bell, LoaderCircle, RefreshCw,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { type NotificationType } from "../data";

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
    announcementTitle?: string;
    senderName?: string;
    senderRole?: "Adviser" | "Guidance" | "Principal" | "ICT";
    createdAt?: string;
}



// ── Helpers ───────────────────────────────────────────────────────────────────
function getNotifStyle(type: NotificationType) {
    switch (type) {
        case "rfid": return { icon: Wifi, iconClass: "bg-emerald-500 text-white" };
        case "report": return { icon: FileText, iconClass: "bg-emerald-500 text-white" };
        case "absence": return { icon: UserX, iconClass: "bg-emerald-500 text-white" };
        case "excused": return { icon: CheckCircle, iconClass: "bg-sky-500 text-white" };
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[2px] sm:p-4" onClick={onClose}>
            <div className="flex w-full justify-center" onClick={e => e.stopPropagation()}>{children}</div>
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
            window.dispatchEvent(new Event("adviser-notifications-changed"));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to send announcement.");
        } finally {
            setSending(false);
        }
    }

    return (
        <ModalBackdrop onClose={onClose}>
            <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><Megaphone className="w-4 h-4 text-emerald-600" /></div>
                        <span className="text-base font-bold text-slate-800">{step === "sent" ? "Announcement Sent" : "Send Announcement"}</span>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="px-4 py-4 sm:px-6 sm:py-5">
                    {step === "compose" && (
                        <>
                            <p className="text-sm text-slate-500 mb-3">Write a message to send to all parents of your advisory class.</p>
                            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Reminder: Parent-teacher conference is on March 22 at 2:00 PM..." rows={5}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition resize-none placeholder:text-slate-400" />
                            <div className="flex items-center justify-between mt-1.5 mb-4">
                                <span className={`text-xs ${tooLong ? "text-red-500 font-semibold" : "text-slate-400"}`}>{text.length}/{CHAR_LIMIT} characters</span>
                                {tooLong && <span className="text-xs text-red-500 font-medium">Message too long</span>}
                            </div>
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                                <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors sm:w-auto sm:py-2">Cancel</button>
                                <button onClick={() => setStep("confirm")} disabled={isEmpty || tooLong}
                                    className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:py-2">
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
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                                <button onClick={() => setStep("compose")} disabled={sending} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 sm:w-auto sm:py-2">Edit Message</button>
                                <button onClick={sendAnnouncement} disabled={sending} className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:py-2">
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
    const createdAt = notif.createdAt ? new Date(notif.createdAt) : null;
    const dateTime = createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        })
        : notif.time;

    return (
        <ModalBackdrop onClose={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="adviser-announcement-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><Bell className="w-4 h-4 text-slate-600" /></div>
                        <div className="min-w-0">
                            {notif.senderRole && <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-600">{notif.senderRole}</p>}
                            <h2 id="adviser-announcement-title" className="break-words text-base font-bold text-slate-800">{notif.announcementTitle ?? notif.title}</h2>
                        </div>
                    </div>
                    <button type="button" aria-label="Close announcement" onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{notif.message}</p>
                    <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                        <div className="min-w-0">
                            <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Sender</dt>
                            <dd className="mt-1 break-words font-semibold text-slate-700">{notif.senderName ?? "School staff"}</dd>
                        </div>
                        <div>
                            <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Role</dt>
                            <dd className="mt-1 font-semibold text-slate-700">{notif.senderRole ?? "Adviser"}</dd>
                        </div>
                        <div className="min-w-0">
                            <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Date and time</dt>
                            <dd className="mt-1 break-words font-semibold text-slate-700">{dateTime}</dd>
                        </div>
                        <div>
                            <dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Status</dt>
                            <dd className="mt-1">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${notif.read ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{notif.read ? "Read" : "Unread"}</span>
                            </dd>
                        </div>
                    </dl>
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
    excused: "View excused students →",
    escalated: "View escalated report →",
    resolved: "View resolved report →",
    announcement: "View announcement",
};

function NotifRow({ n, onClick, busy }: { n: Notification; onClick: (n: Notification) => void; busy?: boolean }) {
    const { icon: Icon, iconClass } = getNotifStyle(n.type);
    const senderBadgeClass = n.senderRole === "Principal"
        ? "bg-purple-100 text-purple-600"
        : n.senderRole === "Guidance"
            ? "bg-sky-100 text-sky-600"
            : "bg-green-100 text-green-700";
    return (
        <div role="button" tabIndex={busy ? -1 : 0} aria-busy={busy} onClick={() => !busy && onClick(n)} onKeyDown={e => e.key === "Enter" && !busy && onClick(n)}
            className={`group flex items-start gap-3 px-4 py-3.5 border-b border-slate-50 transition-colors last:border-b-0 sm:gap-3.5 sm:px-5 ${busy ? "cursor-wait opacity-75" : "cursor-pointer"} ${n.read ? "bg-white hover:bg-slate-50" : "bg-emerald-50/60 hover:bg-emerald-50"}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconClass}`}>
                <Icon className="w-[17px] h-[17px]" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <span className="flex min-w-0 items-center gap-2 flex-wrap">
                        {n.type === "announcement" && n.senderRole && n.senderRole !== "Adviser" && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${senderBadgeClass}`}>{n.senderRole}</span>
                        )}
                        <span className="break-words text-sm font-semibold text-slate-800">
                            {n.title}
                        </span>
                    </span>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{n.time}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                    </div>
                </div>
                <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-500">
                    {n.message.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                        i % 2 === 1
                            ? <strong key={i} className="text-slate-700 font-bold">{part}</strong>
                            : part
                    )}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-emerald-500 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    {busy ? <><LoaderCircle className="w-3 h-3 animate-spin" /> {n.type === "announcement" ? "Opening announcement..." : "Marking as read..."}</> : <><Eye className="w-3 h-3" /> {NOTIF_HINT[n.type]}</>}
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
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<string>("all");
    const [filterRead, setFilterRead] = useState<string>("all");
    const [filterDate, setFilterDate] = useState<string>("all");
    const [showFilter, setShowFilter] = useState(false);
    const [isMarkingAll, setIsMarkingAll] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [markingId, setMarkingId] = useState<string | null>(null);
    const [openingAnnouncementId, setOpeningAnnouncementId] = useState<string | null>(null);
    const fetchSequence = useRef(0);

    const markNotificationsSeen = useCallback(async () => {
        const res = await fetch("/api/adviser/notifications/read", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mark_seen: true }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
            throw new Error(data?.message || "Unable to save notification view state.");
        }
        setNotifUnreadCount(0);
    }, [setNotifUnreadCount]);

    const fetchNotifications = useCallback(async ({ refresh = false }: { refresh?: boolean } = {}) => {
        const requestId = ++fetchSequence.current;
        if (refresh) setIsRefreshing(true);
        try {
            const res = await fetch("/api/adviser/notifications", { cache: "no-store" });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) {
                throw new Error(data?.message || "Unable to load notifications.");
            }
            if (requestId !== fetchSequence.current) return false;

            const uniqueNotifications = [...new Map(
                (Array.isArray(data.notifications) ? data.notifications : [])
                    .map((notification: Notification) => [notification.id, notification])
            ).values()] as Notification[];
            setNotifs(uniqueNotifications);
            setLoadError(null);
            setNotifUnreadCount(Number(data.sidebarUnreadCount ?? data.unreadCount ?? 0));
            return true;
        } catch (error) {
            if (requestId === fetchSequence.current) {
                setLoadError(error instanceof Error ? error.message : "Unable to load notifications.");
            }
            return false;
        } finally {
            if (requestId === fetchSequence.current) {
                setLoading(false);
                setIsRefreshing(false);
            }
        }
    }, [setNotifUnreadCount]);

    useEffect(() => {
        let active = true;
        async function openNotifications() {
            const loaded = await fetchNotifications();
            if (!active || !loaded) return;
            // This is a persisted page-view marker, not a read action. The
            // individual notification rows stay unread until the adviser
            // opens one or uses Mark All Read.
            await markNotificationsSeen().catch(() => null);
        }
        void openNotifications();

        // The layout owns the single real-time subscription. Batch the
        // resulting page refreshes so a publication can never render a
        // duplicate list while several source-table events arrive together.
        let reloadTimer: number | undefined;
        const reloadFromRealtime = () => {
            if (reloadTimer) window.clearTimeout(reloadTimer);
            reloadTimer = window.setTimeout(() => { void fetchNotifications({ refresh: true }); }, 120);
        };
        window.addEventListener("adviser-notifications-changed", reloadFromRealtime);
        return () => {
            active = false;
            if (reloadTimer) window.clearTimeout(reloadTimer);
            window.removeEventListener("adviser-notifications-changed", reloadFromRealtime);
        };
    }, [fetchNotifications, markNotificationsSeen]);
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
    const markAll = useCallback(async () => {
        if (isMarkingAll) return;
        const unreadKeys = [...new Set(notifications.filter(n => !n.read).map(n => n.id))];
        if (unreadKeys.length === 0) return;

        setIsMarkingAll(true);
        setNotifs(p => p.map(n => ({ ...n, read: true }))); // optimistic update
        setNotifUnreadCount(0);
        try {
            const res = await fetch("/api/adviser/notifications/read", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mark_all: true, notif_keys: unreadKeys }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) throw new Error("Failed to mark notifications as read.");
        } catch {
            void fetchNotifications();
        } finally {
            setIsMarkingAll(false);
        }
    }, [fetchNotifications, isMarkingAll, notifications, setNotifUnreadCount]);

    const markOne = useCallback(async (id: string) => {
        const notification = notifications.find(n => n.id === id);
        if (!notification || notification.read) return true;

        setMarkingId(id);
        setNotifs(p => p.map(n => n.id === id ? { ...n, read: true } : n)); // optimistic update
        try {
            const res = await fetch("/api/adviser/notifications/read", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notif_key: id }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.success) throw new Error("Failed to mark notification as read.");
            return true;
        } catch {
            void fetchNotifications();
            return false;
        } finally {
            setMarkingId(current => current === id ? null : current);
        }
    }, [fetchNotifications, notifications]);

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
        { label: "New Reports", icon: FileText, count: notifications.filter(n => ["report", "resolved"].includes(n.type)).length },
        { label: "Absence Alerts", icon: UserX, count: notifications.filter(n => n.type === "absence").length },
        { label: "Excused Alerts", icon: CheckCircle, count: notifications.filter(n => n.type === "excused").length },
        { label: "Announcements", icon: Bell, count: notifications.filter(n => n.type === "announcement").length },
    ];

    const handleNotifClick = useCallback(async (n: Notification) => {
        if (n.type === "announcement") {
            setOpeningAnnouncementId(n.id);
            const marked = await markOne(n.id);
            setViewNotif({ ...n, read: marked ? true : n.read });
            setOpeningAnnouncementId(null);
            return;
        }

        void markOne(n.id);
        switch (n.type) {
            case "rfid": router.push("/dashboard/adviser/students?status=Late&from=notification"); break;
            case "absence": router.push(`/dashboard/adviser/students?status=Absent&section=${encodeURIComponent(n.section ?? "")}&from=notification`); break;
            case "excused": router.push(`/dashboard/adviser/students?status=Excused&section=${encodeURIComponent(n.section ?? "")}&from=notification`); break;
            case "report": router.push(n.parentName ? `/dashboard/adviser/reports?parent=${encodeURIComponent(n.parentName)}` : "/dashboard/adviser/reports"); break;
            case "resolved": router.push(n.parentName ? `/dashboard/adviser/reports?parent=${encodeURIComponent(n.parentName)}&status=Resolved` : "/dashboard/adviser/reports?status=Resolved"); break;
        }
    }, [markOne, router]);

    return (
        <div className="flex min-h-full min-w-0 flex-col overflow-x-hidden bg-slate-50 p-4 sm:p-6">
            {showAnnouncement && <AnnouncementModal onClose={() => setShowAnnouncement(false)} />}

            {viewNotif && <AnnouncementViewModal notif={viewNotif} onClose={() => setViewNotif(null)} />}

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Notifications</h1>
                    <p className="text-slate-400 text-sm mt-0.5">Stay updated on attendance, reports, and school activities</p>
                </div>
                <button onClick={markAll} disabled={isMarkingAll || unread === 0}
                    className="flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                    <CheckCheck className="w-4 h-4" /> {isMarkingAll ? "Marking..." : "Mark All Read"}
                </button>
            </div>

            <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
                <div className="flex-1 min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-800">All Notifications</span>
                            {unread > 0 && <span className="bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full">{unread} unread</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                aria-label="Refresh notifications"
                                onClick={() => void fetchNotifications({ refresh: true })}
                                disabled={loading || isRefreshing}
                                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:cursor-wait disabled:opacity-60"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                            </button>
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
                                <div className="absolute right-0 top-9 z-50 flex w-56 max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
                                    <div>
                                        <p className="text-[10.5px] font-bold text-slate-400 uppercase tracking-widest mb-2">Type</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {["all", "rfid", "report", "absence", "excused", "announcement", "resolved"].map(t => (
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
                    </div>
                    <div className="max-h-none overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:max-h-[calc(100vh-210px)]">
                        {loading && (
                            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                                Loading notifications...
                            </div>
                        )}
                        {!loading && loadError && (
                            <div role="alert" className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                                <p className="text-sm font-semibold text-red-600">{loadError}</p>
                                <button
                                    type="button"
                                    onClick={() => { setLoading(true); void fetchNotifications(); }}
                                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                        {!loading && !loadError && filteredNotifications.length === 0 && (
                            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                                {notifications.length === 0 ? "No notifications yet." : "No notifications match your filters."}
                            </div>
                        )}
                        {!loadError && unreadNotifs.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">New</p>
                                {unreadNotifs.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} busy={markingId === n.id || openingAnnouncementId === n.id} />)}
                            </>
                        )}
                        {!loadError && today.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">Today</p>
                                {today.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} busy={markingId === n.id || openingAnnouncementId === n.id} />)}
                            </>
                        )}
                        {!loadError && yesterday.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">Yesterday</p>
                                {yesterday.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} busy={markingId === n.id || openingAnnouncementId === n.id} />)}
                            </>
                        )}
                        {!loadError && older.length > 0 && (
                            <>
                                <p className="px-5 pt-3 pb-1 text-[10.5px] font-bold text-slate-400 tracking-widest uppercase">Earlier</p>
                                {older.map(n => <NotifRow key={n.id} n={n} onClick={handleNotifClick} busy={markingId === n.id || openingAnnouncementId === n.id} />)}
                            </>
                        )}
                    </div>
                </div>

                <div className="grid w-full shrink-0 gap-4 sm:grid-cols-2 lg:w-[248px] lg:grid-cols-1">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                        <p className="text-sm font-bold text-slate-800 mb-3">Quick Actions</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => setShowAnnouncement(true)}
                                className="flex min-h-11 w-full items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-500 text-sm font-semibold text-white transition-colors hover:bg-emerald-600">
                                <span className="flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Send Announcement</span>
                                <ChevronRight className="w-4 h-4" />
                            </button>
                            <button onClick={() => router.push("/dashboard/adviser/attendance")}
                                className="flex min-h-11 w-full items-center justify-between px-3.5 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">
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
