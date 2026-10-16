"use client";

import { useEffect, useRef } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_BROADCAST_THROTTLE_MS = 5 * 1000;

type DashboardRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

type IdleSessionTimeoutProps = {
  role: DashboardRole;
  logoutEndpoint: string;
  loginPath: string;
};

function toTimestamp(value: string | null) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

/**
 * Ends an idle dashboard session after 30 minutes without user input.
 *
 * Activity is shared only between tabs for the same role, so working in one
 * Parent tab does not unexpectedly end another active Parent tab. Realtime
 * events and background fetches deliberately do not reset this timer.
 */
export default function IdleSessionTimeout({
  role,
  logoutEndpoint,
  loginPath,
}: IdleSessionTimeoutProps) {
  const timeoutId = useRef<number | null>(null);
  const isLoggingOut = useRef(false);
  const lastActivityAt = useRef(0);
  const lastBroadcastAt = useRef(0);
  const lastTimerResetAt = useRef(0);

  useEffect(() => {
    const activityStorageKey = `parentconnect:dashboard-activity:${role}`;
    const activityChannelName = `parentconnect:dashboard-activity:${role}`;
    let activityChannel: BroadcastChannel | null = null;

    try {
      activityChannel = new BroadcastChannel(activityChannelName);
    } catch {
      // BroadcastChannel is not required for the local timeout to work.
    }

    const clearTimer = () => {
      if (timeoutId.current !== null) {
        window.clearTimeout(timeoutId.current);
        timeoutId.current = null;
      }
    };

    const replaceWithLogin = () => {
      window.location.replace(loginPath);
    };

    const readStoredActivity = () => {
      try {
        return toTimestamp(window.localStorage.getItem(activityStorageKey));
      } catch {
        return 0;
      }
    };

    const announceTimeout = () => {
      try {
        activityChannel?.postMessage({ type: "timeout" });
      } catch {
        // Another same-role tab may not be available to notify.
      }
    };

    const expireSession = (timedOutInAnotherTab = false) => {
      if (isLoggingOut.current) return;

      isLoggingOut.current = true;
      clearTimer();

      if (timedOutInAnotherTab) {
        replaceWithLogin();
        return;
      }

      announceTimeout();

      const controller = new AbortController();
      const abortId = window.setTimeout(() => controller.abort(), 5_000);

      void fetch(logoutEndpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        signal: controller.signal,
      })
        .catch(() => {
          // The login redirect still protects the visible dashboard if the
          // network is unavailable. A later authenticated request will retain
          // the normal server-side session validation behavior.
        })
        .finally(() => {
          window.clearTimeout(abortId);
          replaceWithLogin();
        });
    };

    const scheduleExpiration = () => {
      clearTimer();
      if (isLoggingOut.current) return;

      const latestActivity = Math.max(lastActivityAt.current, readStoredActivity());
      lastActivityAt.current = latestActivity;
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - latestActivity);

      if (remaining <= 0) {
        expireSession();
        return;
      }

      timeoutId.current = window.setTimeout(() => {
        const latestAtTimeout = Math.max(lastActivityAt.current, readStoredActivity());
        lastActivityAt.current = latestAtTimeout;

        if (Date.now() - latestAtTimeout >= IDLE_TIMEOUT_MS) {
          expireSession();
          return;
        }

        scheduleExpiration();
      }, remaining);
    };

    const recordActivity = () => {
      if (isLoggingOut.current) return;

      const now = Date.now();
      lastActivityAt.current = now;

      // Pointer movement can fire many times per second. The timeout callback
      // always rechecks `lastActivityAt`, so resetting the browser timer at
      // most once per second preserves the deadline without needless churn.
      if (now - lastTimerResetAt.current >= 1_000) {
        lastTimerResetAt.current = now;
        scheduleExpiration();
      }

      if (now - lastBroadcastAt.current < ACTIVITY_BROADCAST_THROTTLE_MS) return;
      lastBroadcastAt.current = now;

      try {
        window.localStorage.setItem(activityStorageKey, String(now));
      } catch {
        // Storage can be disabled; the current tab remains protected.
      }

      try {
        activityChannel?.postMessage({ type: "activity", at: now });
      } catch {
        // Cross-tab activity sync is an enhancement, not a requirement.
      }
    };

    const syncActivity = (timestamp: number) => {
      if (!Number.isFinite(timestamp) || timestamp <= lastActivityAt.current) return;
      lastActivityAt.current = timestamp;
      scheduleExpiration();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === activityStorageKey) syncActivity(toTimestamp(event.newValue));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleExpiration();
    };

    const handlePageShow = () => scheduleExpiration();

    const handleChannelMessage = (event: MessageEvent<{ type?: string; at?: unknown }>) => {
      if (event.data?.type === "timeout") {
        expireSession(true);
        return;
      }

      if (event.data?.type === "activity") syncActivity(Number(event.data.at));
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "keydown",
      "pointerdown",
      "pointermove",
      "scroll",
      "touchstart",
    ];

    // Opening a dashboard after a deliberate navigation is activity. It also
    // prevents a stale localStorage timestamp from affecting a new login.
    recordActivity();

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { capture: true, passive: true });
    });
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    activityChannel?.addEventListener("message", handleChannelMessage);

    return () => {
      clearTimer();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity, { capture: true });
      });
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      activityChannel?.removeEventListener("message", handleChannelMessage);
      activityChannel?.close();
    };
  }, [loginPath, logoutEndpoint, role]);

  return null;
}
