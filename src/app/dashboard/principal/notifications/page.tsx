"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck, FileText, TicketCheck } from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { mergeNotificationFeed } from "@/lib/notificationFeed";

type Notification = {
  id: string;
  type: string;
  category: "report";
  reportId?: number;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

export default function PrincipalNotificationsPage() {
  const { refreshCounts } = useNotifContext();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportUnreadCount, setReportUnreadCount] = useState(0);
  const fetchSequence = useRef(0);

  const loadNotifications = useCallback(async (): Promise<void> => {
    const requestId = ++fetchSequence.current;
    const response = await fetch("/api/principal/notifications", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (requestId !== fetchSequence.current || !response.ok || !data?.success) return;
    const rows = (data.notifications ?? []) as Notification[];
    // Keep a card visible while an older page-open request finishes after a
    // newer Realtime invalidation. The deterministic notification keys also
    // make duplicate broadcasts harmless.
    setItems((current) => mergeNotificationFeed(current, rows));
    setReportUnreadCount(Number(data.reportUnreadCount ?? 0));
  }, []);

  const markRowsRead = useCallback(async (rows: Notification[]) => {
    const keys = rows.filter((item) => !item.read).map((item) => item.id);
    if (!keys.length) return;

    // Viewing this page acknowledges notification cards only. A report remains
    // new in the Reports sidebar until the Principal opens that report.
    setItems((current) => current.map((item) => keys.includes(item.id) ? { ...item, read: true } : item));

    const response = await fetch("/api/principal/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true, notif_keys: keys }),
    });
    if (!response.ok) {
      await loadNotifications();
      return;
    }
    await refreshCounts();
  }, [loadNotifications, refreshCounts]);

  const markAll = useCallback(async () => {
    await markRowsRead(items);
  }, [items, markRowsRead]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadNotifications()
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  useVisibleRefresh(loadNotifications);
  useSessionInvalidation(({ scope }) => {
    if (!scope || scope === "reports" || scope === "notifications" || scope === "announcements") {
      return loadNotifications();
    }
  });

  return (
    <div className="min-h-full min-w-0 overflow-x-clip bg-slate-50 p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-800">Notifications</h1>
          <p className="mt-1 text-sm text-slate-400">New parent reports, Guidance ticket decisions, and escalated concerns.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">{reportUnreadCount} unread report{reportUnreadCount === 1 ? "" : "s"}</span>
          </div>
        </div>
        <button onClick={() => void markAll()} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-600">
          <CheckCheck className="h-4 w-4" /> Mark All Read
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-8 text-center text-slate-400">Loading notifications...</p> : items.length ? items.map((item) => {
          const isEscalation = item.type === "guidance-escalated";
          const isAcceptedTicket = item.type === "guidance-ticket-accepted";
          return (
            <div
              key={item.id}
              role={item.reportId ? "button" : undefined}
              tabIndex={item.reportId ? 0 : undefined}
              onClick={() => {
                if (!item.reportId) return;
                void markRowsRead([item]);
                router.push(`/dashboard/principal/reports?reportId=${item.reportId}`);
              }}
              onKeyDown={(event) => {
                if (!item.reportId || (event.key !== "Enter" && event.key !== " ")) return;
                event.preventDefault();
                void markRowsRead([item]);
                router.push(`/dashboard/principal/reports?reportId=${item.reportId}`);
              }}
              className={`flex min-w-0 gap-3 border-b border-slate-100 p-4 last:border-0 ${item.read ? "" : "bg-violet-50/60"} ${item.reportId ? "cursor-pointer transition hover:bg-sky-50" : ""}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isEscalation ? "bg-red-500 text-white" : "bg-sky-100 text-sky-700"}`}>
                {isEscalation ? <AlertTriangle className="h-4 w-4" /> : isAcceptedTicket ? <TicketCheck className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold text-slate-800">{item.title}</p>
                <p className="mt-1 break-words text-sm text-slate-500">{item.message}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(item.time).toLocaleString()}</p>
              </div>
              {!item.read && <span className="mt-2 h-2 w-2 rounded-full bg-violet-500" />}
            </div>
          );
        }) : <div className="p-10 text-center text-slate-400"><FileText className="mx-auto mb-3 h-8 w-8 opacity-40" />No notifications yet.</div>}
      </section>
    </div>
  );
}
