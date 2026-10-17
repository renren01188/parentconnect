"use client";

import { useEffect, useRef } from "react";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SERVER_RENEW_THROTTLE_MS = 60 * 1000;

type DashboardRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

type IdleSessionTimeoutProps = {
  role: DashboardRole;
  logoutEndpoint: string;
  loginPath: string;
};

type SessionActivity = {
  sessionId: string;
  at: number;
};

function parseActivity(value: string | null): SessionActivity | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<SessionActivity>;
    return typeof parsed.sessionId === "string"
      && Number.isFinite(parsed.at)
      && Number(parsed.at) > 0
      ? { sessionId: parsed.sessionId, at: Number(parsed.at) }
      : null;
  } catch {
    return null;
  }
}

/**
 * Client-side feedback for the server-enforced sliding dashboard session.
 * The server renews the signed cookie only after actual user input. Therefore
 * a closed tab cannot extend a session just by being reopened later.
 */
export default function IdleSessionTimeout({ role, logoutEndpoint, loginPath }: IdleSessionTimeoutProps) {
  const timeoutId = useRef<number | null>(null);
  const isLoggingOut = useRef(false);
  const lastActivityAt = useRef(0);
  const lastServerRenewAt = useRef(0);

  useEffect(() => {
    let disposed = false;
    let sessionId: string | null = null;
    let activityStorageKey: string | null = null;
    let activityChannel: BroadcastChannel | null = null;

    const clearTimer = () => {
      if (timeoutId.current !== null) {
        window.clearTimeout(timeoutId.current);
        timeoutId.current = null;
      }
    };

    const replaceWithLogin = () => window.location.replace(loginPath);

    const expireSession = (timedOutInAnotherTab = false) => {
      if (isLoggingOut.current) return;
      isLoggingOut.current = true;
      clearTimer();

      if (timedOutInAnotherTab) {
        replaceWithLogin();
        return;
      }

      try {
        activityChannel?.postMessage({ type: "timeout" });
      } catch {
        // A same-session tab is optional; the server cookie remains decisive.
      }

      const controller = new AbortController();
      const abortId = window.setTimeout(() => controller.abort(), 5_000);
      void fetch(logoutEndpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
        signal: controller.signal,
      }).catch(() => undefined).finally(() => {
        window.clearTimeout(abortId);
        replaceWithLogin();
      });
    };

    const readStoredActivity = () => {
      if (!activityStorageKey || !sessionId) return 0;
      try {
        const stored = parseActivity(window.localStorage.getItem(activityStorageKey));
        return stored?.sessionId === sessionId ? stored.at : 0;
      } catch {
        return 0;
      }
    };

    const scheduleExpiration = () => {
      clearTimer();
      if (isLoggingOut.current || !lastActivityAt.current) return;

      lastActivityAt.current = Math.max(lastActivityAt.current, readStoredActivity());
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt.current);
      if (remaining <= 0) {
        expireSession();
        return;
      }

      timeoutId.current = window.setTimeout(() => {
        lastActivityAt.current = Math.max(lastActivityAt.current, readStoredActivity());
        if (Date.now() - lastActivityAt.current >= IDLE_TIMEOUT_MS) expireSession();
        else scheduleExpiration();
      }, remaining);
    };

    const configureSession = (nextSessionId: unknown, expiresAt: unknown) => {
      if (typeof nextSessionId !== "string" || !nextSessionId) return;
      const expiryMs = Number(expiresAt) * 1_000;
      const serverActivityAt = Number.isFinite(expiryMs) ? expiryMs - IDLE_TIMEOUT_MS : 0;

      if (sessionId !== nextSessionId) {
        activityChannel?.close();
        sessionId = nextSessionId;
        activityStorageKey = `parentconnect:dashboard-activity:${role}:${sessionId}`;
        try {
          activityChannel = new BroadcastChannel(`parentconnect:dashboard-activity:${role}:${sessionId}`);
          activityChannel.addEventListener("message", (event: MessageEvent<{ type?: string; at?: unknown }>) => {
            if (event.data?.type === "timeout") {
              expireSession(true);
              return;
            }
            if (event.data?.type === "activity" && Number.isFinite(Number(event.data.at))) {
              lastActivityAt.current = Math.max(lastActivityAt.current, Number(event.data.at));
              scheduleExpiration();
            }
          });
        } catch {
          activityChannel = null;
        }
      }

      const storedAt = readStoredActivity();
      // A delayed read-only GET must never overwrite a real interaction that
      // already triggered a renewal POST in this tab.
      if (!lastActivityAt.current) {
        lastActivityAt.current = Math.max(serverActivityAt, storedAt);
      } else {
        lastActivityAt.current = Math.max(lastActivityAt.current, serverActivityAt, storedAt);
      }
      scheduleExpiration();
    };

    const storeConfirmedActivity = (at: number) => {
      if (!sessionId || !activityStorageKey) return;
      try {
        window.localStorage.setItem(activityStorageKey, JSON.stringify({ sessionId, at }));
      } catch {
        // Storage is only used to coordinate tabs that share this session.
      }
      try {
        activityChannel?.postMessage({ type: "activity", at });
      } catch {
        // The active tab remains protected without BroadcastChannel support.
      }
    };

    const checkOrRenewServerSession = async (renew: boolean) => {
      try {
        const response = await fetch(`/api/auth/activity?role=${role}`, {
          method: renew ? "POST" : "GET",
          credentials: "same-origin",
          cache: "no-store",
          keepalive: renew,
        });
        if (disposed || isLoggingOut.current) return;
        if (response.status === 401) {
          expireSession();
          return;
        }
        if (!response.ok) return;
        const data = await response.json() as { sessionId?: unknown; expiresAt?: unknown };
        configureSession(data.sessionId, data.expiresAt);
        if (renew) storeConfirmedActivity(Date.now());
      } catch {
        // Do not sign out an active user only because their network dropped.
        // The short-lived signed cookie still blocks the next protected request.
      }
    };

    const recordActivity = () => {
      if (isLoggingOut.current) return;
      const now = Date.now();
      lastActivityAt.current = now;
      scheduleExpiration();

      if (now - lastServerRenewAt.current >= SERVER_RENEW_THROTTLE_MS) {
        lastServerRenewAt.current = now;
        void checkOrRenewServerSession(true);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (!activityStorageKey || event.key !== activityStorageKey) return;
      const stored = parseActivity(event.newValue);
      if (!stored || stored.sessionId !== sessionId) return;
      lastActivityAt.current = Math.max(lastActivityAt.current, stored.at);
      scheduleExpiration();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleExpiration();
    };
    const handlePageShow = () => scheduleExpiration();

    const activityEvents: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "pointermove", "scroll", "touchstart"];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { capture: true, passive: true });
    });
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // This verifies the current short-lived session but intentionally does not
    // count page load, Realtime traffic, or background requests as activity.
    void checkOrRenewServerSession(false);

    return () => {
      disposed = true;
      clearTimer();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity, { capture: true }));
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      activityChannel?.close();
    };
  }, [loginPath, logoutEndpoint, role]);

  return null;
}
