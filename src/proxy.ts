import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/authSecret";
import { dashboardSessionCookies, DashboardRole, isCurrentDashboardIdleSession } from "@/lib/dashboardIdleSession";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { dashboardPath, internalPathnameForOpaqueRoute, PUBLIC_ROUTE_ALIASES } from "@/lib/routeAliases";
import {
  PASSWORD_SESSION_REVOCATION_ACTIONS,
  isTokenRevokedByPasswordChange,
  passwordSessionAuditRole,
  type PasswordSessionRole,
} from "@/lib/passwordSessionRevocation";

const SECRET = getJwtSecret();

const dashboardRoutes: Record<DashboardRole, { cookie: string; dashboard: string; login: string; setPassword: string }> = {
  adviser: {
    cookie: "adviser_token",
    dashboard: dashboardPath("adviser"),
    login: "/login/adviser",
    setPassword: "/set-password/adviser",
  },
  guidance: {
    cookie: "guidance_token",
    dashboard: dashboardPath("guidance"),
    login: "/login/guidance",
    setPassword: "/set-password/guidance",
  },
  principal: {
    cookie: "principal_token",
    dashboard: dashboardPath("principal"),
    login: "/login/principal",
    setPassword: "/set-password/principal",
  },
  ict: {
    cookie: "ict_token",
    dashboard: dashboardPath("ict"),
    login: "/login/ict",
    setPassword: "/set-password/ict",
  },
  parent: {
    cookie: "parent_token",
    dashboard: dashboardPath("parent"),
    login: "/login/guardian",
    setPassword: "/login/guardian/set-password",
  },
};

/**
 * If someone is already signed in under a different role, do not present a
 * second role's login form. Send them to the dashboard (or password setup)
 * that their verified session is authorized to use instead.
 */
async function getAuthorizedDashboard(req: NextRequest, excludedRole?: DashboardRole) {
  for (const [role, route] of Object.entries(dashboardRoutes) as [DashboardRole, typeof dashboardRoutes[DashboardRole]][]) {
    if (role === excludedRole) continue;

    const token = req.cookies.get(route.cookie)?.value;
    if (!token) continue;

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== role || !isCurrentDashboardIdleSession(verified.payload)) continue;

      if (verified.payload.passwordSet === false) {
        if (role === "parent" && verified.payload.temporaryPasswordVerified !== true) {
          return PUBLIC_ROUTE_ALIASES.parentRecovery.verifyTemporaryPassword;
        }
        return route.setPassword;
      }

      return route.dashboard;
    } catch {
      // The target dashboard guard will clear an expired cookie for its role.
    }
  }

  return null;
}

async function redirectToAuthorizedDashboardOrLogin(req: NextRequest, role: DashboardRole, clearCookie = false) {
  const redirectTo = (await getAuthorizedDashboard(req, clearCookie ? role : undefined)) ?? dashboardRoutes[role].login;
  const response = NextResponse.redirect(new URL(redirectTo, req.url));
  if (clearCookie) response.cookies.delete(dashboardRoutes[role].cookie);
  return response;
}

function parentApiAuthFailure(message: string, status: number, clearSession = false) {
  const response = NextResponse.json({ success: false, message }, { status });
  if (clearSession) response.cookies.delete("parent_token");
  return response;
}

/**
 * API handlers already perform role authorization. This middleware adds one
 * shared session-expiry boundary so an expired cookie cannot reach a handler
 * that still has legacy, route-local token parsing.
 */
async function expiredDashboardApiSession(req: NextRequest) {
  for (const role of Object.keys(dashboardSessionCookies) as DashboardRole[]) {
    const cookieName = dashboardSessionCookies[role];
    const token = req.cookies.get(cookieName)?.value;
    if (!token) continue;

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== role || !isCurrentDashboardIdleSession(verified.payload)) {
        throw new Error("Invalid dashboard session");
      }
    } catch {
      const response = NextResponse.json(
        { success: false, message: "Your session expired after 30 minutes of inactivity. Please sign in again." },
        { status: 401 },
      );
      response.cookies.delete(cookieName);
      return response;
    }
  }
  return null;
}

async function parentCanAccess(parentId: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return false;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/parents?id=eq.${parentId}&select=status,archive_status`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, cache: "no-store" }
  );
  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 && parentAccountCanAccess(rows[0]);
}

/** Edge-safe read of the durable ICT password-revocation marker. */
async function passwordSessionCanAccess(
  role: PasswordSessionRole,
  accountId: number,
  payload: { sessionIssuedAt?: unknown; iat?: unknown; exp?: unknown },
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || !Number.isSafeInteger(accountId) || accountId <= 0) return false;

  try {
    const endpoint = new URL("/rest/v1/audit_log", supabaseUrl);
    endpoint.searchParams.set("select", "created_at");
    endpoint.searchParams.set("action", `in.(${PASSWORD_SESSION_REVOCATION_ACTIONS.join(",")})`);
    endpoint.searchParams.set("target_type", "eq.user");
    endpoint.searchParams.set("target_id", `eq.${accountId}`);
    endpoint.searchParams.set("target_role", `eq.${passwordSessionAuditRole(role)}`);
    endpoint.searchParams.set("order", "created_at.desc");
    endpoint.searchParams.set("limit", "1");
    const response = await fetch(endpoint, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const rows = await response.json();
    const latest = Array.isArray(rows) ? rows[0] as { created_at?: string } | undefined : undefined;
    return !latest?.created_at || !isTokenRevokedByPasswordChange(payload, role, latest.created_at);
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  // Rewrites run after this request proxy. Normalize the alias here so the
  // established dashboard role/session checks still protect the underlying
  // route before it is served.
  const pathname = internalPathnameForOpaqueRoute(req.nextUrl.pathname);

  // Login and signup routes must remain reachable even if a browser still
  // carries an expired cookie that will be replaced by a successful sign-in.
  const isPublicSessionBootstrapApi = pathname === "/api/auth/login"
    || pathname === "/api/auth/forgot-password"
    || pathname === "/api/auth/reset-password"
    || pathname.startsWith("/api/auth/password-reset/")
    || pathname === "/api/auth/adviser/login"
    || pathname === "/api/auth/guidance/login"
    || pathname === "/api/auth/principal/login"
    || pathname === "/api/auth/ict/login"
    || pathname === "/api/parents/signup"
    || pathname === "/api/parents/check-email"
    || pathname === "/api/parents/verify-temp-password"
    || pathname === "/api/parents/signup-otp"
    || pathname === "/api/parents/resend-temp-password";
  if (pathname.startsWith("/api/") && !isPublicSessionBootstrapApi) {
    const expiredResponse = await expiredDashboardApiSession(req);
    if (expiredResponse) return expiredResponse;
  }

  const isPublicParentApi = pathname === "/api/parents/signup"
    || pathname === "/api/parents/check-email"
    // A new account has no parent ID yet. This endpoint validates the signed
    // short-lived signup cookie before it creates the parent session.
    || pathname === "/api/parents/verify-temp-password"
    || pathname === "/api/parents/signup-otp"
    // A pending signup has no parent session yet. This endpoint validates its
    // signed, short-lived cookie before it reveals or sends a replacement.
    || pathname === "/api/parents/resend-temp-password";
  // This is a staff-only lookup used while an Adviser or ICT user registers
  // a student. It deliberately lives under `/api/parents` because it reads
  // Parent account candidates, but it must not be authenticated as the
  // Parent whose account is being suggested. Its route handler verifies the
  // Adviser or ICT session before returning any result.
  const isStaffParentLinkCandidateApi = pathname === "/api/parents/active-link-candidates";
  // Only the parent-facing collection endpoint belongs to the parent session.
  // Adviser approval endpoints share the `/api/excuse-letters` namespace but
  // authenticate with `getAdviserFromToken` in their route handlers. Guarding
  // the whole namespace here caused those requests to be rejected as parents
  // before the adviser authorization and class-scope checks could run.
  const isParentFeatureApi = (pathname.startsWith("/api/parents/") && !isPublicParentApi && !isStaffParentLinkCandidateApi)
    || pathname === "/api/excuse-letters"
    || pathname === "/api/attendance/parent-history";
  if (isParentFeatureApi) {
    const token = req.cookies.get("parent_token")?.value;
    if (!token) return parentApiAuthFailure("Not authenticated.", 401);
    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== "parent" || !isCurrentDashboardIdleSession(verified.payload)) {
        return parentApiAuthFailure("Not authenticated.", 401, true);
      }
      const parentId = Number(verified.payload.id);
      if (!Number.isSafeInteger(parentId) || parentId <= 0 || !(await parentCanAccess(parentId))
        || !(await passwordSessionCanAccess("parent", parentId, verified.payload))) {
        return parentApiAuthFailure("This guardian account is temporarily unavailable while deletion is pending.", 403, true);
      }
    } catch {
      return parentApiAuthFailure("Not authenticated.", 401, true);
    }
  }

  // ── Protect /dashboard/adviser routes ─────────────────
  const adviserPasswordSetup = pathname.startsWith("/set-password/adviser");
  if (pathname.startsWith("/dashboard/adviser") || adviserPasswordSetup) {
    const token = req.cookies.get("adviser_token")?.value;

    if (!token) {
      return redirectToAuthorizedDashboardOrLogin(req, "adviser");
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== "adviser" || !isCurrentDashboardIdleSession(verified.payload)) throw new Error("Invalid role");
      const adviserId = Number(verified.payload.id);
      if (!(await passwordSessionCanAccess("adviser", adviserId, verified.payload))) throw new Error("Session revoked");
      if (adviserPasswordSetup) {
        return verified.payload.passwordSet === false
          ? NextResponse.next()
          : NextResponse.redirect(new URL(dashboardPath("adviser"), req.url));
      }
      if (verified.payload.passwordSet === false) {
        return NextResponse.redirect(new URL("/set-password/adviser", req.url));
      }
      return NextResponse.next();
    } catch {
      // Token expired or invalid
      return redirectToAuthorizedDashboardOrLogin(req, "adviser", true);
    }
  }

  const guidancePasswordSetup = pathname.startsWith("/set-password/guidance");
  if (pathname.startsWith("/dashboard/guidance") || guidancePasswordSetup) {
    const token = req.cookies.get("guidance_token")?.value;

    if (!token) {
      return redirectToAuthorizedDashboardOrLogin(req, "guidance");
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== "guidance" || !isCurrentDashboardIdleSession(verified.payload)) throw new Error("Invalid role");
      const guidanceId = Number(verified.payload.id);
      if (!(await passwordSessionCanAccess("guidance", guidanceId, verified.payload))) throw new Error("Session revoked");
      if (guidancePasswordSetup) {
        return verified.payload.passwordSet === false
          ? NextResponse.next()
          : NextResponse.redirect(new URL(dashboardPath("guidance"), req.url));
      }
      if (verified.payload.passwordSet === false) {
        return NextResponse.redirect(new URL("/set-password/guidance", req.url));
      }
      return NextResponse.next();
    } catch {
      return redirectToAuthorizedDashboardOrLogin(req, "guidance", true);
    }
  }

  const principalPasswordSetup = pathname.startsWith("/set-password/principal");
  if (pathname.startsWith("/dashboard/principal") || principalPasswordSetup) {
    const token = req.cookies.get("principal_token")?.value;

    if (!token) {
      return redirectToAuthorizedDashboardOrLogin(req, "principal");
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== "principal" || !isCurrentDashboardIdleSession(verified.payload)) throw new Error("Invalid role");
      if (principalPasswordSetup && verified.payload.passwordSet !== false) {
        return NextResponse.redirect(new URL(dashboardPath("principal"), req.url));
      }
      if (verified.payload.passwordSet === false) {
        return principalPasswordSetup
          ? NextResponse.next()
          : NextResponse.redirect(new URL("/set-password/principal", req.url));
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const activePrincipal = await fetch(
          `${supabaseUrl}/rest/v1/principals?id=eq.${verified.payload.id}&is_active=eq.true&select=id,auth_version`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
            cache: "no-store",
          }
        );

        const rows = await activePrincipal.json();
        if (
          !activePrincipal.ok ||
          !Array.isArray(rows) ||
          rows.length === 0 ||
          rows[0].auth_version !== verified.payload.authVersion
        ) {
          return redirectToAuthorizedDashboardOrLogin(req, "principal", true);
        }
      }

      return NextResponse.next();
    } catch {
      return redirectToAuthorizedDashboardOrLogin(req, "principal", true);
    }
  }

  const ictPasswordSetup = pathname.startsWith("/set-password/ict");
  if (pathname.startsWith("/dashboard/ict") || ictPasswordSetup) {
    const token = req.cookies.get("ict_token")?.value;

    if (!token) {
      return redirectToAuthorizedDashboardOrLogin(req, "ict");
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== "ict" || !isCurrentDashboardIdleSession(verified.payload)) throw new Error("Invalid role");
      if (ictPasswordSetup) {
        return verified.payload.passwordSet === false
          ? NextResponse.next()
          : NextResponse.redirect(new URL(dashboardPath("ict"), req.url));
      }
      if (verified.payload.passwordSet === false) {
        return NextResponse.redirect(new URL("/set-password/ict", req.url));
      }
      return NextResponse.next();
    } catch {
      return redirectToAuthorizedDashboardOrLogin(req, "ict", true);
    }
  }

  if (pathname.startsWith("/dashboard/parent")) {
    const token = req.cookies.get("parent_token")?.value;

    if (!token) {
      return redirectToAuthorizedDashboardOrLogin(req, "parent");
    }

    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== "parent" || !isCurrentDashboardIdleSession(verified.payload)) throw new Error("Invalid role");
      if (verified.payload.passwordSet === false) {
        if (verified.payload.temporaryPasswordVerified !== true) {
          return NextResponse.redirect(new URL(PUBLIC_ROUTE_ALIASES.parentRecovery.verifyTemporaryPassword, req.url));
        }
        return NextResponse.redirect(new URL("/login/guardian/set-password", req.url));
      }
      const parentId = Number(verified.payload.id);
      if (!Number.isSafeInteger(parentId) || parentId <= 0 || !(await parentCanAccess(parentId))
        || !(await passwordSessionCanAccess("parent", parentId, verified.payload))) {
        return redirectToAuthorizedDashboardOrLogin(req, "parent", true);
      }
      return NextResponse.next();
    } catch {
      return redirectToAuthorizedDashboardOrLogin(req, "parent", true);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/a/5qN8vK2x/:path*",
    "/a/9mR3tC7w/:path*",
    "/a/4yH6pL1d/:path*",
    "/a/8fB2zW5n/:path*",
    "/a/1kD7sV4r/:path*",
    // Keep the retired paths guarded too. Config redirects run first, but
    // this prevents a future routing change from accidentally exposing them.
    "/dashboard/adviser/:path*",
    "/dashboard/guidance/:path*",
    "/dashboard/principal/:path*",
    "/dashboard/ict/:path*",
    "/dashboard/parent/:path*",
    "/set-password/adviser/:path*",
    "/set-password/guidance/:path*",
    "/set-password/principal/:path*",
    "/set-password/ict/:path*",
    "/api/:path*",
  ],
};
