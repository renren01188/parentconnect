"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type GuidanceNotifContextType = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  escalatedCount: number;
  setEscalatedCount: (count: number) => void;
  notifUnreadCount: number;
  setNotifUnreadCount: (count: number) => void;
  principalAnnouncementUnreadCount: number;
  refreshPrincipalAnnouncementCount: () => Promise<void>;
  markPrincipalAnnouncementRead: (id: number) => void;
  ictUnreadCount: number;
  setIctUnreadCount: (count: number) => void;
};

const GuidanceNotifContext = createContext<GuidanceNotifContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
  escalatedCount: 0,
  setEscalatedCount: () => {},
  notifUnreadCount: 0,
  setNotifUnreadCount: () => {},
  principalAnnouncementUnreadCount: 0,
  refreshPrincipalAnnouncementCount: async () => {},
  markPrincipalAnnouncementRead: () => {},
  ictUnreadCount: 0,
  setIctUnreadCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [ictUnreadCount, setIctUnreadCount] = useState(0);
  const [principalAnnouncementUnreadCount, setPrincipalAnnouncementUnreadCount] = useState(0);

  const refreshGuidanceCounts = useCallback(async () => {
    try {
      const [reportsRes, staffRes] = await Promise.all([
        fetch("/api/reports/parent-adviser?role=guidance", { cache: "no-store" }),
        fetch("/api/reports/staff-messages?role=guidance", { cache: "no-store" }),
      ]);
      const [reportsData, staffData] = await Promise.all([
        reportsRes.json().catch(() => null),
        staffRes.json().catch(() => null),
      ]);

      const allReports = (reportsData?.reports ?? []) as Array<{ hasUnreadForGuidance?: boolean; status?: string }>;
      const reportCount = reportsRes.ok
        ? allReports.filter(r => r.hasUnreadForGuidance).length
        : 0;
      const staffCount = staffRes.ok
        ? ((staffData?.messages ?? []) as Array<{ status?: string }>).filter(m => m.status === "New").length
        : 0;
      const nextCount = reportCount + staffCount;
      setUnreadCount(nextCount);
      // notifUnreadCount is intentionally NOT set here — the Notifications
      // nav item tracks its own separate source, not parent-adviser replies.
      // Track escalated reports separately for the sidebar panel
      const nextEscalatedCount = reportsRes.ok
        ? allReports.filter(r => r.status === "Escalated").length
        : 0;
      setEscalatedCount(nextEscalatedCount);
    } catch {
      setUnreadCount(0);
      setEscalatedCount(0);
    }
  }, []);

  const loadIctCount = useCallback(async () => {
    try {
      const res = await fetch("/api/guidance-ict/messages", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setIctUnreadCount(res.ok ? Number(data?.unreadCount ?? 0) : 0);
    } catch {
      setIctUnreadCount(0);
    }
  }, []);

  const refreshPrincipalAnnouncementCount = useCallback(async () => {
    try {
      const res = await fetch("/api/guidance/notifications", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setPrincipalAnnouncementUnreadCount(res.ok ? Number(data?.unreadCount ?? 0) : 0);
    } catch {
      setPrincipalAnnouncementUnreadCount(0);
    }
  }, []);

  const markPrincipalAnnouncementRead = useCallback((id: number) => {
    const key = `principal-${id}`;
    fetch("/api/guidance/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notif_key: key }),
    }).then(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      await refreshPrincipalAnnouncementCount();
    });
  }, [refreshPrincipalAnnouncementCount]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      refreshGuidanceCounts();
      loadIctCount();
      refreshPrincipalAnnouncementCount();
    });

    const client = supabaseBrowser;
    if (!client) return () => cancelAnimationFrame(frame);

    const channel = client
      .channel("guidance-sidebar-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => {
        refreshGuidanceCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_report_messages" }, () => {
        refreshGuidanceCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
        refreshGuidanceCounts();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "principal_announcements" }, () => {
        refreshPrincipalAnnouncementCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "guidance_notification_reads" }, () => {
        refreshPrincipalAnnouncementCount();
      })
      .subscribe();

    return () => {
      cancelAnimationFrame(frame);
      client.removeChannel(channel);
    };
  }, [refreshGuidanceCounts, loadIctCount, refreshPrincipalAnnouncementCount]);

  return (
    <GuidanceNotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
      escalatedCount,
      setEscalatedCount,
      notifUnreadCount,
      setNotifUnreadCount,
      principalAnnouncementUnreadCount,
      refreshPrincipalAnnouncementCount,
      markPrincipalAnnouncementRead,
      ictUnreadCount,
      setIctUnreadCount,
    }}>
      {children}
    </GuidanceNotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(GuidanceNotifContext);
}