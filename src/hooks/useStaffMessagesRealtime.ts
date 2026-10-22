"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionInvalidation, type RealtimeConnectionStatus } from "@/hooks/useSessionInvalidation";
import type { RealtimeInvalidation } from "@/lib/subscribeRealtimeInvalidations";

type RefreshMessages = (background?: boolean) => Promise<boolean>;
type StaffMessagesRealtimeOptions = {
  /** Typing is ephemeral: deliver it to the open conversation, never refetch the inbox. */
  onConversationUpdate?: (invalidation: RealtimeInvalidation) => void;
};

/** Keeps Contact ICT inboxes current through the shared account subscription. */
export function useStaffMessagesRealtime(
  refreshMessages: RefreshMessages,
  options: StaffMessagesRealtimeOptions = {},
) {
  const [liveUpdateNotice, setLiveUpdateNotice] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>("CONNECTING");
  const refreshRef = useRef(refreshMessages);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const mountedRef = useRef(true);
  const connectionStatusRef = useRef<RealtimeConnectionStatus>("CONNECTING");
  const conversationUpdateRef = useRef<StaffMessagesRealtimeOptions["onConversationUpdate"]>(options.onConversationUpdate);

  useEffect(() => {
    refreshRef.current = refreshMessages;
  }, [refreshMessages]);

  useEffect(() => {
    conversationUpdateRef.current = options.onConversationUpdate;
  }, [options.onConversationUpdate]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshAndClearNotice = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return false;
    }
    refreshInFlightRef.current = true;
    try {
      const recovered = await refreshRef.current(true);
      if (mountedRef.current && recovered && connectionStatusRef.current === "SUBSCRIBED") {
        setLiveUpdateNotice(null);
      }
      return recovered;
    } catch {
      if (mountedRef.current) setLiveUpdateNotice("Live updates are reconnecting. Existing messages remain available.");
      return false;
    } finally {
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current && mountedRef.current) {
        refreshQueuedRef.current = false;
        void refreshAndClearNotice();
      }
    }
  }, []);

  useSessionInvalidation(
    (invalidation) => {
      if (invalidation.scope === "staff-messages" && invalidation.kind === "typing") {
        conversationUpdateRef.current?.(invalidation);
        return;
      }
      if (invalidation.scope === "staff-messages" || !invalidation.scope) {
        void refreshAndClearNotice();
      }
    },
    (status) => {
      connectionStatusRef.current = status;
      if (!mountedRef.current) return;
      setConnectionStatus(status);
      if (status === "SUBSCRIBED") {
        setLiveUpdateNotice(null);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setLiveUpdateNotice("Live updates are reconnecting. Checking for new messages automatically.");
        void refreshAndClearNotice();
      }
    },
  );

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAndClearNotice();
    };
    // Broadcast remains the normal immediate delivery path. If a browser,
    // extension, or missing public key prevents its WebSocket from joining,
    // recover the protected server snapshot every 30 seconds while visible.
    // Status changes already trigger an immediate refresh, so this remains a
    // bounded degraded-state safeguard rather than a request storm.
    const fallbackRefresh = window.setInterval(
      refreshWhenVisible,
      connectionStatus === "SUBSCRIBED" ? 300_000 : 30_000,
    );
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(fallbackRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [connectionStatus, refreshAndClearNotice]);

  return liveUpdateNotice;
}
