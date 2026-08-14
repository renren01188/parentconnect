"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle,
  Eye,
  FileText,
  Filter,
  Monitor,
  Shield,
  X,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type GuidanceNotification = {
  id: string;
  type: "escalated" | "resolved" | "principal" | "ict";
  title: string;
  message: string;
  time: string;
  date: "today" | "yesterday" | "older";
  read: boolean;
  parentName?: string;
};

type GuidanceNotificationResponseRow = Omit<GuidanceNotification, "type" | "date"> & {
  type: string;
};

function getDateBucket(time: string): "today" | "yesterday" | "older" {
  const now = new Date();
  const date = new Date(time);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "older";
}

function getNotifStyle(type: GuidanceNotification["type"]) {
  switch (type) {
    case "escalated":
      return { icon: AlertTriangle, iconClass: "bg-red-500 text-white" };
    case "resolved":
      return { icon: CheckCircle, iconClass: "bg-emerald-100 text-emerald-700" };
    case "principal":
      return { icon: Shield, iconClass: "bg-sky-100 text-sky-700" };
    case "ict":
      return { icon: Shield, iconClass: "bg-green-100 text-green-700" };
  }
}
function formatTime(time: string): string {
  const date = new Date(time);
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function NotifRow({
  notification,
  onClick,
}: {
  notification: GuidanceNotification;
  onClick: (notification: GuidanceNotification) => void;
}) {
  const { icon: Icon, iconClass } = getNotifStyle(notification.type);

  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={`group flex w-full items-start gap-3.5 border-b border-slate-50 px-5 py-3.5 text-left transition-colors last:border-b-0 ${notification.read ? "bg-white hover:bg-slate-50" : "bg-sky-50/70 hover:bg-sky-50"
        }`}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 flex-wrap">
            {notification.title.startsWith("[ICT]") && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">ICT</span>
            )}
            <span className="text-sm font-bold text-slate-800">
              {notification.title.replace(/^\[ICT\]\s*/, "")}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs text-slate-400">{formatTime(notification.time)}</span>
            {!notification.read && <span className="h-2 w-2 rounded-full bg-sky-500" />}
          </span>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{notification.message}</span>
        <span className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-sky-500 opacity-0 transition-opacity group-hover:opacity-100">
          <Eye className="h-3 w-3" />
          {notification.type === "escalated" || notification.type === "resolved" ? "View report" : "View full announcement"}
        </span>
      </span>
    </button>
  );
}
function AnnouncementViewModal({ notif, onClose }: { notif: GuidanceNotification; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Monitor className="w-4 h-4 text-green-700" />
            </div>
            <span className="text-base font-bold text-slate-800">
              {notif.title.replace(/^\[(ICT|Principal)\]\s*/, "")}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-slate-400 mb-3">{formatTime(notif.time)}</p>
          <p className="text-sm text-slate-700 leading-relaxed">{notif.message}</p>
          <div className="flex justify-end mt-6">
            <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function GuidanceNotificationsPage() {
  const router = useRouter();
  const { setNotifUnreadCount } = useNotifContext();
  const [notifications, setNotifications] = useState<GuidanceNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewNotif, setViewNotif] = useState<GuidanceNotification | null>(null);

  const loadNotifications = useCallback(() => fetch("/api/guidance/notifications", { cache: "no-store" })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        setNotifications(
          ((data.notifications ?? []) as GuidanceNotificationResponseRow[]).map((n) => ({
            ...n,
            type: n.type === "principal-announcement"
              ? "principal"
              : n.type === "ict-announcement"
                ? "ict"
                : n.type === "resolved"
                  ? "resolved"
                  : "escalated",
            date: getDateBucket(n.time),
          }))
        );
        setNotifUnreadCount(data.unreadCount ?? 0);
      }
    })
    .finally(() => setLoading(false)), [setNotifUnreadCount]);

  useEffect(() => {
    void loadNotifications();

    const client = supabaseBrowser;
    if (!client) return;
    const channel = client
      .channel("guidance-notification-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => void loadNotifications())
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_announcements" }, () => void loadNotifications())
      .on("postgres_changes", { event: "*", schema: "public", table: "ict_announcements" }, () => void loadNotifications())
      .on("postgres_changes", { event: "*", schema: "public", table: "guidance_notification_reads" }, () => void loadNotifications())
      .subscribe();

    return () => { void client.removeChannel(channel); };
  }, [loadNotifications]);

  const unread = notifications.filter((notification) => !notification.read).length;
  const today = notifications.filter((notification) => notification.date === "today");
  const yesterday = notifications.filter((notification) => notification.date === "yesterday");
  const older = notifications.filter((notification) => notification.date === "older");

  const summary = useMemo(
    () => [
      {
        label: "Escalated Reports",
        icon: FileText,
        count: notifications.filter((n) => n.type === "escalated").length,
      },
      {
        label: "Principal Announcements",
        icon: Shield,
        count: notifications.filter((n) => n.type === "principal").length,
      },
      {
        label: "Unread",
        icon: Bell,
        count: unread,
      },
    ],
    [notifications, unread],
  );

  const markAll = async () => {
    const unreadKeys = notifications.filter(n => !n.read).map(n => n.id);
    setNotifications(current => current.map(n => ({ ...n, read: true })));
    setNotifUnreadCount(0);
    if (unreadKeys.length === 0) return;
    await fetch("/api/guidance/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true, notif_keys: unreadKeys }),
    });
  };

  const markOne = useCallback(async (id: string) => {
    setNotifications(current =>
      current.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setNotifUnreadCount(Math.max(0, notifications.filter(n => !n.read).length - 1));
    await fetch("/api/guidance/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notif_key: id }),
    });
  }, [notifications, setNotifUnreadCount]);

  // Viewing this page acknowledges all notifications currently shown.
  useEffect(() => { if (!loading && notifications.some(n => !n.read)) void markAll(); }, [loading, notifications]);

  const handleNotifClick = useCallback(
    (notification: GuidanceNotification) => {
      markOne(notification.id);
      if (notification.type === "principal" || notification.type === "ict") {
        setViewNotif(notification);
        return;
      }
      router.push(
        notification.parentName
          ? `/dashboard/guidance/reports?parent=${encodeURIComponent(notification.parentName)}`
          : "/dashboard/guidance/reports",
      );
    },
    [markOne, router],
  );

  return (
    <div className="flex h-full flex-col overflow-auto bg-slate-50 p-6">
      {viewNotif && <AnnouncementViewModal notif={viewNotif} onClose={() => setViewNotif(null)} />}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Notifications</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Track adviser-escalated reports that need guidance review
          </p>
        </div>
        <button
          onClick={markAll}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-sky-400 hover:text-sky-600"
        >
          <CheckCheck className="h-4 w-4" />
          Mark All Read
        </button>
      </div>

      <div className="flex items-start gap-5">
        <section className="max-h-[calc(100vh-210px)] flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-800">All Notifications</span>
              {unread > 0 && (
                <span className="rounded-full bg-sky-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {unread} unread
                </span>
              )}
            </div>
            <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </button>
          </div>

          {today.length > 0 && (
            <>
              <p className="px-5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Today</p>
              {today.map((notification) => (
                <NotifRow key={notification.id} notification={notification} onClick={handleNotifClick} />
              ))}
            </>
          )}

          {yesterday.length > 0 && (
            <>
              <p className="px-5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-widest text-slate-400">
                Yesterday
              </p>
              {yesterday.map((notification) => (
                <NotifRow key={notification.id} notification={notification} onClick={handleNotifClick} />
              ))}
            </>
          )}

          {loading && (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              Loading notifications...
            </div>
          )}
          {!loading && notifications.length === 0 && (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              No notifications yet.
            </div>
          )}
          {older.length > 0 && (
            <>
              <p className="px-5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Earlier</p>
              {older.map((notification) => (
                <NotifRow key={notification.id} notification={notification} onClick={handleNotifClick} />
              ))}
            </>
          )}
        </section>

        <aside className="flex w-[248px] shrink-0 flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-bold text-slate-800">Notification Summary</p>
            <div className="flex flex-col gap-3">
              {summary.map(({ label, icon: Icon, count }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Icon className="h-4 w-4 text-slate-400" />
                    {label}
                  </div>
                  <span className="text-sm font-extrabold text-slate-800">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => router.push("/dashboard/guidance/reports")}
            className="flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-sky-600"
          >
            <FileText className="h-4 w-4" />
            Review Reports
          </button>
        </aside>
      </div>
    </div>
  );
}
