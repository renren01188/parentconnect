"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type RefreshMessages = (background?: boolean) => Promise<boolean>;

/** Keeps staff-message inboxes usable while the Realtime socket reconnects. */
export function useStaffMessagesRealtime(channelName: string, refreshMessages: RefreshMessages) {
  const [liveUpdateNotice, setLiveUpdateNotice] = useState<string | null>(null);

  useEffect(() => {
    const client = supabaseBrowser;
    if (!client) {
      setLiveUpdateNotice("Live updates are unavailable in this browser. Messages can still be refreshed automatically.");
      return;
    }

    let disposed = false;
    let recoveryInFlight = false;
    let retryTimer: number | undefined;

    const refreshAndClearNotice = async () => {
      const recovered = await refreshMessages(true);
      if (!disposed && recovered) setLiveUpdateNotice(null);
      return recovered;
    };

    const retryConnection = async () => {
      if (recoveryInFlight) return;
      recoveryInFlight = true;
      const firstAttempt = await refreshAndClearNotice();
      if (firstAttempt || disposed) {
        recoveryInFlight = false;
        return;
      }

      retryTimer = window.setTimeout(async () => {
        const secondAttempt = await refreshAndClearNotice();
        if (!disposed && !secondAttempt) {
          setLiveUpdateNotice("Live updates are reconnecting. Existing messages remain available and will refresh automatically.");
        }
        recoveryInFlight = false;
      }, 1_200);
    };

    const channel = client
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_messages" }, () => {
        void refreshAndClearNotice();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveUpdateNotice(null);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void retryConnection();
        }
      });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAndClearNotice();
    };
    const fallbackRefresh = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.clearInterval(fallbackRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void client.removeChannel(channel);
    };
  }, [channelName, refreshMessages]);

  return liveUpdateNotice;
}
