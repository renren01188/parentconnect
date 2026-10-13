"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Coalesces a short burst of Broadcast events into one authorized refresh.
 * If another event arrives while the request is running, exactly one follow-up
 * refresh is scheduled after it settles. This keeps RFID arrival bursts from
 * causing overlapping dashboard snapshots.
 */
export function useDebouncedRealtimeRefresh(refresh: () => void | Promise<void>, delayMs = 180) {
  const refreshRef = useRef(refresh);
  const timerRef = useRef<number | undefined>(undefined);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const schedule = useCallback(() => {
    if (timerRef.current !== undefined) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }

      inFlightRef.current = true;
      Promise.resolve(refreshRef.current())
        .catch(() => null)
        .finally(() => {
          inFlightRef.current = false;
          if (queuedRef.current) {
            queuedRef.current = false;
            schedule();
          }
        });
    }, delayMs);
  }, [delayMs]);

  useEffect(() => () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
  }, []);

  return schedule;
}
