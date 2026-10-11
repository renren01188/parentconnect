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
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

type GuidanceNotification = {
  id: string;
  type: "escalated" | "resolved" | "ticket";
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
type NotificationFilter = "all" | "unread" | "reports";

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
    case "ticket":
      return { icon: FileText, iconClass: "bg-sky-100 text-sky-700" };
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
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="break-words text-sm font-bold text-slate-800">{notification.title}</span>
          <span className="flex shrink-0 items-center gap-2 pt-0.5">
            <span className="whitespace-nowrap text-xs text-slate-400">{formatTime(notification.time)}</span>
            {!notification.read && <span className="h-2 w-2 rounded-full bg-sky-500" />}
          </span>
        </span>
        <span className="mt-0.5 block break-words text-xs leading-relaxed text-slate-500">{notification.message}</span>
        <span className="guidance-notification-view-link mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-sky-500 opacity-0 transition-opacity group-hover:opacity-100">
          <Eye className="h-3 w-3" />
          View report
        </span>
      </span>
    </button>
  );
}
export default function GuidanceNotificationsPage() {
  const router = useRouter();
  const { setNotifUnreadCount } = useNotifContext();
  const [notifications, setNotifications] = useState<GuidanceNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");

  const loadNotifications = useCallback(() => fetch("/api/guidance/notifications", { cache: "no-store" })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        setNotifications(
          ((data.notifications ?? []) as GuidanceNotificationResponseRow[]).map((n) => ({
            ...n,
            type: n.type === "ticket"
              ? "ticket"
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

  useVisibleRefresh(loadNotifications);
  useSessionInvalidation(({ scope }) => {
    if (!scope || scope === "reports" || scope === "notifications") return loadNotifications();
  });

  useEffect(() => {
    void loadNotifications();

  }, [loadNotifications]);

  const unread = notifications.filter((notification) => !notification.read).length;
  const filteredNotifications = notifications.filter((notification) => {
    if (activeFilter === "unread") return !notification.read;
    if (activeFilter === "reports") return notification.type === "escalated" || notification.type === "resolved" || notification.type === "ticket";
    return true;
  });
  const today = filteredNotifications.filter((notification) => notification.date === "today");
  const yesterday = filteredNotifications.filter((notification) => notification.date === "yesterday");
  const older = filteredNotifications.filter((notification) => notification.date === "older");

  const summary = useMemo(
    () => [
      {
        label: "Escalated Reports",
        icon: FileText,
        count: notifications.filter((n) => n.type === "escalated").length,
      },
      {
        label: "Guidance Tickets",
        icon: FileText,
        count: notifications.filter((n) => n.type === "ticket").length,
      },
      {
        label: "Unread",
        icon: Bell,
        count: unread,
      },
    ],
    [notifications, unread],
  );

  const markAll = useCallback(async () => {
    const unreadKeys = notifications.filter(n => !n.read).map(n => n.id);
    setNotifications(current => current.map(n => ({ ...n, read: true })));
    setNotifUnreadCount(0);
    if (unreadKeys.length === 0) return;
    await fetch("/api/guidance/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true, notif_keys: unreadKeys }),
    });
  }, [notifications, setNotifUnreadCount]);

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

  // Viewing this page acknowledges all notifications currently shown. Defer the
  // update until after paint so the effect remains a subscription boundary.
  useEffect(() => {
    if (loading || !notifications.some(n => !n.read)) return;
    const timer = window.setTimeout(() => { void markAll(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loading, markAll, notifications]);

  const handleNotifClick = useCallback(
    (notification: GuidanceNotification) => {
      markOne(notification.id);
      router.push(
        notification.parentName
          ? `/dashboard/guidance/reports?parent=${encodeURIComponent(notification.parentName)}`
          : "/dashboard/guidance/reports",
      );
    },
    [markOne, router],
  );

  return (
    <div className="guidance-notifications-page flex h-full flex-col overflow-auto bg-slate-50 p-6">
      <div className="guidance-notifications-header mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Notifications</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Track adviser-escalated reports that need guidance review
          </p>
        </div>
        <button
          onClick={markAll}
          className="guidance-mark-all flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-sky-400 hover:text-sky-600"
        >
          <CheckCheck className="h-4 w-4" />
          Mark All Read
        </button>
      </div>

      <div className="guidance-notifications-content flex items-start gap-5">
        <section className="guidance-notifications-list max-h-none flex-1 overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm md:max-h-[calc(100vh-210px)] md:overflow-y-auto">
          <div className="relative flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-800">All Notifications</span>
              {unread > 0 && (
                <span className="rounded-full bg-sky-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {unread} unread
                </span>
              )}
            </div>
            <button type="button" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </button>
            {filterOpen && (
              <div className="absolute right-5 top-[calc(100%-4px)] z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {([
                  ["all", "All notifications"],
                  ["unread", "Unread only"],
                  ["reports", "Reports and tickets"],
                ] as Array<[NotificationFilter, string]>).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => { setActiveFilter(value); setFilterOpen(false); }} className={`flex min-h-10 w-full items-center rounded-lg px-3 text-left text-xs font-semibold transition ${activeFilter === value ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
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
          {!loading && filteredNotifications.length === 0 && (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">
              No notifications match this filter.
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

        <aside className="guidance-notifications-sidebar flex w-[248px] shrink-0 flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-4 text-sm font-bold text-slate-800">Notification Summary</p>
            <div className="guidance-notification-summary flex flex-col gap-3">
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
            className="guidance-review-reports flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-sky-600"
          >
            <FileText className="h-4 w-4" />
            Review Reports
          </button>
        </aside>
      </div>

      <style jsx global>{`
        @media (max-width: 767px) {
          .guidance-notifications-page {
            min-height: calc(100dvh - 64px);
            padding: 16px;
          }

          .guidance-notifications-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            margin-bottom: 16px;
          }

          .guidance-notifications-header h1 {
            font-size: 22px;
          }

          .guidance-mark-all,
          .guidance-review-reports {
            min-height: 44px;
            width: 100%;
            justify-content: center;
          }

          .guidance-notifications-content {
            flex-direction: column;
            gap: 16px;
          }

          .guidance-notifications-list,
          .guidance-notifications-sidebar {
            width: 100%;
          }

          .guidance-notifications-sidebar {
            gap: 12px;
          }

          .guidance-notification-summary {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
          }

          .guidance-notification-summary > div {
            min-width: 0;
            flex-direction: column;
            align-items: flex-start;
            gap: 5px;
            padding: 10px;
            border-radius: 10px;
            background: #f8fafc;
          }

          .guidance-notification-summary > div > div {
            min-width: 0;
            align-items: flex-start;
            gap: 5px;
            font-size: 11px;
            line-height: 1.3;
          }

          .guidance-notification-summary > div > span {
            font-size: 18px;
          }

          .guidance-notifications-list > div:first-child {
            padding-left: 16px;
            padding-right: 16px;
          }

          .guidance-notifications-list > button {
            gap: 12px;
            padding: 14px 16px;
          }

          .guidance-notifications-list .whitespace-nowrap {
            font-size: 10px;
          }

          .guidance-notification-view-link {
            opacity: 1;
          }

        }

        @media (max-width: 359px) {
          .guidance-notification-summary {
            grid-template-columns: 1fr;
          }

          .guidance-notification-summary > div {
            flex-direction: row;
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
}
