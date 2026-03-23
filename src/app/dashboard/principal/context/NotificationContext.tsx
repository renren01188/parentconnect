"use client";

import { createContext, useContext, useState, ReactNode } from "react";

// ── Import the same initial case data the page uses ──────────────
// This ensures the initial badge count is always in sync with the
// actual reports data — no more hardcoded magic numbers.
import { initialParentCases, initialStudentCases } from "../reports/data";

interface NotifContextType {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount: 0,
  setUnreadCount: () => {},
});

function getInitialCount(): number {
  const allReports = [
    ...initialParentCases.flatMap((p: typeof initialParentCases[0])  => p.reports),
    ...initialStudentCases.flatMap((s: typeof initialStudentCases[0]) => s.reports),
  ];
  // Count only actionable reports: New (Pending) + Escalated
  return allReports.filter(
    (r) => r.status === "New" || r.status === "Escalated"
  ).length;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(getInitialCount);

  return (
    <NotifContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}