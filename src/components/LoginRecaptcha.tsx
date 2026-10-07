"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";

type RecaptchaApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => number;
  reset: (widgetId?: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

type Props = {
  required: boolean;
  resetSignal: number;
  onTokenChange: (token: string) => void;
};

/** Google reCAPTCHA v2 widget used only after the server requires it. */
export function LoginRecaptcha({ required, resetSignal, onTokenChange }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const lastResetSignalRef = useRef(resetSignal);
  const onTokenChangeRef = useRef(onTokenChange);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  const notifyTokenChange = useCallback((token: string) => {
    onTokenChangeRef.current(token);
  }, []);

  useEffect(() => {
    // Sign Up may have loaded Google's shared script first. A deduplicated
    // Next.js Script does not replay its original onLoad event for this
    // component, so detect the already-ready API directly.
    const readinessTimer = window.setTimeout(() => {
      if (required && typeof window.grecaptcha?.render === "function") setLoaded(true);
    }, 0);
    return () => window.clearTimeout(readinessTimer);
  }, [required]);

  const resetWidget = useCallback(() => {
    if (widgetIdRef.current === null) return false;
    const captcha = window.grecaptcha;
    if (typeof captcha?.reset !== "function") return false;

    captcha.reset(widgetIdRef.current);
    setError("");
    notifyTokenChange("");
    return true;
  }, [notifyTokenChange]);

  const render = useCallback(() => {
    if (widgetIdRef.current !== null) return true;
    if (!required || !loaded || !containerRef.current) return false;
    if (!SITE_KEY) {
      return false;
    }
    const captcha = window.grecaptcha;
    if (typeof captcha?.render !== "function") return false;

    widgetIdRef.current = captcha.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token) => {
        setError("");
        notifyTokenChange(token);
      },
      "expired-callback": () => {
        resetWidget();
        setError("CAPTCHA expired. Please complete it again.");
      },
      "error-callback": () => {
        notifyTokenChange("");
        setError("CAPTCHA could not be verified. Please check your connection and try again.");
      },
    });
    return true;
  }, [loaded, notifyTokenChange, required, resetWidget]);

  useEffect(() => {
    if (!required) {
      notifyTokenChange("");
      return;
    }
    if (!loaded) return;

    // Google's loader can expose `grecaptcha` before its widget API is ready.
    let attempts = 0;
    let retryId: number | undefined;
    const initialize = () => {
      if (render()) return;

      attempts += 1;
      if (attempts >= 50) {
        setError("CAPTCHA could not initialize. Please refresh and try again.");
        return;
      }
      retryId = window.setTimeout(initialize, 100);
    };

    initialize();
    return () => {
      if (retryId !== undefined) window.clearTimeout(retryId);
    };
  }, [loaded, notifyTokenChange, render, required]);

  useEffect(() => {
    // A signal is emitted only after a failed login attempt. Capture the
    // initial signal so showing the widget never resets a CAPTCHA in progress.
    if (!required || widgetIdRef.current === null) {
      lastResetSignalRef.current = resetSignal;
      return;
    }
    if (lastResetSignalRef.current === resetSignal) return;

    lastResetSignalRef.current = resetSignal;
    const resetTimer = window.setTimeout(() => resetWidget(), 0);
    return () => window.clearTimeout(resetTimer);
  }, [required, resetSignal, resetWidget]);

  if (!required) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      {SITE_KEY && (
        <Script
          src="https://www.google.com/recaptcha/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setLoaded(true)}
          onError={() => setError("CAPTCHA could not load. Please check your connection and try again.")}
        />
      )}
      <p className="mb-2 text-xs font-semibold text-amber-800">Security verification is required after failed login attempts.</p>
      {!SITE_KEY ? (
        <p role="alert" className="text-xs font-medium text-red-600">CAPTCHA is unavailable. Please contact the school administrator.</p>
      ) : (
        <div ref={containerRef} />
      )}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
