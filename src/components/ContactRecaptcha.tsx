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
  resetSignal: number;
  onTokenChange: (token: string) => void;
};

/** Public reCAPTCHA widget. The secret key stays in the server verifier. */
export function ContactRecaptcha({ resetSignal, onTokenChange }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [widgetRendered, setWidgetRendered] = useState(false);
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
    // The Login tab may already have loaded Google's shared script. Next.js
    // correctly deduplicates it, but a newly mounted Sign Up widget then does
    // not receive that script's original onLoad callback.
    const readinessTimer = window.setTimeout(() => {
      if (typeof window.grecaptcha?.render === "function") setLoaded(true);
    }, 0);
    return () => window.clearTimeout(readinessTimer);
  }, []);

  const render = useCallback(() => {
    const captcha = window.grecaptcha;
    if (widgetIdRef.current !== null) return true;
    if (!loaded || !containerRef.current || !SITE_KEY || typeof captcha?.render !== "function") return false;

    widgetIdRef.current = captcha.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token) => {
        setError("");
        notifyTokenChange(token);
      },
      "expired-callback": () => {
        notifyTokenChange("");
        setError("CAPTCHA expired. Please complete it again.");
      },
      "error-callback": () => {
        notifyTokenChange("");
        setError("CAPTCHA could not be verified. Please check your connection and try again.");
      },
    });
    setWidgetRendered(true);
    return true;
  }, [loaded, notifyTokenChange]);

  useEffect(() => {
    if (!loaded) return;

    // Google's loader can expose `grecaptcha` before its widget API is ready.
    // Wait for `render` itself rather than treating the object as fully loaded.
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
  }, [loaded, render]);

  useEffect(() => {
    // Reset only for a deliberate failed-submission signal. In particular,
    // changes to the parent component or the CAPTCHA loader must not erase a
    // token while the parent is solving the widget.
    if (widgetIdRef.current === null) return;
    if (lastResetSignalRef.current === resetSignal) return;

    lastResetSignalRef.current = resetSignal;
    const captcha = window.grecaptcha;
    if (typeof captcha?.reset === "function") captcha.reset(widgetIdRef.current);
    notifyTokenChange("");
  }, [notifyTokenChange, resetSignal]);

  return (
    <div>
      {SITE_KEY && (
        <Script
          src="https://www.google.com/recaptcha/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setLoaded(true)}
          onError={() => setError("CAPTCHA could not load. Please check your connection and try again.")}
        />
      )}
      {!SITE_KEY ? (
        <p role="alert" className="text-sm font-medium text-red-600">CAPTCHA is unavailable. Please try again later.</p>
      ) : (
        <>
          {!widgetRendered && !error && <p className="mb-2 text-sm text-slate-500">Loading security verification...</p>}
          <div ref={containerRef} />
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
