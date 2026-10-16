"use client";

import { useRef } from "react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

type RevocableRole = "parent" | "adviser" | "guidance" | "principal";

/**
 * Receives the account-specific Broadcast emitted after an account's session
 * is revoked. The server endpoint clears only this role's cookie before the
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
