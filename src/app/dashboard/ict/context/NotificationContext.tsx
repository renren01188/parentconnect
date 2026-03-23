"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { INITIAL_INBOX_UNREAD } from "@/app/dashboard/ict/inbox/data";

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
  // ── Inbox unread badge ──
  inboxUnreadCount: number;
  setInboxUnreadCount: (n: number) => void;
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

  // Seeded from MOCK_MESSAGES so the badge shows on every page,
  // even before the Inbox page is ever visited.
  const [inboxUnreadCount, setInboxUnreadCount] = useState(INITIAL_INBOX_UNREAD);

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