"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProtectedLoginRole } from "@/lib/loginProtection";

type ProtectionResponse = {
  captchaRequired?: unknown;
  lockedUntil?: unknown;
};

function asFutureTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? value : null;
}

export function formatLoginLockout(lockedUntil: string | null, now = Date.now()) {
  const end = lockedUntil ? new Date(lockedUntil).getTime() : Number.NaN;
  if (!Number.isFinite(end) || end <= now) return null;
  const seconds = Math.ceil((end - now) / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `Too many failed attempts. Try again in ${minutes}:${String(seconds % 60).padStart(2, "0")}.`;
}

/** Shared client state for every protected login form. The API remains authoritative. */
export function useLoginProtection(role: ProtectedLoginRole) {
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const didLoadStatusRef = useRef(false);
  const protectionVersionRef = useRef(0);

  const loadStatus = useCallback(async (signal: AbortSignal) => {
    const requestVersion = protectionVersionRef.current;
    try {
      const response = await fetch(`/api/auth/login-protection/status?role=${role}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const data = await response.json() as ProtectionResponse & { success?: boolean };
      if (signal.aborted || requestVersion !== protectionVersionRef.current || !response.ok || !data.success) return;
      setCaptchaRequired(Boolean(data.captchaRequired));
      setLockedUntil(asFutureTimestamp(data.lockedUntil));
      setNow(Date.now());
    } catch {
      if (signal.aborted) return;
      // The login endpoint will fail closed if the guard cannot be read.
    }
  }, [role]);

  useEffect(() => {
    // Do one guarded fetch per mounted login page. In development, React Strict
    // Mode replays effects; the ref keeps that replay from resetting CAPTCHA.
    if (didLoadStatusRef.current) return;
    didLoadStatusRef.current = true;

    const controller = new AbortController();
    let started = false;
    const initialLoad = window.setTimeout(() => {
      started = true;
      void loadStatus(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(initialLoad);
      controller.abort();
      // Strict Mode's development-only effect replay cleans up before this
      // callback starts. Let its final setup own the single real request.
      if (!started) didLoadStatusRef.current = false;
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!lockedUntil) return;

    const end = new Date(lockedUntil).getTime();
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (!Number.isFinite(end) || end <= nextNow) {
        setLockedUntil(null);
        // The countdown is only presentation. Re-read the guard so expired
        // attempts/CAPTCHA state is decided by the server's clock and persists
        // correctly across refreshes.
        void loadStatus(new AbortController().signal);
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [lockedUntil, loadStatus]);

  const lockoutMessage = useMemo(() => formatLoginLockout(lockedUntil, now), [lockedUntil, now]);
  const isLocked = Boolean(lockoutMessage);

  const applyServerResult = useCallback((data: ProtectionResponse) => {
    // A login response is newer than the one-time page-load status request.
    // Ignore a late status response rather than hiding or resetting its CAPTCHA.
    protectionVersionRef.current += 1;
    const nextLockedUntil = asFutureTimestamp(data.lockedUntil);
    if (nextLockedUntil) {
      setNow(Date.now());
      setLockedUntil(nextLockedUntil);
    }
    if (data.captchaRequired) {
      setCaptchaRequired(true);
      setCaptchaToken("");
      setCaptchaResetSignal((value) => value + 1);
    }
  }, []);

  return {
    applyServerResult,
    captchaRequired,
    captchaResetSignal,
    captchaToken,
    isLocked,
    lockedUntil,
    lockoutMessage,
    setCaptchaToken,
  };
}
