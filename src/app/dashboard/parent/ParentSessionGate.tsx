"use client";

import { useCallback, useEffect, useState } from "react";

export default function ParentSessionGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState(false);

  const verifySession = useCallback(async () => {
    setVerified(false);

    try {
      const response = await fetch("/api/parents/me", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.success && data?.parent) {
        setVerified(true);
        return;
      }
    } catch {
      // The login page is the safe destination when session verification fails.
    }

    // A document navigation discards any restored Parent route state before
    // showing the sign-in screen.
    window.location.replace("/login/guardian");
  }, []);

  useEffect(() => {
    void verifySession();

    // A browser can restore this route from its back/forward cache after a
    // logout or cookie expiry. Re-verify before showing previously rendered
    // Parent content in that case.
    const handlePageShow = () => {
      void verifySession();
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [verifySession]);

  if (!verified) {
    return (
      <main
        aria-busy="true"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-sm font-semibold text-slate-500"
      >
        Verifying session…
      </main>
    );
  }

  return <>{children}</>;
}
