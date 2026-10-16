"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import type { ChannelStatus, RealtimeInvalidation } from "@/lib/subscribeRealtimeInvalidations";

type RefreshReports = () => void | Promise<void>;
type RefreshReport = (invalidation: RealtimeInvalidation) => void | Promise<void>;

type ReportRealtimeOptions = {
  /** Receives report-scoped events without replacing the selected conversation. */
  onReportUpdate?: RefreshReport;
  /** Receives a durable report-status event without waiting for message batching. */
  onReportStatusUpdate?: RefreshReport;
  /** Refreshes a role's authorized ticket list and ticket-derived badges in place. */
  onTicketUpdate?: RefreshReports;
  /** Delivers a standalone staff-conversation event to the mounted inbox. */
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
  const reportStatusUpdateRef = useRef<RefreshReport | undefined>(options.onReportStatusUpdate);
  const ticketUpdateRef = useRef<RefreshReports | undefined>(options.onTicketUpdate);
  const staffMessageUpdateRef = useRef<RefreshReport | undefined>(options.onStaffMessageUpdate);
  const studentReportUpdateRef = useRef<RefreshReports | undefined>(options.onStudentReportUpdate);
  const connectionStatusRef = useRef<ReportRealtimeOptions["onConnectionStatus"]>(options.onConnectionStatus);
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<number | undefined>(undefined);
  const reportTimerRef = useRef<number | undefined>(undefined);
  const pendingReportUpdateRef = useRef<RealtimeInvalidation | null>(null);
  // Durable message Broadcasts can arrive in a burst while the selected
  // conversation is loading. Process them one at a time so a later event
  // cannot be lost in the small window where an earlier detail request is
  // completing and its page-level request queue is being cleared.
  const reportRefreshInFlightRef = useRef(false);
  const queuedReportInvalidationRef = useRef<RealtimeInvalidation | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refreshReports;
  }, [refreshReports]);

  useEffect(() => {
    reportUpdateRef.current = options.onReportUpdate;
  }, [options.onReportUpdate]);

  useEffect(() => {
    reportStatusUpdateRef.current = options.onReportStatusUpdate;
  }, [options.onReportStatusUpdate]);

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

  // A workflow handoff changes badges, ownership, the status timeline, and
  // the reply controls at once. Do not make it wait behind message batching:
  // the parent must see an Adviser → Guidance escalation as soon as the
  // durable status event reaches its authenticated Supabase channel.
  const refreshReportStatus = useCallback(async (invalidation: RealtimeInvalidation) => {
    try {
      if (reportStatusUpdateRef.current) await reportStatusUpdateRef.current(invalidation);
      else await refresh();
      if (mountedRef.current) setLiveUpdateNotice(null);
    } catch {
      if (mountedRef.current) setLiveUpdateNotice("Live updates are reconnecting. Existing reports remain available.");
      scheduleRefresh();
    }
  }, [refresh, scheduleRefresh]);

  const refreshReport = useCallback(async (invalidation: RealtimeInvalidation) => {
    // Typing is ephemeral and belongs to the active composer only. Never
    // queue it behind a network refresh or delay clearing the indicator.
    const isDurableMessage = invalidation.kind === "message";
    if (isDurableMessage && reportRefreshInFlightRef.current) {
      // One authoritative follow-up read is enough: it happens after the
      // current read and therefore contains every report reply committed up
      // to the most recent Broadcast.
      queuedReportInvalidationRef.current = invalidation;
      return;
    }

    if (isDurableMessage) reportRefreshInFlightRef.current = true;
    try {
      if (reportUpdateRef.current) await reportUpdateRef.current(invalidation);
      else await refresh();
      if (mountedRef.current) setLiveUpdateNotice(null);
    } catch {
      // The normal authorized inbox snapshot is the safe fallback for a stale
      // ID or a report that is no longer accessible to this account.
      scheduleRefresh();
    } finally {
      if (isDurableMessage) {
        reportRefreshInFlightRef.current = false;
        const queuedInvalidation = queuedReportInvalidationRef.current;
        queuedReportInvalidationRef.current = null;
        if (queuedInvalidation && mountedRef.current) {
          // Start the follow-up asynchronously so the completed callback can
          // finish cleanly, while still preserving event order for the open
          // conversation.
          void refreshReport(queuedInvalidation);
        }
      }
    }
  }, [refresh, scheduleRefresh]);

  const scheduleReportRefresh = useCallback((invalidation: RealtimeInvalidation) => {
    if (invalidation.kind === "typing") {
      void refreshReport(invalidation);
      return;
    }
    if (invalidation.kind === "message") {
      // A durable message has already committed before its data-free Supabase
      // Broadcast is sent. Fetch the affected conversation immediately rather
      // than waiting for summary batching, so the recipient sees it in the
      // open report thread without a navigation or full-page refresh.
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
      if (invalidation.kind === "status" && reportStatusUpdateRef.current) {
        void refreshReportStatus(invalidation);
        return;
      }
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
      // A direct staff message has a canonical conversation key. Give the
      // mounted Reports inbox first chance to reload that view immediately so
      // an already-open thread receives the durable row without a navigation
      // or a reply from the recipient. Keep the full inbox refresh as a safe
      // fallback for a stale or inaccessible conversation.
      if (staffMessageUpdateRef.current) {
        void Promise.resolve(staffMessageUpdateRef.current(invalidation)).catch(scheduleRefresh);
      } else {
        scheduleRefresh();
      }
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
