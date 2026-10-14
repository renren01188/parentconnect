"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

function ictSeenTimestamp() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.sessionStorage.getItem("principal-contact-ict-seen-at") ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

type PrincipalConversationSummary = {
  status?: string;
};
type PrincipalMessagesResponse = { inbox?: PrincipalConversationSummary[] };
type IctMessagesResponse = { unreadCount?: number };
type PrincipalNotificationsResponse = { reportUnreadCount?: number; unreadCount?: number };

interface NotifContextType {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  reportCount: number;
  setReportCount: (n: number) => void;
  adviserMessageCount: number;
  setAdviserMessageCount: (n: number) => void;
  ictMessageCount: number;
  setIctMessageCount: (n: number) => void;
  clearIctMessageCount: () => void;
  refreshCounts: () => Promise<void>;
  principalNotifCount: number;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount: 0,
  setUnreadCount: () => { },
  reportCount: 0,
  setReportCount: () => { },
  adviserMessageCount: 0,
  setAdviserMessageCount: () => { },
  ictMessageCount: 0,
  setIctMessageCount: () => { },
  clearIctMessageCount: () => { },
  refreshCounts: async () => { },
  principalNotifCount: 0,
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [reportCount, setReportCount] = useState(0);
  const [adviserMessageCount, setAdviserMessageCount] = useState(0);
  const [ictMessageCount, setIctMessageCount] = useState(0);
  const ictBadgeVersionRef = useRef(0);
  const ictSeenAtRef = useRef(ictSeenTimestamp());
  const [principalNotifCount, setPrincipalNotifCount] = useState(0);
  const unreadCount = reportCount + adviserMessageCount + ictMessageCount;

  const refreshAdviserMessages = useCallback(async () => {
    const { response, data } = await fetchJsonWithRetry<PrincipalMessagesResponse>("/api/reports/principal-messages", { cache: "no-store" });
    if (response.ok) {
      const conversations = (data?.inbox ?? []) as PrincipalConversationSummary[];
      // The unified standalone-message inbox uses "New Message", while
      // older Adviser threads use "Unread". Both represent a reply that the
      // Principal has not opened, so the Reports sidebar must count both.
      setAdviserMessageCount(conversations.filter((conversation) =>
        conversation.status === "New Message" || conversation.status === "Unread"
      ).length);
    }
  }, []);

  const clearIctMessageCount = useCallback(() => {
    const now = Date.now();
    window.sessionStorage.setItem("principal-contact-ict-seen-at", String(now));
    ictSeenAtRef.current = now;
    ictBadgeVersionRef.current += 1;
    setIctMessageCount(0);
  }, []);

  const refreshIctMessages = useCallback(async () => {
    const badgeVersion = ictBadgeVersionRef.current;
    const query = new URLSearchParams({ summary: "1" });
    if (ictSeenAtRef.current) query.set("seenAfter", new Date(ictSeenAtRef.current).toISOString());
    const { response, data } = await fetchJsonWithRetry<IctMessagesResponse>(`/api/principal-ict/messages?${query}`, { cache: "no-store" });
    if (response.ok && badgeVersion === ictBadgeVersionRef.current) {
      setIctMessageCount(Number(data?.unreadCount ?? 0));
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    const { response, data } = await fetchJsonWithRetry<PrincipalNotificationsResponse>("/api/principal/notifications", { cache: "no-store" });
    if (response.ok) {
      setReportCount(Number(data?.reportUnreadCount ?? 0));
      setPrincipalNotifCount(Number(data?.unreadCount ?? 0));
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    await Promise.all([refreshAdviserMessages(), refreshIctMessages(), refreshNotifications()]);
  }, [refreshAdviserMessages, refreshIctMessages, refreshNotifications]);

  useSessionInvalidation(({ scope }) => {
    if (scope === "reports" || scope === "notifications" || scope === "announcements") {
      return refreshNotifications();
    }
    if (scope === "staff-messages") {
      return Promise.all([refreshAdviserMessages(), refreshIctMessages()]).then(() => undefined);
    }
    // Reconcile all counters after a recovered channel only; attendance and
    // account invalidations should not refetch unrelated message lists.
    if (!scope) return refreshCounts();
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshCounts().catch(() => null);
    }, 0);
    // Server routes remain the authority for Principal notification counts.
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCounts().catch(() => null);
    };
    const refreshInterval = window.setInterval(refreshWhenVisible, 300_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshCounts]);

  const setUnreadCount = (n: number) => {
    setReportCount(n);
  };

  return (
    <NotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
      reportCount,
      setReportCount,
      adviserMessageCount,
      setAdviserMessageCount,
      ictMessageCount,
      setIctMessageCount,
      clearIctMessageCount,
      refreshCounts,
      principalNotifCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}
