"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

type GuidanceNotifContextType = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  reportsUnreadCount: number;
  setReportsUnreadCount: (count: number) => void;
  escalatedCount: number;
  setEscalatedCount: (count: number) => void;
  notifUnreadCount: number;
  setNotifUnreadCount: (count: number) => void;
  principalAnnouncementUnreadCount: number;
  refreshPrincipalAnnouncementCount: () => Promise<void>;
  markAnnouncementRead: (notifKey: string) => void;
  ictUnreadCount: number;
  setIctUnreadCount: (count: number) => void;
};

const GuidanceNotifContext = createContext<GuidanceNotifContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
  reportsUnreadCount: 0,
  setReportsUnreadCount: () => {},
  escalatedCount: 0,
  setEscalatedCount: () => {},
  notifUnreadCount: 0,
  setNotifUnreadCount: () => {},
  principalAnnouncementUnreadCount: 0,
  refreshPrincipalAnnouncementCount: async () => {},
  markAnnouncementRead: () => {},
  ictUnreadCount: 0,
  setIctUnreadCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [reportsUnreadCount, setReportsUnreadCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [ictUnreadCount, setIctUnreadCount] = useState(0);
  const [principalAnnouncementUnreadCount, setPrincipalAnnouncementUnreadCount] = useState(0);

  const refreshGuidanceCounts = useCallback(async () => {
    try {
      const [reportsRes, staffRes, ticketsRes] = await Promise.all([
        fetch("/api/reports/parent-adviser?role=guidance", { cache: "no-store" }),
        fetch("/api/reports/staff-messages?role=guidance", { cache: "no-store" }),
        fetch("/api/reports/guidance/tickets", { cache: "no-store" }),
      ]);
      const [reportsData, staffData, ticketsData] = await Promise.all([
        reportsRes.json().catch(() => null),
        staffRes.json().catch(() => null),
        ticketsRes.json().catch(() => null),
      ]);

      const allReports = (reportsData?.reports ?? []) as Array<{ hasUnreadForGuidance?: boolean; status?: string; guidanceSeen?: boolean; ticketStatus?: string | null }>;
      const pendingTicketCount = ticketsRes.ok
        ? ((ticketsData?.tickets ?? []) as Array<{ status?: string }>).filter((ticket) => ticket.status === "pending").length
        : 0;
      const reportCount = reportsRes.ok
        ? allReports.filter(r => r.hasUnreadForGuidance).length
        : 0;
      const staffCount = staffRes.ok
        ? ((staffData?.messages ?? []) as Array<{ status?: string }>).filter(m => m.status === "New").length
        : 0;
      const nextCount = reportCount + staffCount + pendingTicketCount;
      setUnreadCount(nextCount);
      setReportsUnreadCount(
        (reportsRes.ok
          ? allReports.filter(r => r.hasUnreadForGuidance || (r.status === "Escalated" && !r.guidanceSeen) || (r.ticketStatus === "accepted" && !r.guidanceSeen)).length
          : 0) + staffCount + pendingTicketCount
      );
      // notifUnreadCount is intentionally NOT set here — the Notifications
      // nav item tracks its own separate source, not parent-adviser replies.
      // Track escalated reports separately for the sidebar panel
      const nextEscalatedCount = reportsRes.ok
        ? allReports.filter(r => r.status === "Escalated" || (r.ticketStatus === "accepted" && !r.guidanceSeen)).length + pendingTicketCount
        : pendingTicketCount;
      setEscalatedCount(nextEscalatedCount);
    } catch {
      setUnreadCount(0);
      setReportsUnreadCount(0);
      setEscalatedCount(0);
    }
  }, []);

  const loadIctCount = useCallback(async () => {
    try {
      const res = await fetch("/api/guidance-ict/messages?summary=1", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      setIctUnreadCount(res.ok ? Number(data?.unreadCount ?? 0) : 0);
    } catch {
      setIctUnreadCount(0);
    }
  }, []);

  const refreshNotificationCounts = useCallback(async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const [res, announcementsRes] = await Promise.all([
          fetch("/api/guidance/notifications", { cache: "no-store" }),
          fetch("/api/guidance/principal-announcements", { cache: "no-store" }),
        ]);
        const [data, announcementsData] = await Promise.all([
          res.json().catch(() => null),
          announcementsRes.json().catch(() => null),
        ]);
        if (res.ok && data?.success) {
          setNotifUnreadCount(Number(data.unreadCount ?? 0));
          if (announcementsRes.ok && announcementsData?.success) {
            setPrincipalAnnouncementUnreadCount(Number(announcementsData.unreadCount ?? 0));
          }
          return;
        }
        if (res.status < 500 || attempt === 1) return;
      } catch {
        if (attempt === 1) return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
    }
  }, []);

  const refreshPrincipalAnnouncementCount = refreshNotificationCounts;

  useSessionInvalidation(async ({ scope }) => {
    if (scope === "reports") {
      await Promise.all([refreshGuidanceCounts(), refreshNotificationCounts()]);
      return;
    }
    if (scope === "staff-messages") {
      await Promise.all([refreshGuidanceCounts(), loadIctCount()]);
      return;
    }
    if (scope === "notifications" || scope === "announcements") {
      await refreshNotificationCounts();
      return;
    }
    await Promise.all([refreshGuidanceCounts(), loadIctCount(), refreshNotificationCounts()]);
  });

  const markAnnouncementRead = useCallback((notifKey: string) => {
    fetch("/api/guidance/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notif_key: notifKey }),
    }).then(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      await refreshNotificationCounts();
    });
  }, [refreshNotificationCounts]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      refreshGuidanceCounts();
      loadIctCount();
      refreshNotificationCounts();
    });
    // The server-side broadcast is the normal update path. This is only a
    // recovery path when a browser drops its Realtime socket.
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      refreshGuidanceCounts();
      loadIctCount();
      refreshNotificationCounts();
    };
    const refreshInterval = window.setInterval(refreshWhenVisible, 300_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshGuidanceCounts, loadIctCount, refreshNotificationCounts]);

  return (
    <GuidanceNotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
      reportsUnreadCount,
      setReportsUnreadCount,
      escalatedCount,
      setEscalatedCount,
      notifUnreadCount,
      setNotifUnreadCount,
      principalAnnouncementUnreadCount,
      refreshPrincipalAnnouncementCount,
      markAnnouncementRead,
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
