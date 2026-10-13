"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

type RefreshMessages = (background?: boolean) => Promise<boolean>;

/** Keeps Contact ICT inboxes current through the shared account subscription. */
export function useStaffMessagesRealtime(refreshMessages: RefreshMessages) {
  const [liveUpdateNotice, setLiveUpdateNotice] = useState<string | null>(null);
  const refreshRef = useRef(refreshMessages);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    refreshRef.current = refreshMessages;
  }, [refreshMessages]);

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
      if (mountedRef.current && recovered) setLiveUpdateNotice(null);
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

  useSessionInvalidation((invalidation) => {
    if (invalidation.scope === "staff-messages" || !invalidation.scope) {
      void refreshAndClearNotice();
    }
  });

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAndClearNotice();
    };
    const fallbackRefresh = window.setInterval(refreshWhenVisible, 300_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(fallbackRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshAndClearNotice]);

  return liveUpdateNotice;
}
