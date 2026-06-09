"use client";

// src/app/dashboard/adviser/context/NotificationContext.tsx

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";


interface NotifContextType {
  // Reports nav badge — actionable items (New + Escalated reports + New admin messages)
  unreadCount: number;
  setUnreadCount: (n: number) => void;

  // Notifications nav badge — unread notification items
  notifUnreadCount: number;
  setNotifUnreadCount: (n: number) => void;

  // Contact ICT nav badge — unread ICT messages
  ictUnreadCount: number;
  setIctUnreadCount: (n: number) => void;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount: 0,
  setUnreadCount: () => { },
  notifUnreadCount: 0,
  setNotifUnreadCount: () => { },
  ictUnreadCount: 0,
  setIctUnreadCount: () => { },
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Seeded from real data — never hardcoded
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [ictUnreadCount, setIctUnreadCount] = useState(0);

  useEffect(() => {
    async function loadReportCount() {
      try {
        const [parentReportsRes, studentReportsRes, principalMessagesRes] = await Promise.all([
          fetch("/api/reports/parent-adviser?role=adviser", { cache: "no-store" }),
          fetch("/api/student-reports", { cache: "no-store" }),
          fetch("/api/reports/adviser-messages", { cache: "no-store" }),
        ]);
        const [parentReportsData, studentReportsData, principalMessagesData] = await Promise.all([
          parentReportsRes.json().catch(() => null),
          studentReportsRes.json().catch(() => null),
          principalMessagesRes.json().catch(() => null),
        ]);

        const parentReports = parentReportsRes.ok ? parentReportsData?.reports ?? [] : [];
        const studentReports = studentReportsRes.ok ? studentReportsData?.reports ?? [] : [];
        const principalMessages = principalMessagesRes.ok ? principalMessagesData?.principalMessages ?? [] : [];

        const actionableParentReports = parentReports.filter((report: { hasUnreadForAdviser?: boolean }) =>
          report.hasUnreadForAdviser
        ).length;
        const actionableStudentReports = studentReports.filter((report: { status?: string }) =>
          report.status === "New"
        ).length;
        const actionablePrincipalMessages = principalMessages.filter((message: { sender?: string; status?: string }) =>
          message.sender === "Principal" && message.status === "New"
        ).length;

        setUnreadCount(actionableParentReports + actionableStudentReports + actionablePrincipalMessages);
      } catch {
        setUnreadCount(0);
      }
    }

    async function loadIctCount() {
      try {
        const res = await fetch("/api/adviser-ict/messages", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        setIctUnreadCount(res.ok ? Number(data?.unreadCount ?? 0) : 0);
      } catch {
        setIctUnreadCount(0);
      }
    }

    loadReportCount();
    loadIctCount();
    loadNotifCount();
    async function loadNotifCount() {
      try {
        const res = await fetch("/api/adviser/notifications", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        setNotifUnreadCount(res.ok ? Number(data?.unreadCount ?? 0) : 0);
      } catch {
        setNotifUnreadCount(0);
      }
    }

    loadReportCount();
    loadIctCount();
    loadNotifCount();


    const client = supabaseBrowser;
    if (!client) return;

    const channel = client
      .channel("adviser-sidebar-report-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => {
        loadReportCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_report_messages" }, () => {
        loadReportCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "student_reports" }, () => {
        loadReportCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_staff_messages" }, () => {
        loadReportCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
        loadIctCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "adviser_notification_reads" }, () => {
        loadNotifCount();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  return (
    <NotifContext.Provider value={{
      unreadCount,
      setUnreadCount,
      notifUnreadCount,
      setNotifUnreadCount,
      ictUnreadCount,
      setIctUnreadCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}
