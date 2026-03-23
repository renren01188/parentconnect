"use client";

// src/app/dashboard/adviser/context/NotificationContext.tsx

import { createContext, useContext, useState, ReactNode } from "react";
import {
  INITIAL_REPORTS_BADGE,
  INITIAL_NOTIFICATIONS_BADGE,
} from "../data";

interface NotifContextType {
  // Reports nav badge — actionable items (New + Escalated reports + New admin messages)
  unreadCount: number;
  setUnreadCount: (n: number) => void;

  // Notifications nav badge — unread notification items
  notifUnreadCount: number;
  setNotifUnreadCount: (n: number) => void;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
  notifUnreadCount: 0,
  setNotifUnreadCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Seeded from real data — never hardcoded
  const [unreadCount,      setUnreadCount]      = useState(INITIAL_REPORTS_BADGE);
  const [notifUnreadCount, setNotifUnreadCount] = useState(INITIAL_NOTIFICATIONS_BADGE);

  return (
    <NotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
      notifUnreadCount,
      setNotifUnreadCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}