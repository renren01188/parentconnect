"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ParentSessionSnapshot = {
  success: true;
  parent: {
    id: number;
    name: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    suffix?: string;
    email?: string;
    phone?: string;
    profilePicture?: string;
  };
  student?: unknown;
  students?: unknown[];
};

type ParentSessionContextValue = {
  session: ParentSessionSnapshot | null;
  refreshSession: () => Promise<ParentSessionSnapshot | null>;
};

const ParentSessionContext = createContext<ParentSessionContextValue>({
  session: null,
  refreshSession: async () => null,
});

/** Reuses the layout's authenticated Parent snapshot; it never bypasses server checks. */
export function useParentSession() {
  return useContext(ParentSessionContext);
}

export default function ParentSessionGate({ children }: { children: React.ReactNode }) {
  const [verified, setVerified] = useState(false);
  const [session, setSession] = useState<ParentSessionSnapshot | null>(null);

  const verifySession = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) setVerified(false);

    try {
      const response = await fetch("/api/parents/me", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.success && data?.parent) {
        const snapshot = data as ParentSessionSnapshot;
        setSession(snapshot);
        setVerified(true);
        return snapshot;
      }
    } catch {
      // The login page is the safe destination when session verification fails.
    }

    setSession(null);
    // A document navigation discards any restored Parent route state before
    // showing the sign-in screen.
    window.location.replace("/login/guardian");
    return null;
  }, []);
  const refreshSession = useCallback(() => verifySession({ background: true }), [verifySession]);

  useEffect(() => {
    const initialVerification = window.setTimeout(() => {
      void verifySession();
    }, 0);

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void verifySession({ background: true });
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.clearTimeout(initialVerification);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [verifySession]);

  if (!verified || !session) {
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

  return (
    <ParentSessionContext.Provider value={{ session, refreshSession }}>
      {children}
    </ParentSessionContext.Provider>
  );
}
