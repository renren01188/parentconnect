"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";

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

  const refreshCounts = useCallback(async () => {
    try {
      const [messageResult, announcementResult] = await Promise.all([
        fetchJsonWithRetry<InboxCountResponse>("/api/reports/staff-messages?role=ict", { cache: "no-store" }),
        fetchJsonWithRetry<AnnouncementCountResponse>("/api/ict/notifications", { cache: "no-store" }),
      ]);
      const { response: msgRes, data: msgData } = messageResult;
      const { response: annRes, data: annData } = announcementResult;
      const messages = Array.isArray(msgData?.messages) ? msgData.messages : [];
      if (msgRes.ok) {
        setInboxUnreadCount(messages.filter((message) =>
          message.status === "New" && Number(message.sortAt ?? 0) > inboxSeenAt
        ).length);
      }
      if (annRes.ok) setAnnUnreadCount(Number(annData?.unreadCount ?? 0));
    } catch {
      // Retain the last confirmed counts while a temporary request is retried.
    }
  }, [inboxSeenAt]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => { void refreshCounts(); }, 0);

    const client = supabaseBrowser;
    if (!client) return () => window.clearTimeout(initialRefresh);

    const channel = client
      .channel("ict-sidebar-inbox-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
        refreshCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ict_notification_reads" }, () => {
        refreshCounts();
      })
      .subscribe();


    return () => {
      window.clearTimeout(initialRefresh);
      client.removeChannel(channel);
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
