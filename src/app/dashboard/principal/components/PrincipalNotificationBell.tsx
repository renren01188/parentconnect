"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, FileText, Loader2, TicketCheck } from "lucide-react";
import { useNotifContext, type PrincipalNotification } from "../context/NotificationContext";

const PANEL_ITEM_LIMIT = 8;

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function NotificationIcon({ notification }: { notification: PrincipalNotification }) {
  if (notification.type === "guidance-escalated") {
    return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"><AlertTriangle className="h-4 w-4" /></span>;
  }
  if (notification.type === "guidance-ticket-accepted") {
    return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"><TicketCheck className="h-4 w-4" /></span>;
  }
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><FileText className="h-4 w-4" /></span>;
}

/**
 * The Provider owns the server-authorized notification feed. This component
 * only presents that shared feed, so it stays in sync across every Principal
 * route without manufacturing a separate local notification list.
 */
export default function PrincipalNotificationBell() {
  const router = useRouter();
  const {
    notifications,
    notificationsLoading,
    principalNotifCount,
    refreshNotifications,
    markNotificationsRead,
    markAllNotificationsRead,
  } = useNotifContext();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const latestNotifications = notifications.slice(0, PANEL_ITEM_LIMIT);
  const hasUnreadNotifications = principalNotifCount > 0;

  useEffect(() => {
    if (!open) return;

    const closeWhenOutside = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const openNotification = (notification: PrincipalNotification) => {
    if (notification.reportId) {
      void markNotificationsRead([notification]);
      setOpen(false);
      router.push(`/dashboard/principal/reports?reportId=${notification.reportId}`);
    }
  };

  return (
    <div ref={panelRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void refreshNotifications();
        }}
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
        aria-label={hasUnreadNotifications ? "Open notifications — unread notifications available" : "Open notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {hasUnreadNotifications && <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-400/20"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Notifications</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Latest updates</p>
            </div>
            <button
              type="button"
              onClick={() => { void markAllNotificationsRead(); }}
              disabled={!hasUnreadNotifications}
              className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-violet-700 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark All Read
            </button>
          </div>

          <div className="max-h-[min(65dvh,28rem)] overflow-y-auto overscroll-contain">
            {notificationsLoading && latestNotifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications...
              </div>
            ) : latestNotifications.length ? latestNotifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => openNotification(notification)}
                disabled={!notification.reportId}
                className={`flex w-full min-w-0 gap-3 border-b border-slate-100 px-4 py-3.5 text-left last:border-0 transition ${notification.read ? "bg-white" : "bg-violet-50/60"} ${notification.reportId ? "hover:bg-sky-50 focus:bg-sky-50 focus:outline-none" : "cursor-default"}`}
              >
                <NotificationIcon notification={notification} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-xs font-extrabold text-slate-800">{notification.title}</span>
                  <span className="mt-1 block break-words text-xs leading-relaxed text-slate-500">{notification.message}</span>
                  <span className="mt-1 block text-[10px] font-medium text-slate-400">{formatNotificationTime(notification.time)}</span>
                </span>
                {!notification.read && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
              </button>
            )) : (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                <FileText className="mx-auto mb-2 h-7 w-7 opacity-40" />
                No notifications yet.
              </div>
            )}
          </div>

          <Link
            href="/dashboard/principal/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-extrabold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400"
          >
            View all notifications
          </Link>
        </section>
      )}
    </div>
  );
}
