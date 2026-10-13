"use client";

// src/app/dashboard/parent/context/NotificationContext.tsx

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

// Reports and notifications are loaded from Supabase-backed API routes.
const INITIAL_UNREAD_REPORTS       = 0;
const INITIAL_UNREAD_NOTIFICATIONS = 0;

interface NotifContextType {
  // Notifications bell badge
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  /** Increments after the authorized notification feed should refresh in place. */
  notificationRefreshVersion: number;

  // Reports message thread badge
  unreadReportsCount: number;
  setUnreadReportsCount: (n: number) => void;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount:          INITIAL_UNREAD_NOTIFICATIONS,
  setUnreadCount:       () => {},
  notificationRefreshVersion: 0,
  unreadReportsCount:   INITIAL_UNREAD_REPORTS,
  setUnreadReportsCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount,        setUnreadCount]        = useState(INITIAL_UNREAD_NOTIFICATIONS);
  const [unreadReportsCount, setUnreadReportsCount] = useState(INITIAL_UNREAD_REPORTS);
  const [notificationRefreshVersion, setNotificationRefreshVersion] = useState(0);
  const notificationCountRequest = useRef<Promise<void> | null>(null);
  const reportCountRequest = useRef<Promise<void> | null>(null);

  const refreshUnreadNotificationsCount = useCallback(async () => {
    if (notificationCountRequest.current) return notificationCountRequest.current;
    const request = (async () => {
      const res = await fetch("/api/parents/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (typeof data?.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    })();
    notificationCountRequest.current = request;
    try {
      await request;
    } finally {
      if (notificationCountRequest.current === request) notificationCountRequest.current = null;
    }
  }, []);

  const refreshUnreadReportsCount = useCallback(async () => {
    if (reportCountRequest.current) return reportCountRequest.current;
    const request = (async () => {
      const [reportsRes, staffMessagesRes] = await Promise.all([
        fetch("/api/reports/parent-adviser?summary=1", { cache: "no-store" }),
        fetch("/api/reports/staff-messages?role=parent", { cache: "no-store" }),
      ]);
      const [reportsData, staffMessagesData] = await Promise.all([
        reportsRes.json().catch(() => null),
        staffMessagesRes.json().catch(() => null),
      ]);
      const reports = reportsRes.ok && Array.isArray(reportsData?.reports) ? reportsData.reports : [];
      const staffMessages = staffMessagesRes.ok && Array.isArray(staffMessagesData?.messages)
        ? staffMessagesData.messages
        : [];
      const unreadReports = reports.filter((report: { unread?: boolean }) => Boolean(report.unread)).length;
      const unreadStaffConversations = staffMessages.filter((message: { unread?: boolean }) => Boolean(message.unread)).length;
      setUnreadReportsCount(unreadReports + unreadStaffConversations);
    })();
    reportCountRequest.current = request;
    try {
      await request;
    } finally {
      if (reportCountRequest.current === request) reportCountRequest.current = null;
    }
  }, []);

  const refreshNotificationFeed = useCallback(async () => {
    await refreshUnreadNotificationsCount();
    // Notification screens read their data through their own server-authorized
    // API snapshot; a lightweight version avoids page-level Realtime channels.
    setNotificationRefreshVersion((version) => version + 1);
  }, [refreshUnreadNotificationsCount]);

  useVisibleRefresh(async () => {
    await Promise.all([
      refreshUnreadReportsCount(),
      refreshNotificationFeed(),
    ]);
  });

  useSessionInvalidation(async ({ scope }) => {
    if (scope === "reports") {
      await Promise.all([refreshUnreadReportsCount(), refreshNotificationFeed()]);
      return;
    }
    if (scope === "notifications" || scope === "announcements" || scope === "staff-messages") {
      await Promise.all([refreshUnreadReportsCount(), refreshNotificationFeed()]);
      return;
    }
    // `null` is the reconnect recovery signal. Do not turn unrelated student,
    // attendance, or profile events into three extra sidebar requests.
    if (!scope) await Promise.all([refreshUnreadReportsCount(), refreshNotificationFeed()]);
  });

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      refreshUnreadReportsCount().catch(() => null);
      refreshNotificationFeed().catch(() => null);
    }, 0);

    return () => {
      window.clearTimeout(initialRefresh);
    };
  }, [refreshUnreadReportsCount, refreshNotificationFeed]);

  return (
    <NotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
      notificationRefreshVersion,
      unreadReportsCount,
      setUnreadReportsCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}
