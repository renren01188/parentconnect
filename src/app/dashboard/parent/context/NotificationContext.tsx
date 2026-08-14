"use client";

// src/app/dashboard/parent/context/NotificationContext.tsx

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      refreshUnreadReportsCount().catch(() => null);
      refreshUnreadNotificationsCount().catch(() => null);
    }, 0);

    const client = supabaseBrowser;
    if (!client) {
      return () => window.clearTimeout(initialRefresh);
    }

    const channel = client
      .channel("parent-report-sidebar-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => {
        refreshUnreadReportsCount().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_report_messages" }, () => {
        refreshUnreadReportsCount().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_announcement_notifications" }, () => {
        refreshUnreadNotificationsCount().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () => {
        refreshUnreadNotificationsCount().catch(() => null);
      })
      .subscribe();

    return () => {
      window.clearTimeout(initialRefresh);
      client.removeChannel(channel);
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
