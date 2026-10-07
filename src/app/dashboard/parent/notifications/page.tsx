"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bell,
  CalendarCheck,
  CheckCheck,
  MessageSquare,
  X,
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
  announcementTitle?: string;
  notificationIds?: number[];
  senderName?: string;
  senderRole?: "Principal" | "Adviser" | "Guidance" | "ICT";
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

function announcementDateLabel(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function NotificationsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUnreadCount } = useNotifContext();

  const [notifications, setNotifications] = useState<PageNotification[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<PageNotification | null>(null);

  const loadNotifications = useCallback(async () => {
    const res = await fetch("/api/parents/notifications", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success || !Array.isArray(data.notifications)) return;

    const unique = new Map<string, PageNotification>();
    for (const notif of data.notifications as PageNotification[]) {
      const key = notif.announcementId
        ? "announcement:" + (notif.senderRole ?? notif.category) + ":" + notif.announcementId
        : "notification:" + notif.id;
      if (!unique.has(key)) {
        unique.set(key, { ...notif, source: "database" as const });
      }
    }
    setNotifications([...unique.values()]);
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

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((notif) => ({ ...notif, unread: false })));
    await fetch("/api/parents/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attendanceLogIds: notifications.filter((notif) => notif.id < 0).map((notif) => -notif.id),
        reportIds: notifications.flatMap((notif) => notif.reportId ? [notif.reportId] : []),
        notificationIds: notifications
          .filter((notif) => notif.source === "database" && !notif.reportId && notif.id > 0)
          .flatMap((notif) => notif.notificationIds ?? [notif.id]),
      }),
    }).catch(() => null);
  }, [notifications]);

  // Clear the sidebar badge once the Notifications page is opened.
  useEffect(() => {
    if (!notifications.some((notif) => notif.unread)) return;
    const timer = window.setTimeout(() => { void markAllRead(); }, 0);
    return () => window.clearTimeout(timer);
  }, [notifications, markAllRead]);

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
          notif.reportId
            ? { reportId: notif.reportId }
            : notif.announcementId
              ? { notificationIds: notif.notificationIds ?? [notif.id] }
              : notif.id < 0
                ? { attendanceLogId: -notif.id }
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
      setSelectedAnnouncement({ ...notif, unread: false });
      return;
    }

    if (notif.reportId) {
      router.push(`/dashboard/parent/reports?reportId=${notif.reportId}`);
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
    <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-100 font-sans md:h-screen md:flex-row md:overflow-hidden">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col px-3 py-5 pb-8 sm:px-4 md:min-h-0 md:overflow-hidden md:px-8 md:py-6">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
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
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all as read
            </button>
          )}
        </div>

        <div
          aria-label="Notification filters"
          className="mb-5 flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-1"
          style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}
        >
          {(["All", "Unread", "Principal", "Teacher", "Guidance", "Attendance"] as FilterTab[]).map(
            (tab) => {
              const isActive = activeTab === tab;
              const count = tabCounts[tab];

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${isActive
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

        <div className="min-h-0 flex-1 overflow-y-auto sm:pr-2">
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
                className="relative flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:px-5"
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
                  <Icon className="h-5 w-5" style={{ color: iconColor }} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 break-words text-sm font-bold text-slate-900">
                    {notif.title}
                  </p>
                  <p className="mb-2 break-words text-sm text-slate-600">{notif.msg}</p>

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

      {selectedAnnouncement?.announcementId ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="announcement-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedAnnouncement(null);
          }}
        >
          <div
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-600">
                  {selectedAnnouncement.senderRole || selectedAnnouncement.category}
                </p>
                <h2 id="announcement-modal-title" className="break-words text-lg font-extrabold text-slate-900">
                  {selectedAnnouncement.announcementTitle || "Announcement"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close announcement"
                onClick={() => setSelectedAnnouncement(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5 sm:px-6">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {selectedAnnouncement.msg}
              </p>

              <dl className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sender</dt>
                  <dd className="mt-1 break-words font-semibold text-slate-700">
                    {selectedAnnouncement.senderName || selectedAnnouncement.teacherName || "School staff"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Role</dt>
                  <dd className="mt-1 font-semibold text-slate-700">
                    {selectedAnnouncement.senderRole || selectedAnnouncement.category}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Date and time</dt>
                  <dd className="mt-1 break-words font-semibold text-slate-700">
                    {announcementDateLabel(selectedAnnouncement.createdAt)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</dt>
                  <dd>
                    <span className={"mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold " + (selectedAnnouncement.unread
                      ? "bg-blue-100 text-blue-700"
                      : "bg-emerald-100 text-emerald-700")}>
                      {selectedAnnouncement.unread ? "Unread" : "Read"}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function NotificationsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><NotificationsPageContent /></Suspense>;
}
