"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import type { ChannelStatus, RealtimeInvalidation } from "@/lib/subscribeRealtimeInvalidations";

type RefreshReports = () => void | Promise<void>;
type RefreshReport = (invalidation: RealtimeInvalidation) => void | Promise<void>;

type ReportRealtimeOptions = {
  /** Receives report-scoped events without replacing the selected conversation. */
  onReportUpdate?: RefreshReport;
  /** Refreshes a role's authorized ticket list and ticket-derived badges in place. */
  onTicketUpdate?: RefreshReports;
  /** Delivers an ephemeral standalone staff-conversation event without a list refresh. */
  onStaffMessageUpdate?: RefreshReport;
  /** Refreshes a role's authorized student-report list in place. */
  onStudentReportUpdate?: RefreshReports;
  /** Reconnect recovery keeps ephemeral typing UI from becoming stale. */
  onConnectionStatus?: (status: ChannelStatus) => void;
};

/**
 * Keeps Reports inboxes current through the dashboard's single authenticated
 * Realtime channel. Each report page used to open a second identical socket;
 * this hook now only fans out the already-authorized, data-free invalidation.
 */
export function useReportMessagesRealtime(
  refreshReports: RefreshReports,
  options: ReportRealtimeOptions = {},
) {
  const [liveUpdateNotice, setLiveUpdateNotice] = useState<string | null>(null);
  const refreshRef = useRef(refreshReports);
  const reportUpdateRef = useRef<RefreshReport | undefined>(options.onReportUpdate);
  const ticketUpdateRef = useRef<RefreshReports | undefined>(options.onTicketUpdate);
  const staffMessageUpdateRef = useRef<RefreshReport | undefined>(options.onStaffMessageUpdate);
  const studentReportUpdateRef = useRef<RefreshReports | undefined>(options.onStudentReportUpdate);
  const connectionStatusRef = useRef<ReportRealtimeOptions["onConnectionStatus"]>(options.onConnectionStatus);
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<number | undefined>(undefined);
  const reportTimerRef = useRef<number | undefined>(undefined);
  const pendingReportUpdateRef = useRef<RealtimeInvalidation | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refreshReports;
  }, [refreshReports]);

  useEffect(() => {
    reportUpdateRef.current = options.onReportUpdate;
  }, [options.onReportUpdate]);

  useEffect(() => {
    ticketUpdateRef.current = options.onTicketUpdate;
  }, [options.onTicketUpdate]);

  useEffect(() => {
    staffMessageUpdateRef.current = options.onStaffMessageUpdate;
  }, [options.onStaffMessageUpdate]);

  useEffect(() => {
    studentReportUpdateRef.current = options.onStudentReportUpdate;
  }, [options.onStudentReportUpdate]);

  useEffect(() => {
    connectionStatusRef.current = options.onConnectionStatus;
  }, [options.onConnectionStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current !== undefined) window.clearTimeout(refreshTimerRef.current);
      if (reportTimerRef.current !== undefined) window.clearTimeout(reportTimerRef.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      await refreshRef.current();
      if (mountedRef.current) setLiveUpdateNotice(null);
    } catch {
      if (mountedRef.current) setLiveUpdateNotice("Live updates are reconnecting. Existing reports remain available.");
    } finally {
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current && mountedRef.current) {
        refreshQueuedRef.current = false;
        void refresh();
      }
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== undefined) window.clearTimeout(refreshTimerRef.current);
    // A single write can update both a message and its report summary. Coalesce
    // those events so the selected conversation is fetched once in place.
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = undefined;
      void refresh();
    }, 75);
  }, [refresh]);

  const refreshReport = useCallback(async (invalidation: RealtimeInvalidation) => {
    try {
      if (reportUpdateRef.current) await reportUpdateRef.current(invalidation);
      else await refresh();
      if (mountedRef.current) setLiveUpdateNotice(null);
    } catch {
      // The normal authorized inbox snapshot is the safe fallback for a stale
      // ID or a report that is no longer accessible to this account.
      scheduleRefresh();
    }
  }, [refresh, scheduleRefresh]);

  const scheduleReportRefresh = useCallback((invalidation: RealtimeInvalidation) => {
    if (invalidation.kind === "typing") {
      void refreshReport(invalidation);
      return;
    }
    pendingReportUpdateRef.current = invalidation;
    if (reportTimerRef.current !== undefined) window.clearTimeout(reportTimerRef.current);
    reportTimerRef.current = window.setTimeout(() => {
      reportTimerRef.current = undefined;
      const update = pendingReportUpdateRef.current;
      pendingReportUpdateRef.current = null;
      if (update) void refreshReport(update);
    }, 75);
  }, [refreshReport]);

  useSessionInvalidation((invalidation) => {
    if (invalidation.scope === "reports") {
      if (invalidation.reportId) scheduleReportRefresh(invalidation);
      else scheduleRefresh();
      return;
    }
    if (invalidation.scope === "tickets") {
      // Tickets are server-authorized and need only their own lightweight
      // snapshot; reloading every report would disrupt an open conversation.
      if (ticketUpdateRef.current) {
        void Promise.resolve(ticketUpdateRef.current()).catch(scheduleRefresh);
      } else {
        scheduleRefresh();
      }
      return;
    }
    if (invalidation.scope === "staff-messages") {
      if (invalidation.kind === "typing") {
        staffMessageUpdateRef.current?.(invalidation);
        return;
      }
      scheduleRefresh();
      return;
    }
    if (invalidation.scope === "students") {
      // Student Reports have their own authorized feed on the Adviser page.
      // Updating that state directly keeps its active list/detail mounted.
      if (studentReportUpdateRef.current) {
        void Promise.resolve(studentReportUpdateRef.current()).catch(scheduleRefresh);
      }
      return;
    }
    if (!invalidation.scope) {
      // Shared-channel reconnect: recover the server snapshot once, without
      // navigating away or clearing the selected conversation and its draft.
      connectionStatusRef.current?.("SUBSCRIBED");
      scheduleRefresh();
    }
  });

  // Realtime is the normal path. A quiet visibility-aware fallback protects a
  // browser that was suspended without continuously polling the database.
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const fallbackTimer = window.setInterval(refreshWhenVisible, 300_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  return liveUpdateNotice;
}
