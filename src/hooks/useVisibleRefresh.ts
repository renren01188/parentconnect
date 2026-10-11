"use client";

import { useEffect, useRef } from "react";

type Refresh = () => void | Promise<void>;

/**
 * Keeps server-authorized data fresh without polling hidden browser tabs.
 *
 * The application uses secure HTTP-only custom sessions, so API routes remain
 * the source of truth when a browser cannot receive a Supabase Realtime event.
 */
// Realtime invalidations normally keep data current. This is only a recovery
// path for a dropped websocket, so it must not turn every open dashboard into
// a one-minute polling loop.
export function useVisibleRefresh(refresh: Refresh, intervalMs = 300_000) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let refreshInFlight = false;

    const run = () => {
      if (document.visibilityState !== "visible" || refreshInFlight) return;
      refreshInFlight = true;
      Promise.resolve(refreshRef.current())
        .catch(() => null)
        .finally(() => {
          refreshInFlight = false;
        });
    };

    const refreshWhenVisible = () => run();
    const interval = window.setInterval(refreshWhenVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [intervalMs]);
}
