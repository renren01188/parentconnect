"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type RefreshReports = () => void | Promise<void>;

/**
 * Keeps each Reports inbox in sync with the report and message tables.
 *
 * This mirrors the Contact ICT subscription lifecycle, but coalesces the two
 * writes made for a sent message (the message row and its report timestamp).
 * The refresh callback updates data in place, so an open conversation and its
 * draft are never replaced by a page-level loading state.
 */
export function useReportMessagesRealtime(channelName: string, refreshReports: RefreshReports) {
  const [liveUpdateNotice, setLiveUpdateNotice] = useState<string | null>(null);
  const refreshRef = useRef(refreshReports);

  useEffect(() => {
    refreshRef.current = refreshReports;
  }, [refreshReports]);

  useEffect(() => {
    const client = supabaseBrowser;
    if (!client) {
      setLiveUpdateNotice("Live updates are unavailable in this browser. Reports will refresh automatically.");
      return;
    }

    let disposed = false;
    let refreshTimer: number | undefined;
    let refreshInFlight = false;
    let refreshQueued = false;

    const refresh = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      try {
        await refreshRef.current();
        if (!disposed) setLiveUpdateNotice(null);
      } catch {
        if (!disposed) setLiveUpdateNotice("Live updates are reconnecting. Existing reports remain available.");
      } finally {
        refreshInFlight = false;
        if (refreshQueued && !disposed) {
          refreshQueued = false;
          void refresh();
        }
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      // INSERT/UPDATE events for one action often arrive together. Waiting one
      // tick fetches the complete persisted conversation once and prevents UI
      // duplicates caused by racing partial snapshots.
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        void refresh();
      }, 75);
    };

    const channel = client
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_report_messages" }, scheduleRefresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveUpdateNotice(null);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setLiveUpdateNotice("Live updates are reconnecting. Existing reports remain available.");
          scheduleRefresh();
        }
      });

    const fallbackTimer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => {
      disposed = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.clearInterval(fallbackTimer);
      void client.removeChannel(channel);
    };
  }, [channelName]);

  return liveUpdateNotice;
}
