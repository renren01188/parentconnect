"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type PrincipalReportSummary = {
  status?: string;
  escalatedToPrincipal?: boolean;
};

type PrincipalConversationSummary = {
  status?: string;
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
  refreshCounts: () => Promise<void>;
  annUnreadCount: number;
  principalNotifCount: number;
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
  refreshCounts: async () => { },
  annUnreadCount: 0,
  principalNotifCount: 0,
});

function isActionablePrincipalReport(report: PrincipalReportSummary) {
  return Boolean(report.escalatedToPrincipal) && (report.status === "Escalated" || report.status === "New");
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [reportCount, setReportCount] = useState(0);
  const [adviserMessageCount, setAdviserMessageCount] = useState(0);
  const [ictMessageCount, setIctMessageCount] = useState(0);
  const [annUnreadCount, setAnnUnreadCount] = useState(0);
  const [principalNotifCount, setPrincipalNotifCount] = useState(0);
  const unreadCount = reportCount + adviserMessageCount + ictMessageCount;

  const refreshCounts = useCallback(async () => {
    const [reportsRes, messagesRes, ictRes, annRes] = await Promise.all([
      fetch("/api/reports/parent-adviser?role=principal", { cache: "no-store" }),
      fetch("/api/reports/principal-messages", { cache: "no-store" }),
      fetch("/api/principal-ict/messages", { cache: "no-store" }),
      fetch("/api/principal/notifications", { cache: "no-store" }),
    ]);

    const reportsData = await reportsRes.json().catch(() => null);
    const messagesData = await messagesRes.json().catch(() => null);
    const ictData = await ictRes.json().catch(() => null);
    const annData = await annRes.json().catch(() => null);

    if (reportsRes.ok) {
      const reports = (reportsData?.reports ?? []) as PrincipalReportSummary[];
      setReportCount(reports.filter(isActionablePrincipalReport).length);
    }

    if (messagesRes.ok) {
      const conversations = (messagesData?.inbox ?? []) as PrincipalConversationSummary[];
      setAdviserMessageCount(conversations.filter((conversation) => conversation.status === "Unread").length);
    }

    if (ictRes.ok) {
      setIctMessageCount(Number(ictData?.unreadCount ?? 0));
    }

    if (annRes.ok) {
      setAnnUnreadCount(Number(annData?.unreadCount ?? 0));
      setPrincipalNotifCount(Number(annData?.unreadCount ?? 0));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshCounts().catch(() => null);
    }, 0);

    const client = supabaseBrowser;
    if (!client) {
      return () => {
        window.clearTimeout(timer);
      };
    }

    const channel = client
      .channel("principal-sidebar-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => {
        refreshCounts().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "adviser_principal_messages" }, () => {
        refreshCounts().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_staff_messages" }, () => {
        refreshCounts().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
        refreshCounts().catch(() => null);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "adviser_announcements" }, () => {
        refreshCounts().catch(() => null);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "guidance_announcements" }, () => {
        refreshCounts().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_notification_reads" }, () => {
        refreshCounts().catch(() => null);
      })
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      client.removeChannel(channel);
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
      refreshCounts,
      annUnreadCount,
      principalNotifCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}
