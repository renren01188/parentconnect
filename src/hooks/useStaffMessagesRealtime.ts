"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { subscribeRealtimeInvalidations } from "@/lib/subscribeRealtimeInvalidations";

type RefreshMessages = (background?: boolean) => Promise<boolean>;

/** Keeps staff-message inboxes usable while the Realtime socket reconnects. */
export function useStaffMessagesRealtime(channelName: string, refreshMessages: RefreshMessages) {
  const [liveUpdateNotice, setLiveUpdateNotice] = useState<string | null>(null);

  useEffect(() => {
    const client = supabaseBrowser;
    if (!client) {
      const noticeTimer = window.setTimeout(() => {
        setLiveUpdateNotice("Live updates are unavailable in this browser. Messages can still be refreshed automatically.");
      }, 0);
      return () => window.clearTimeout(noticeTimer);
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

    let channel: Awaited<ReturnType<typeof subscribeRealtimeInvalidations>> = null;
    void subscribeRealtimeInvalidations(client, () => {
      void refreshAndClearNotice();
    }, (status) => {
      if (status === "SUBSCRIBED") {
        setLiveUpdateNotice(null);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        void retryConnection();
      }
    }).then((connectedChannel) => {
      if (disposed) {
        if (connectedChannel) void client.removeChannel(connectedChannel);
        return;
      }
      channel = connectedChannel;
      if (!channel) {
        setLiveUpdateNotice("Updates will refresh automatically. Existing messages remain available.");
      }
    });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAndClearNotice();
    };
    const fallbackRefresh = window.setInterval(refreshWhenVisible, 300_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.clearInterval(fallbackRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (channel) void client.removeChannel(channel);
    };
  }, [channelName, refreshMessages]);

  return liveUpdateNotice;
}
