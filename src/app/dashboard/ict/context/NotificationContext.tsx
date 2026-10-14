"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

export type NotificationType = "info" | "warning" | "alert" | "success";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  addNotification: (n: Omit<Notification, "id" | "read">) => void;
  inboxUnreadCount: number;
  setInboxUnreadCount: (n: number) => void;
  markInboxSeen: () => void;
  annUnreadCount: number;
  refreshCounts: () => Promise<void>;
  setAnnUnreadCount: (n: number) => void;
}
const NotificationContext = createContext<NotificationContextValue | null>(null);

function inboxSeenTimestamp() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.sessionStorage.getItem("ict-inbox-seen-at") ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

type InboxCountResponse = { unreadCount?: number };
type AnnouncementCountResponse = { unreadCount?: number };

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      type: "alert",
      title: "Security Alert",
      message: "5 consecutive failed logins from 103.22.14.98",
      time: "9:33 AM",
      read: false,
    },
    {
      id: "2",
      type: "info",
      title: "New User Created",
      message: "Juan P. Dela Cruz created account: Maria Santos (Parent)",
      time: "9:58 AM",
      read: false,
    },
    {
      id: "3",
      type: "warning",
      title: "Pending Tasks",
      message: "17 students still unlinked to parent accounts",
      time: "8:00 AM",
      read: true,
    },
  ]);

  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  // Keep the badge's local acknowledgement ahead of any count request that
  // began before ICT opened the Inbox or read a conversation.
  const inboxBadgeVersionRef = useRef(0);
  const inboxCountRequestVersionRef = useRef(0);
  const inboxSeenAtRef = useRef(inboxSeenTimestamp());
  const [annUnreadCount, setAnnUnreadCount] = useState(0);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function addNotification(n: Omit<Notification, "id" | "read">) {
    setNotifications((prev) => [
      { ...n, id: Date.now().toString(), read: false },
      ...prev,
    ]);
  }

  const markInboxSeen = useCallback(() => {
    const now = Date.now();
    window.sessionStorage.setItem("ict-inbox-seen-at", String(now));
    inboxSeenAtRef.current = now;
    inboxBadgeVersionRef.current += 1;
    setInboxUnreadCount(0);
  }, []);

  const refreshInboxCount = useCallback(async () => {
    const badgeVersion = inboxBadgeVersionRef.current;
    const requestVersion = ++inboxCountRequestVersionRef.current;
    try {
      // The layout stays mounted on every ICT page, so this small protected
      // summary is the Realtime target for the sidebar rather than a full
      // inbox payload (which can include attachments and whole threads).
      const query = new URLSearchParams({ role: "ict", summary: "1" });
      if (inboxSeenAtRef.current) {
        query.set("seenAfter", new Date(inboxSeenAtRef.current).toISOString());
      }
      const { response: msgRes, data: msgData } = await fetchJsonWithRetry<InboxCountResponse>(`/api/reports/staff-messages?${query}`, { cache: "no-store" });
      if (
        msgRes.ok
        && badgeVersion === inboxBadgeVersionRef.current
        && requestVersion === inboxCountRequestVersionRef.current
      ) {
        setInboxUnreadCount(Math.max(0, Number(msgData?.unreadCount ?? 0)));
      }
    } catch {
      // Retain the last confirmed counts while a temporary request is retried.
    }
  }, []);

  const refreshAnnouncementCount = useCallback(async () => {
    try {
      const { response, data } = await fetchJsonWithRetry<AnnouncementCountResponse>("/api/ict/notifications", { cache: "no-store" });
      if (response.ok) setAnnUnreadCount(Number(data?.unreadCount ?? 0));
    } catch {
      // Retain the last confirmed count while a temporary request is retried.
    }
  }, []);

  const refreshCounts = useCallback(async () => {
    await Promise.all([refreshInboxCount(), refreshAnnouncementCount()]);
  }, [refreshInboxCount, refreshAnnouncementCount]);

  useVisibleRefresh(refreshCounts);
  useSessionInvalidation(({ scope }) => {
    if (scope === "staff-messages") return refreshInboxCount();
    if (scope === "announcements" || scope === "notifications") return refreshAnnouncementCount();
    // A null scope is emitted after reconnect. Other scopes are intentionally
    // ignored here because they do not change the ICT inbox or announcement badge.
    if (!scope) return refreshCounts();
  });

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => { void refreshCounts(); }, 0);

    return () => {
      window.clearTimeout(initialRefresh);
    };
  }, [refreshCounts]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAllRead,
        markRead,
        addNotification,
        inboxUnreadCount,
        setInboxUnreadCount,
        markInboxSeen,
        annUnreadCount,
        refreshCounts,
        setAnnUnreadCount,
      }}
    >

      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationProvider");
  return ctx;
}
