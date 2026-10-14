"use client";

import { useRef } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

type RevocableRole = "parent" | "adviser" | "guidance";

/**
 * Receives the account-specific Broadcast emitted after ICT verifies a new
 * password.  The server endpoint clears only this role's cookie before the
 * browser moves to its login page; it never touches the ICT session.
 */
export default function SessionRevocationGuard({ role, loginPath }: { role: RevocableRole; loginPath: string }) {
  const redirecting = useRef(false);

  useSessionInvalidation(({ scope, sessionRevoked }) => {
    if (scope !== "accounts" || !sessionRevoked || redirecting.current) return;
    redirecting.current = true;
    void fetch(`/api/auth/session?role=${role}`, {
      cache: "no-store",
      credentials: "same-origin",
    }).finally(() => window.location.replace(loginPath));
  });

  return null;
}
