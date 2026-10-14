"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

function ictSeenTimestamp() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.sessionStorage.getItem("guidance-contact-ict-seen-at") ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

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
  clearIctUnreadCount: () => void;
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
  clearIctUnreadCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [reportsUnreadCount, setReportsUnreadCount] = useState(0);
  const [escalatedCount, setEscalatedCount] = useState(0);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [ictUnreadCount, setIctUnreadCount] = useState(0);
  const ictBadgeVersionRef = useRef(0);
  const ictSeenAtRef = useRef(ictSeenTimestamp());
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

      const allReports = (reportsData?.reports ?? []) as Array<{
        id?: number;
        hasUnreadForGuidance?: boolean;
        status?: string;
        guidanceSeen?: boolean;
        ticketStatus?: string | null;
        escalatedToGuidance?: boolean;
        escalatedToPrincipal?: boolean;
      }>;
      const tickets = ticketsRes.ok
        ? ((ticketsData?.tickets ?? []) as Array<{ report_id?: number; status?: string; isAssignedToCurrentGuidance?: boolean; isReadByCurrentGuidance?: boolean }>)
        : [];
      const pendingTicketCount = tickets.filter((ticket) => ticket.status === "pending").length;
      const unreadAcceptedTicketReportIds = new Set(tickets
        .filter((ticket) => ticket.status === "accepted" && ticket.isAssignedToCurrentGuidance && !ticket.isReadByCurrentGuidance)
        .map((ticket) => Number(ticket.report_id))
        .filter((reportId) => Number.isSafeInteger(reportId) && reportId > 0));
      const isUnreadReport = (report: typeof allReports[number]) => Boolean(
        report.hasUnreadForGuidance
        || (report.status === "Escalated" && !report.guidanceSeen)
        || (report.ticketStatus === "accepted" && unreadAcceptedTicketReportIds.has(Number(report.id)))
      );
      const reportCount = reportsRes.ok ? allReports.filter(isUnreadReport).length : 0;
      const staffCount = staffRes.ok
        ? ((staffData?.messages ?? []) as Array<{ status?: string }>).filter(m => m.status === "New").length
        : 0;
      const nextCount = reportCount + staffCount + pendingTicketCount;
      setUnreadCount(nextCount);
      setReportsUnreadCount(reportCount + staffCount + pendingTicketCount);
      // notifUnreadCount is intentionally NOT set here — the Notifications
      // nav item tracks its own separate source, not parent-adviser replies.
      // This sidebar total is an active Guidance workload count, not an
      // unread count. Once Guidance opens a report its display status becomes
      // "Ongoing", but it must remain in this total until it is resolved or
      // handed on to the Principal.
      const activeGuidanceConcernCount = reportsRes.ok
        ? allReports.filter((report) => (
          report.escalatedToGuidance === true
          && report.escalatedToPrincipal !== true
          && report.status !== "Resolved"
        )).length
        : 0;
      setEscalatedCount(activeGuidanceConcernCount + pendingTicketCount);
    } catch {
      setUnreadCount(0);
      setReportsUnreadCount(0);
      setEscalatedCount(0);
    }
  }, []);

  const clearIctUnreadCount = useCallback(() => {
    const now = Date.now();
    window.sessionStorage.setItem("guidance-contact-ict-seen-at", String(now));
    ictSeenAtRef.current = now;
    ictBadgeVersionRef.current += 1;
    setIctUnreadCount(0);
  }, []);

  const loadIctCount = useCallback(async () => {
    const badgeVersion = ictBadgeVersionRef.current;
    const seenAfter = ictSeenAtRef.current;
    try {
      const query = new URLSearchParams({ summary: "1" });
      if (seenAfter) query.set("seenAfter", new Date(seenAfter).toISOString());
      const res = await fetch(`/api/guidance-ict/messages?${query}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (badgeVersion === ictBadgeVersionRef.current) {
        setIctUnreadCount(res.ok ? Number(data?.unreadCount ?? 0) : 0);
      }
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
    if (scope === "tickets") {
      await refreshGuidanceCounts();
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
    // Only a reconnect needs a complete badge reconciliation. Account/profile
    // changes do not affect these three independent count sources.
    if (!scope) await Promise.all([refreshGuidanceCounts(), loadIctCount(), refreshNotificationCounts()]);
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
      clearIctUnreadCount,
    }}>
      {children}
    </GuidanceNotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(GuidanceNotifContext);
}
