"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { subscribeRealtimeInvalidations } from "@/lib/subscribeRealtimeInvalidations";

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

    let channel: Awaited<ReturnType<typeof subscribeRealtimeInvalidations>> = null;
    void subscribeRealtimeInvalidations(client, scheduleRefresh, (status) => {
      if (status === "SUBSCRIBED") setLiveUpdateNotice(null);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setLiveUpdateNotice("Live updates are reconnecting. Existing reports remain available.");
        scheduleRefresh();
      }
    }).then((connectedChannel) => {
      if (disposed) {
        if (connectedChannel) void client.removeChannel(connectedChannel);
        return;
      }
      channel = connectedChannel;
      if (!channel) {
        setLiveUpdateNotice("Updates will refresh automatically. Existing reports remain available.");
      }
    });

    // Realtime is the normal update path. A quiet, visibility-aware fallback
    // protects users whose browser/network drops the websocket without making
    // every open Reports page poll the database continuously.
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const fallbackTimer = window.setInterval(refreshWhenVisible, 300_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.clearInterval(fallbackTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (channel) void client.removeChannel(channel);
    };
  }, [channelName]);

  return liveUpdateNotice;
}
