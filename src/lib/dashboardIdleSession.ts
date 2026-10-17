import { JWTPayload, SignJWT } from "jose";
import { getJwtSecret } from "@/lib/authSecret";

/**
 * Dashboard authentication is a sliding session: every verified user action
 * renews this short-lived cookie, while background fetches and Realtime events
 * deliberately do not. This makes the expiry enforceable even after a tab is
 * closed, suspended, or restored from the browser back-forward cache.
 */
export const DASHBOARD_IDLE_TIMEOUT_SECONDS = 30 * 60;
export const DASHBOARD_IDLE_SESSION_VERSION = 1;

export type DashboardRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

export const dashboardSessionCookies: Record<DashboardRole, string> = {
  parent: "parent_token",
  adviser: "adviser_token",
  guidance: "guidance_token",
  principal: "principal_token",
  ict: "ict_token",
};

export const dashboardSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: DASHBOARD_IDLE_TIMEOUT_SECONDS,
  path: "/",
};

export function isCurrentDashboardIdleSession(payload: JWTPayload) {
  return payload.dashboardSessionVersion === DASHBOARD_IDLE_SESSION_VERSION
    && typeof payload.sessionId === "string"
    && payload.sessionId.length >= 16;
}

type SessionPayload = Record<string, unknown>;

/** Issue or renew one role-scoped dashboard session without extending another session. */
export async function issueDashboardIdleSession(payload: SessionPayload) {
  const { iat: _iat, exp: _exp, nbf: _nbf, jti: _jti, ...claims } = payload;
  const sessionId = typeof claims.sessionId === "string" && claims.sessionId.length >= 16
    ? claims.sessionId
    : crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1_000) + DASHBOARD_IDLE_TIMEOUT_SECONDS;

  const token = await new SignJWT({
    ...claims,
    dashboardSessionVersion: DASHBOARD_IDLE_SESSION_VERSION,
    sessionId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());

  return { token, sessionId, expiresAt };
}
