"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { mergeNotificationFeed } from "@/lib/notificationFeed";

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

export type PrincipalNotification = {
  id: string;
  type: string;
  category: "report";
  reportId?: number;
  title: string;
  message: string;
  time: string;
  read: boolean;
};

type PrincipalNotificationsResponse = {
  notifications?: PrincipalNotification[];
  reportUnreadCount?: number;
  unreadCount?: number;
};

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
  notifications: PrincipalNotification[];
  notificationsLoading: boolean;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: (notifications: PrincipalNotification[]) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
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
  notifications: [],
  notificationsLoading: true,
  refreshNotifications: async () => { },
  markNotificationsRead: async () => { },
  markAllNotificationsRead: async () => { },
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [reportCount, setReportCount] = useState(0);
  const [adviserMessageCount, setAdviserMessageCount] = useState(0);
  const [ictMessageCount, setIctMessageCount] = useState(0);
  const ictBadgeVersionRef = useRef(0);
  const ictSeenAtRef = useRef(ictSeenTimestamp());
  const [principalNotifCount, setPrincipalNotifCount] = useState(0);
  const [notifications, setNotifications] = useState<PrincipalNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const notificationsRequestVersionRef = useRef(0);
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
    const requestVersion = ++notificationsRequestVersionRef.current;
    const { response, data } = await fetchJsonWithRetry<PrincipalNotificationsResponse>("/api/principal/notifications", { cache: "no-store" });
    if (requestVersion !== notificationsRequestVersionRef.current) return;
    if (!response.ok) {
      setNotificationsLoading(false);
      return;
    }
    const snapshot = (data?.notifications ?? []) as PrincipalNotification[];
    // Notification event keys are deterministic. Merging the server snapshot
    // prevents a Realtime request racing the first load from duplicating or
    // briefly reverting a locally acknowledged notification.
    setNotifications((current) => mergeNotificationFeed(current, snapshot));
    setReportCount(Number(data?.reportUnreadCount ?? 0));
    setPrincipalNotifCount(Number(data?.unreadCount ?? 0));
    setNotificationsLoading(false);
  }, []);

  const markNotificationsRead = useCallback(async (rows: PrincipalNotification[]) => {
    const keys = rows.filter((item) => !item.read).map((item) => item.id);
    if (!keys.length) return;

    // Show the acknowledgement immediately. The read route persists exactly
    // these existing notification keys and broadcasts the authoritative
    // snapshot to every open Principal dashboard tab.
    setNotifications((current) => current.map((item) => keys.includes(item.id) ? { ...item, read: true } : item));
    setPrincipalNotifCount((current) => Math.max(0, current - keys.length));

    const { response } = await fetchJsonWithRetry("/api/principal/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mark_all: true, notif_keys: keys }),
    });
    if (!response.ok) {
      await refreshNotifications();
      return;
    }
    await refreshNotifications();
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await markNotificationsRead(notifications);
  }, [markNotificationsRead, notifications]);

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
      notifications,
      notificationsLoading,
      refreshNotifications,
      markNotificationsRead,
      markAllNotificationsRead,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}
