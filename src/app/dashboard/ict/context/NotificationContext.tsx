"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
  annUnreadCount: number;
  refreshCounts: () => Promise<void>;
  setAnnUnreadCount: (n: number) => void;
}
const NotificationContext = createContext<NotificationContextValue | null>(null);

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

  const refreshCounts = useCallback(async () => {
    try {
      const [msgRes, annRes] = await Promise.all([
        fetch("/api/reports/staff-messages?role=ict", { cache: "no-store" }),
        fetch("/api/ict/notifications", { cache: "no-store" }),
      ]);
      const msgData = await msgRes.json().catch(() => null);
      const annData = await annRes.json().catch(() => null);
      const messages = Array.isArray(msgData?.messages) ? msgData.messages : [];
      setInboxUnreadCount(msgRes.ok ? messages.filter((m: { status?: string }) => m.status === "New").length : 0);
      setAnnUnreadCount(annRes.ok ? Number(annData?.unreadCount ?? 0) : 0);
    } catch {
      setInboxUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    refreshCounts();

    const client = supabaseBrowser;
    if (!client) return;

    const channel = client
      .channel("ict-sidebar-inbox-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
        refreshCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ict_notification_reads" }, () => {
        refreshCounts();
      })
      .subscribe();


    return () => { client.removeChannel(channel); };
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
