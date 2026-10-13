"use client";

// src/app/dashboard/adviser/context/NotificationContext.tsx

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";


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

type IctMessagesResponse = { unreadCount?: number };
type AdviserNotificationsResponse = { sidebarUnreadCount?: number; unreadCount?: number };

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Seeded from real data — never hardcoded
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [ictUnreadCount, setIctUnreadCount] = useState(0);
  const hasLoadedInitialCounts = useRef(false);
  const refreshByScopeRef = useRef<(scope: string | null) => void>(() => {});

  useEffect(() => {
    // Each count has its own single-flight guard. A report save can update the
    // report page, sidebar, and an open notifications page at nearly the same
    // time; one API read per count is enough for that burst.
    let reportCountRequest: Promise<void> | null = null;
    let ictCountRequest: Promise<void> | null = null;
    let notificationCountRequest: Promise<void> | null = null;

    async function loadReportCount() {
      if (reportCountRequest) return reportCountRequest;
      reportCountRequest = (async () => {
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

        const actionableParentReports = parentReports.filter((report: {
          hasUnreadForAdviser?: boolean;
          status?: string;
          escalatedToGuidance?: boolean;
          escalatedToPrincipal?: boolean;
        }) => {
          const status = String(report.status ?? "").trim().toLowerCase();
          const isStillAssignedToAdviser =
            status !== "resolved" &&
            status !== "escalated" &&
            !report.escalatedToGuidance &&
            !report.escalatedToPrincipal;

          return Boolean(report.hasUnreadForAdviser) && isStillAssignedToAdviser;
        }).length;
        const actionableStudentReports = studentReports.filter((report: { status?: string }) =>
          report.status === "New"
        ).length;
        const actionablePrincipalMessages = principalMessages.filter((message: { sender?: string; status?: string }) =>
          message.sender === "Principal" && message.status === "New"
        ).length;

        setUnreadCount(actionableParentReports + actionableStudentReports + actionablePrincipalMessages);
      } catch {
        setUnreadCount(0);
      } finally {
        reportCountRequest = null;
      }
      })();
      return reportCountRequest;
    }

    async function loadIctCount() {
      if (ictCountRequest) return ictCountRequest;
      ictCountRequest = (async () => {
      try {
        const { response: res, data } = await fetchJsonWithRetry<IctMessagesResponse>("/api/adviser-ict/messages?summary=1", { cache: "no-store" });
        if (res.ok) setIctUnreadCount(Number(data?.unreadCount ?? 0));
      } catch {
        // Retain the last confirmed count while a temporary request is retried.
      } finally {
        ictCountRequest = null;
      }
      })();
      return ictCountRequest;
    }

    async function loadNotifCount() {
      if (notificationCountRequest) return notificationCountRequest;
      notificationCountRequest = (async () => {
      try {
        const { response: res, data } = await fetchJsonWithRetry<AdviserNotificationsResponse>("/api/adviser/notifications", { cache: "no-store" });
        if (res.ok) setNotifUnreadCount(Number(data?.sidebarUnreadCount ?? data?.unreadCount ?? 0));
      } catch {
        // Retain the last confirmed count while a temporary request is retried.
      } finally {
        notificationCountRequest = null;
      }
      })();
      return notificationCountRequest;
    }

    const refreshAllCounts = () => Promise.all([loadReportCount(), loadIctCount(), loadNotifCount()]);
    // React Strict Mode deliberately runs effects twice in local development.
    // Do not turn that development-only check into a duplicate five-request
    // sidebar burst. A real remount gets a new provider/ref and still loads.
    if (!hasLoadedInitialCounts.current) {
      hasLoadedInitialCounts.current = true;
      void refreshAllCounts();
    }

    // API routes enforce the custom cookie session. Refresh only while this
    // dashboard is visible so badges stay reliable if a browser cannot read a
    // Supabase Realtime database event.
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshAllCounts();
      window.dispatchEvent(new Event("adviser-notifications-changed"));
    };
    const fallbackRefresh = window.setInterval(refreshWhenVisible, 300_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    // The layout and active page share useSessionInvalidation's one account
    // channel. This provider owns only badge refresh decisions.
    const notifyNotificationChange = () => {
      void loadNotifCount();
      window.dispatchEvent(new Event("adviser-notifications-changed"));
    };
    const handleInvalidation = ({ scope }: { scope: string | null }) => {
      if (scope === "staff-messages") {
        void loadIctCount();
        return;
      }
      if (scope === "reports") {
        void loadReportCount();
        notifyNotificationChange();
        return;
      }
      if (scope === "notifications" || scope === "announcements") {
        notifyNotificationChange();
        return;
      }
      // A null scope is emitted after the shared channel recovers. It is the
      // only non-content event that needs a complete badge reconciliation.
      if (!scope) {
        void refreshAllCounts();
        window.dispatchEvent(new Event("adviser-notifications-changed"));
      }
    };
    refreshByScopeRef.current = (scope) => handleInvalidation({ scope });

    return () => {
      refreshByScopeRef.current = () => {};
      window.clearInterval(fallbackRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, []);

  useSessionInvalidation(({ scope }) => {
    refreshByScopeRef.current(scope);
  });

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
