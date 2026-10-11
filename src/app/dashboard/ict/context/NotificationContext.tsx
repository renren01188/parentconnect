"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
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

type InboxMessageSummary = { status?: string; sortAt?: number };
type InboxCountResponse = { messages?: InboxMessageSummary[] };
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
  const [inboxSeenAt, setInboxSeenAt] = useState(inboxSeenTimestamp);
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
    setInboxSeenAt(now);
    setInboxUnreadCount(0);
  }, []);

  const refreshInboxCount = useCallback(async () => {
    try {
      const { response: msgRes, data: msgData } = await fetchJsonWithRetry<InboxCountResponse>("/api/reports/staff-messages?role=ict", { cache: "no-store" });
      const messages = Array.isArray(msgData?.messages) ? msgData.messages : [];
      if (msgRes.ok) {
        setInboxUnreadCount(messages.filter((message) =>
          message.status === "New" && Number(message.sortAt ?? 0) > inboxSeenAt
        ).length);
      }
    } catch {
      // Retain the last confirmed counts while a temporary request is retried.
    }
  }, [inboxSeenAt]);

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
    return refreshCounts();
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
