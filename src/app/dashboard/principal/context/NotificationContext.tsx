"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";

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
  principalNotifCount: 0,
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [reportCount, setReportCount] = useState(0);
  const [adviserMessageCount, setAdviserMessageCount] = useState(0);
  const [ictMessageCount, setIctMessageCount] = useState(0);
  const [principalNotifCount, setPrincipalNotifCount] = useState(0);
  const unreadCount = reportCount + adviserMessageCount + ictMessageCount;

  const refreshCounts = useCallback(async () => {
    const [messagesResult, ictResult, notifResult] = await Promise.all([
      fetchJsonWithRetry<any>("/api/reports/principal-messages", { cache: "no-store" }),
      fetchJsonWithRetry<any>("/api/principal-ict/messages", { cache: "no-store" }),
      fetchJsonWithRetry<any>("/api/principal/notifications", { cache: "no-store" }),
    ]);
    const { response: messagesRes, data: messagesData } = messagesResult;
    const { response: ictRes, data: ictData } = ictResult;
    const { response: notifRes, data: notifData } = notifResult;

    if (messagesRes.ok) {
      const conversations = (messagesData?.inbox ?? []) as PrincipalConversationSummary[];
      setAdviserMessageCount(conversations.filter((conversation) => conversation.status === "Unread").length);
    }

    if (ictRes.ok) {
      setIctMessageCount(Number(ictData?.unreadCount ?? 0));
    }

    if (notifRes.ok) {
      setReportCount(Number(notifData?.reportUnreadCount ?? 0));
      setPrincipalNotifCount(Number(notifData?.unreadCount ?? 0));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshCounts().catch(() => null);
    }, 0);
    // Server routes remain the authority for Principal notification counts.
    const refreshInterval = window.setInterval(() => {
      refreshCounts().catch(() => null);
    }, 30_000);

    const client = supabaseBrowser;
    if (!client) {
      return () => {
        window.clearTimeout(timer);
        window.clearInterval(refreshInterval);
      };
    }

    const channel = client
      .channel("principal-sidebar-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, () => {
        refreshCounts().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_report_guidance_tickets" }, () => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_notification_reads" }, () => {
        refreshCounts().catch(() => null);
      })
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(refreshInterval);
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
      principalNotifCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}
