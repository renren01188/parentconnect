"use client";

// src/app/dashboard/parent/context/NotificationContext.tsx

import { createContext, useContext, useState, ReactNode } from "react";

// Inline the initial counts here to avoid any import path issues.
// These must match INITIAL_REPORTS and INITIAL_NOTIFICATIONS in parent/data.ts.
// Reports unread: reports 1 and 5 have unread: true → 2
// Notifications unread: notifications 1 and 2 have unread: true → 2
const INITIAL_UNREAD_REPORTS       = 2;
const INITIAL_UNREAD_NOTIFICATIONS = 2;

interface NotifContextType {
  // Notifications bell badge
  unreadCount: number;
  setUnreadCount: (n: number) => void;

  // Reports message thread badge
  unreadReportsCount: number;
  setUnreadReportsCount: (n: number) => void;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount:          INITIAL_UNREAD_NOTIFICATIONS,
  setUnreadCount:       () => {},
  unreadReportsCount:   INITIAL_UNREAD_REPORTS,
  setUnreadReportsCount: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount,        setUnreadCount]        = useState(INITIAL_UNREAD_NOTIFICATIONS);
  const [unreadReportsCount, setUnreadReportsCount] = useState(INITIAL_UNREAD_REPORTS);

  return (
    <NotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
      unreadReportsCount,
      setUnreadReportsCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}