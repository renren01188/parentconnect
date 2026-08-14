"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CheckCheck,
  MessageSquare,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import { useNotifContext } from "../context/NotificationContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  type FilterTab,
  type Notification,
  type NotifType,
} from "../data";

type PageNotification = Notification & {
  source?: "database" | "mock";
  announcementId?: number;
  reportId?: number;
  createdAt?: string;
};

const TYPE_CONFIG: Record<
  NotifType,
  {
    Icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    borderColor: string;
    categoryIcon: React.ElementType;
  }
> = {
  alert: {
    Icon: AlertCircle,
    iconBg: "#fee2e2",
    iconColor: "#ef4444",
    borderColor: "#ef4444",
    categoryIcon: Bell,
  },
  message: {
    Icon: MessageSquare,
    iconBg: "#dbeafe",
    iconColor: "#3b82f6",
    borderColor: "#3b82f6",
    categoryIcon: Bell,
  },
  event: {
    Icon: CalendarCheck,
    iconBg: "#fef9c3",
    iconColor: "#f59e0b",
    borderColor: "#f59e0b",
    categoryIcon: CalendarCheck,
  },
};

export default function NotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUnreadCount } = useNotifContext();

  const [notifications, setNotifications] = useState<PageNotification[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  const loadNotifications = useCallback(async () => {
    const res = await fetch("/api/parents/notifications", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !Array.isArray(data.notifications)) return;

    setNotifications(
      data.notifications.map((notif: Notification) => ({
        ...notif,
        source: "database" as const,
      }))
    );
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      loadNotifications().catch(() => null);
    }, 0);

    const client = supabaseBrowser;
    if (!client) {
      return () => window.clearTimeout(initialLoad);
    }

    const channel = client
      .channel("parent-announcement-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parent_announcement_notifications" },
        () => {
          loadNotifications().catch(() => null);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        () => { loadNotifications().catch(() => null); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parent_adviser_reports" },
        () => { loadNotifications().catch(() => null); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parent_adviser_report_messages" },
        () => { loadNotifications().catch(() => null); }
      )
      .subscribe();

    return () => {
      window.clearTimeout(initialLoad);
      client.removeChannel(channel);
    };
  }, [loadNotifications]);

  useEffect(() => {
    setUnreadCount(notifications.filter((notif) => notif.unread).length);
  }, [notifications, setUnreadCount]);

  const linkedEventId = useMemo(() => {
    const eventParam = searchParams.get("event");
    if (!eventParam) return null;

    return notifications.find((notif) => notif.eventId === eventParam)?.id ?? null;
  }, [notifications, searchParams]);

  const unreadCount = notifications.filter((notif) => notif.unread).length;

  const tabCounts: Record<FilterTab, number> = {
    All: notifications.filter((notif) => notif.unread).length,
    Unread: notifications.filter((notif) => notif.unread).length,
    Principal: notifications.filter((notif) =>
      notif.tab.includes("Principal") && notif.unread
    ).length,
    Teacher: notifications.filter((notif) =>
      notif.tab.includes("Teacher") && notif.unread
    ).length,
    Guidance: notifications.filter((notif) =>
      notif.tab.includes("Guidance") && notif.unread
    ).length,
    Attendance: notifications.filter((notif) =>
      notif.tab.includes("Attendance") && notif.unread
    ).length,
  };

  const filteredNotifications = notifications.filter((notif) =>
    activeTab === "All" ? true : notif.tab.includes(activeTab)
  );

  async function markAllRead() {
    setNotifications((prev) => prev.map((notif) => ({ ...notif, unread: false })));
    await fetch("/api/parents/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attendanceLogIds: notifications.filter((notif) => notif.id < 0).map((notif) => -notif.id),
        reportIds: notifications.flatMap((notif) => notif.reportId ? [notif.reportId] : []),
        notificationIds: notifications
          .filter((notif) => notif.source === "database" && !notif.reportId && notif.id > 0)
          .map((notif) => notif.id),
      }),
    }).catch(() => null);
  }

  // Clear the sidebar badge once the Notifications page is opened.
  useEffect(() => { if (notifications.some((notif) => notif.unread)) void markAllRead(); }, [notifications]);

  function handleClick(notif: PageNotification) {
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notif.id ? { ...item, unread: false } : item
      )
    );

    if (notif.source === "database") {
      fetch("/api/parents/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          notif.id < 0
            ? { attendanceLogId: -notif.id }
            : notif.reportId
              ? { reportId: notif.reportId }
              : { notificationId: notif.id }
        ),
      }).catch(() => null);
    }

    if (notif.type === "alert" && notif.studentName) {
      router.push(
        `/dashboard/parent/attendance?student=${encodeURIComponent(
          notif.studentName
        )}`
      );
      return;
    }

    if (notif.announcementId) {
      return;
    }

    if (notif.type === "message" && notif.teacherName) {
      router.push(
        `/dashboard/parent/reports?teacher=${encodeURIComponent(
          notif.teacherName
        )}`
      );
      return;
    }

    if (notif.type === "event") {
      setExpandedEventId((prev) => (prev === notif.id ? null : notif.id));
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 font-sans">
      <Sidebar />

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-6 md:px-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Stay updated with your child&apos;s school activities
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          )}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {(["All", "Unread", "Principal", "Teacher", "Guidance", "Attendance"] as FilterTab[]).map(
            (tab) => {
              const isActive = activeTab === tab;
              const count = tabCounts[tab];

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${isActive
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                >
                  {tab}
                  {count > 0 && (
                    <span
                      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold ${isActive
                          ? "bg-white/25 text-white"
                          : "bg-red-500 text-white"
                        }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            }
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          <div className="flex flex-col gap-3">
          {filteredNotifications.map((notif) => {
            const {
              Icon,
              iconBg,
              iconColor,
              borderColor,
              categoryIcon: CategoryIcon,
            } = TYPE_CONFIG[notif.type];
            const isHighlighted =
              expandedEventId === notif.id || linkedEventId === notif.id;

            return (
              <button
                key={notif.id}
                type="button"
                onClick={() => handleClick(notif)}
                className="relative flex w-full items-start gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-shadow hover:shadow-md"
                style={{
                  borderLeft: `4px solid ${borderColor}`,
                  boxShadow: isHighlighted
                    ? `0 0 0 2px ${borderColor}40`
                    : undefined,
                }}
              >
                <div
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
                  style={{ background: iconBg }}
                >
                  {notif.profilePicture ? <img src={notif.profilePicture} alt="ICT profile" className="h-full w-full object-cover" /> : <Icon className="h-5 w-5" style={{ color: iconColor }} />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-sm font-bold text-slate-900">
                    {notif.title}
                  </p>
                  <p className="mb-2 text-sm text-slate-600">{notif.msg}</p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Bell className="h-3 w-3" />
                      {notif.time}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CategoryIcon className="h-3 w-3" />
                      {notif.category}
                    </span>
                  </div>

                  {isHighlighted && notif.type === "event" && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
                      <span className="font-bold">Event Details:</span>{" "}
                      {notif.msg}. Check with your class adviser for more
                      information.
                    </div>
                  )}
                </div>

                {notif.unread && (
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                )}
              </button>
            );
          })}

          {filteredNotifications.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-400">
              No notifications found for this filter.
            </div>
          )}
          </div>
        </div>
      </main>
    </div>
  );
}
