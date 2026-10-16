"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

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
  const [verificationError, setVerificationError] = useState("");

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
        setVerificationError("");
        setVerified(true);
        return snapshot;
      }

      // Only an explicit authentication or authorization failure is a reason
      // to leave the dashboard. A temporary API/database failure during a
      // browser refresh must never turn into a client-side logout.
      if (response.status === 401 || response.status === 403) {
        setSession(null);
        window.location.replace("/login/guardian");
        return null;
      }
    } catch {
      // Keep the existing cookie and let the user retry a transient failure.
    }

    setVerificationError("We could not verify your session right now. Your session has not been signed out.");
    if (!background) setVerified(true);
    return null;
  }, []);
  const refreshSession = useCallback(() => verifySession({ background: true }), [verifySession]);

  // This gate remains mounted for every Parent dashboard route. Reconcile the
  // shared identity/student snapshot here instead of waiting for Dashboard,
  // Attendance, or Profile to be opened. `useSessionInvalidation` shares one
  // browser-local Supabase channel with the layout and active page, so this
  // adds a listener without opening a duplicate Realtime subscription.
  useSessionInvalidation((event) => {
    if (!session) return;
    if (event.scope === "accounts" || event.scope === "students") {
      void refreshSession();
    }
  });

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

  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
        <p role="alert" className="max-w-sm text-sm font-semibold leading-6 text-slate-600">
          {verificationError || "We could not verify your session right now."}
        </p>
        <button
          type="button"
          onClick={() => { void verifySession(); }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <ParentSessionContext.Provider value={{ session, refreshSession }}>
      {children}
    </ParentSessionContext.Provider>
  );
}
