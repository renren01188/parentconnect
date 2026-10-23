"use client";

// src/app/dashboard/adviser/context/NotificationContext.tsx

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";


interface NotifContextType {
  // Reports nav badge — actionable items (New + Escalated reports + New admin messages)
  unreadCount: number;
  setUnreadCount: (n: number) => void;

  // Notifications nav badge — unread notification items
  notifUnreadCount: number;
  setNotifUnreadCount: (n: number) => void;
  markNotifRead: () => void;

  // Contact ICT nav badge — unread ICT messages
  ictUnreadCount: number;
  setIctUnreadCount: (n: number) => void;
  clearIctUnreadCount: () => void;

  // Students nav badge — transfer requests awaiting this Adviser's receipt.
  // This is intentionally separate from the Receive Transfer button count:
  // the sidebar badge is an acknowledgement, while the button always shows
  // the actual pending queue.
  transferUnreadCount: number;
}

const NotifContext = createContext<NotifContextType>({
  unreadCount: 0,
  setUnreadCount: () => { },
  notifUnreadCount: 0,
  setNotifUnreadCount: () => { },
  markNotifRead: () => { },
  ictUnreadCount: 0,
  setIctUnreadCount: () => { },
  clearIctUnreadCount: () => { },
  transferUnreadCount: 0,
});

type IctMessagesResponse = { unreadCount?: number };
type AdviserNotificationsResponse = { sidebarUnreadCount?: number; unreadCount?: number };
type ReadyTransferSummaryResponse = { total?: number };
type AdviserDashboardSummaryResponse = {
  reportsUnreadCount?: number;
  ictUnreadCount?: number;
  transferUnreadCount?: number;
};

// Realtime invalidations are the normal update path. This is deliberately a
// quiet, visible-tab-only recovery path for a dropped browser subscription.
const SIDEBAR_FALLBACK_REFRESH_MS = 600_000;
const RETURN_TO_TAB_REFRESH_COOLDOWN_MS = 15_000;

function ictSeenTimestamp() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.sessionStorage.getItem("adviser-contact-ict-seen-at") ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  // Seeded from real data — never hardcoded
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifUnreadCount, setNotifUnreadCountState] = useState(0);
  const [ictUnreadCount, setIctUnreadCount] = useState(0);
  const [transferUnreadCount, setTransferUnreadCount] = useState(0);
  const hasLoadedInitialCounts = useRef(false);
  const refreshByScopeRef = useRef<(scope: string | null) => void>(() => {});
  const notificationBadgeVersionRef = useRef(0);
  const ictBadgeVersionRef = useRef(0);
  const ictSeenAtRef = useRef(ictSeenTimestamp());

  // Keep page-level optimistic reads ahead of a stale count request. A later
  // Realtime/API refresh reconciles this with saved read rows.
  const setNotifUnreadCount = useCallback((count: number) => {
    notificationBadgeVersionRef.current += 1;
    setNotifUnreadCountState(Math.max(0, count));
  }, []);

  const markNotifRead = useCallback(() => {
    notificationBadgeVersionRef.current += 1;
    setNotifUnreadCountState((count) => Math.max(0, count - 1));
  }, []);

  const clearIctUnreadCount = useCallback(() => {
    // Opening Contact ICT acknowledges the sidebar badge, but never changes
    // the unread state displayed on the conversation itself.
    const now = Date.now();
    window.sessionStorage.setItem("adviser-contact-ict-seen-at", String(now));
    ictSeenAtRef.current = now;
    ictBadgeVersionRef.current += 1;
    setIctUnreadCount(0);
  }, []);

  useEffect(() => {
    // Each count has its own single-flight guard. A report save can update the
    // report page, sidebar, and an open notifications page at nearly the same
    // time; one API read per count is enough for that burst.
    let reportCountRequest: Promise<void> | null = null;
    let ictCountRequest: Promise<void> | null = null;
    let notificationCountRequest: Promise<void> | null = null;
    let transferCountRequest: Promise<void> | null = null;
    let dashboardSummaryRequest: Promise<void> | null = null;

    async function loadReportCount() {
      if (reportCountRequest) return reportCountRequest;
      reportCountRequest = (async () => {
      try {
        const [parentReportsRes, studentReportsRes, principalMessagesRes, staffMessagesRes] = await Promise.all([
          fetch("/api/reports/parent-adviser?role=adviser", { cache: "no-store" }),
          fetch("/api/student-reports", { cache: "no-store" }),
          fetch("/api/reports/adviser-messages", { cache: "no-store" }),
          fetch("/api/reports/staff-messages?role=adviser&excludeIct=1", { cache: "no-store" }),
        ]);
        const [parentReportsData, studentReportsData, principalMessagesData, staffMessagesData] = await Promise.all([
          parentReportsRes.json().catch(() => null),
          studentReportsRes.json().catch(() => null),
          principalMessagesRes.json().catch(() => null),
          staffMessagesRes.json().catch(() => null),
        ]);

        const parentReports = parentReportsRes.ok ? parentReportsData?.reports ?? [] : [];
        const studentReports = studentReportsRes.ok ? studentReportsData?.reports ?? [] : [];
        const principalMessages = principalMessagesRes.ok ? principalMessagesData?.principalMessages ?? [] : [];
        const directStaffMessages = staffMessagesRes.ok ? staffMessagesData?.messages ?? [] : [];

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
        // Adviser–ICT conversations have their own Contact ICT badge. Keep
        // unread ICT threads out of the Reports total while retaining other
        // direct staff conversations in their existing Reports workflow.
        const unreadReportStaffMessages = directStaffMessages.filter((message: { status?: string; sender?: string }) =>
          message.status === "New" && message.sender !== "ICT"
        ).length;

        setUnreadCount(actionableParentReports + actionableStudentReports + actionablePrincipalMessages + unreadReportStaffMessages);
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
      const badgeVersion = ictBadgeVersionRef.current;
      const seenAfter = ictSeenAtRef.current;
      ictCountRequest = (async () => {
      try {
        const query = new URLSearchParams({ summary: "1" });
        if (seenAfter) query.set("seenAfter", new Date(seenAfter).toISOString());
        const { response: res, data } = await fetchJsonWithRetry<IctMessagesResponse>(`/api/adviser-ict/messages?${query}`, { cache: "no-store" });
        if (res.ok && badgeVersion === ictBadgeVersionRef.current) setIctUnreadCount(Number(data?.unreadCount ?? 0));
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
      const badgeVersion = notificationBadgeVersionRef.current;
      notificationCountRequest = (async () => {
      try {
        const { response: res, data } = await fetchJsonWithRetry<AdviserNotificationsResponse>("/api/adviser/notifications", { cache: "no-store" });
        if (res.ok && badgeVersion === notificationBadgeVersionRef.current) {
          setNotifUnreadCountState(Number(data?.sidebarUnreadCount ?? data?.unreadCount ?? 0));
        }
      } catch {
        // Retain the last confirmed count while a temporary request is retried.
      } finally {
        notificationCountRequest = null;
      }
      })();
      return notificationCountRequest;
    }

    async function loadTransferCount() {
      if (transferCountRequest) return transferCountRequest;
      transferCountRequest = (async () => {
        try {
          // The endpoint applies the current Adviser's destination-grade and
          // section authorization. Loading it from the layout keeps the
          // Students badge live on every Adviser dashboard page.
          const { response: res, data } = await fetchJsonWithRetry<ReadyTransferSummaryResponse>(
            "/api/students/standby-summary",
            { cache: "no-store" },
          );
          if (res.ok) setTransferUnreadCount(Math.max(0, Number(data?.total ?? 0)));
        } catch {
          // Retain the last confirmed count during a temporary failure.
        } finally {
          transferCountRequest = null;
        }
      })();
      return transferCountRequest;
    }

    async function loadDashboardSummary() {
      if (dashboardSummaryRequest) return dashboardSummaryRequest;
      const ictBadgeVersion = ictBadgeVersionRef.current;
      const query = new URLSearchParams();
      if (ictSeenAtRef.current) query.set("ictSeenAfter", new Date(ictSeenAtRef.current).toISOString());
      dashboardSummaryRequest = (async () => {
        try {
          const suffix = query.size ? `?${query}` : "";
          const { response, data } = await fetchJsonWithRetry<AdviserDashboardSummaryResponse>(
            `/api/adviser/dashboard-summary${suffix}`,
            { cache: "no-store" },
          );
          if (!response.ok) return;
          setUnreadCount(Math.max(0, Number(data?.reportsUnreadCount ?? 0)));
          if (ictBadgeVersion === ictBadgeVersionRef.current) {
            setIctUnreadCount(Math.max(0, Number(data?.ictUnreadCount ?? 0)));
          }
          setTransferUnreadCount(Math.max(0, Number(data?.transferUnreadCount ?? 0)));
        } catch {
          // Retain the last confirmed snapshot during a temporary failure.
        } finally {
          dashboardSummaryRequest = null;
        }
      })();
      return dashboardSummaryRequest;
    }

    // The sidebar's report, Contact ICT, and transfer counts share one
    // authorized request. The notifications feed keeps its own request so
    // its durable per-row read state remains exactly the same as the list.
    const refreshAllCounts = () => Promise.all([loadDashboardSummary(), loadNotifCount()]);
    // React Strict Mode deliberately runs effects twice in local development.
    // Do not turn that development-only check into a duplicate five-request
    // sidebar burst. A real remount gets a new provider/ref and still loads.
    let lastFallbackRefreshAt = 0;
    if (!hasLoadedInitialCounts.current) {
      hasLoadedInitialCounts.current = true;
      lastFallbackRefreshAt = Date.now();
      void refreshAllCounts();
    }

    // API routes enforce the custom cookie session. Refresh only while this
    // dashboard is visible so badges stay reliable if a browser cannot read a
    // Supabase Realtime database event.
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      // A browser commonly fires both visibilitychange and focus when an
      // Adviser returns to a tab. Treat that as one recovery refresh.
      if (now - lastFallbackRefreshAt < RETURN_TO_TAB_REFRESH_COOLDOWN_MS) return;
      lastFallbackRefreshAt = now;
      void refreshAllCounts();
      window.dispatchEvent(new Event("adviser-notifications-changed"));
    };
    const fallbackRefresh = window.setInterval(refreshWhenVisible, SIDEBAR_FALLBACK_REFRESH_MS);
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
        // A direct staff message can change the Reports badge even while the
        // Adviser is on another page. Reconcile its authorized inbox here;
        // Contact ICT remains an independent count source.
        void loadReportCount();
        void loadIctCount();
        return;
      }
      if (scope === "reports" || scope === "students") {
        // Public student-report submissions are deliberately delivered on the
        // assigned Adviser's existing `students` channel.  The Reports badge
        // includes those New student reports, so it must re-read its
        // authorized report snapshot here even when Reports is not the active
        // page. Other student changes safely reconcile against the same
        // server-authorized count.
        void loadReportCount();
        void loadTransferCount();
        notifyNotificationChange();
        return;
      }
      if (scope === "attendance") {
        notifyNotificationChange();
        return;
      }
      if (scope === "accounts") {
        // The Sidebar is mounted by the Adviser layout but owns its own
        // profile snapshot. Let an ICT account/assignment update refresh that
        // snapshot on every Adviser route, not only while Profile is open.
        window.dispatchEvent(new Event("adviser-profile-updated"));
        void loadTransferCount();
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
      markNotifRead,
      ictUnreadCount,
      setIctUnreadCount,
      clearIctUnreadCount,
      transferUnreadCount,
    }}>
      {children}
    </NotifContext.Provider>
  );
}

export function useNotifContext() {
  return useContext(NotifContext);
}
