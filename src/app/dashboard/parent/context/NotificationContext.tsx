"use client";

// src/app/dashboard/parent/context/NotificationContext.tsx

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

// Reports and notifications are loaded from Supabase-backed API routes.
const INITIAL_UNREAD_REPORTS       = 0;
const INITIAL_UNREAD_NOTIFICATIONS = 0;

interface NotifContextType {
  // Notifications bell badge
  unreadCount: number;
  setUnreadCount: (n: number) => void;

  // Reports message thread badge
  unreadReportsCount: number;
  setUnreadReportsCount: (n: number) => void;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount:          INITIAL_UNREAD_NOTIFICATIONS,
  setUnreadCount:       () => {},
  unreadReportsCount:   INITIAL_UNREAD_REPORTS,
  setUnreadReportsCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount,        setUnreadCount]        = useState(INITIAL_UNREAD_NOTIFICATIONS);
  const [unreadReportsCount, setUnreadReportsCount] = useState(INITIAL_UNREAD_REPORTS);

  const refreshUnreadNotificationsCount = useCallback(async () => {
    const res = await fetch("/api/parents/notifications", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (typeof data?.unreadCount === "number") {
      setUnreadCount(data.unreadCount);
    }
  }, []);

  const refreshUnreadReportsCount = useCallback(async () => {
    const res = await fetch("/api/reports/parent-adviser", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const reports = Array.isArray(data?.reports) ? data.reports : [];
    setUnreadReportsCount(reports.filter((report: { unread?: boolean }) => Boolean(report.unread)).length);
  }, []);

  useVisibleRefresh(async () => {
    await Promise.all([
      refreshUnreadReportsCount(),
      refreshUnreadNotificationsCount(),
    ]);
  });

  useSessionInvalidation(async ({ scope }) => {
    if (scope === "reports") {
      await Promise.all([refreshUnreadReportsCount(), refreshUnreadNotificationsCount()]);
      return;
    }
    if (scope === "notifications" || scope === "announcements") {
      await refreshUnreadNotificationsCount();
      return;
    }
    await Promise.all([refreshUnreadReportsCount(), refreshUnreadNotificationsCount()]);
  });

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      refreshUnreadReportsCount().catch(() => null);
      refreshUnreadNotificationsCount().catch(() => null);
    }, 0);

    return () => {
      window.clearTimeout(initialRefresh);
    };
  }, [refreshUnreadReportsCount, refreshUnreadNotificationsCount]);

  return (
    <NotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
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
