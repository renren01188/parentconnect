import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/authSecret";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import {
  ICT_PASSWORD_SESSION_REVOCATION_ACTION,
  isTokenRevokedByPasswordChange,
  passwordSessionAuditRole,
  type PasswordSessionRole,
} from "@/lib/passwordSessionRevocation";

const SECRET = getJwtSecret();

type DashboardRole = "adviser" | "guidance" | "principal" | "ict" | "parent";

const dashboardRoutes: Record<DashboardRole, { cookie: string; dashboard: string; login: string; setPassword: string }> = {
  adviser: {
    cookie: "adviser_token",
    dashboard: "/dashboard/adviser",
    login: "/login/adviser",
    setPassword: "/set-password/adviser",
  },
  guidance: {
    cookie: "guidance_token",
    dashboard: "/dashboard/guidance",
    login: "/login/guidance",
    setPassword: "/set-password/guidance",
  },
  principal: {
    cookie: "principal_token",
    dashboard: "/dashboard/principal",
    login: "/login/principal",
    setPassword: "/set-password/principal",
  },
  ict: {
    cookie: "ict_token",
    dashboard: "/dashboard/ict",
    login: "/login/ict",
    setPassword: "/set-password/ict",
  },
  parent: {
    cookie: "parent_token",
    dashboard: "/dashboard/parent",
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
      if (verified.payload.role !== role) continue;

      if (verified.payload.passwordSet === false) {
        if (role === "parent" && verified.payload.temporaryPasswordVerified !== true) {
          return "/login/guardian/verify-temp-password";
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
    endpoint.searchParams.set("action", `eq.${ICT_PASSWORD_SESSION_REVOCATION_ACTION}`);
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublicParentApi = pathname === "/api/parents/signup"
    || pathname === "/api/parents/check-email"
    // A new account has no parent ID yet. This endpoint validates the signed
    // short-lived signup cookie before it creates the parent session.
    || pathname === "/api/parents/verify-temp-password"
    // A pending signup has no parent session yet. This endpoint validates its
    // signed, short-lived cookie before it reveals or sends a replacement.
    || pathname === "/api/parents/resend-temp-password";
  const isParentFeatureApi = (pathname.startsWith("/api/parents/") && !isPublicParentApi)
    || pathname.startsWith("/api/excuse-letters")
    || pathname === "/api/attendance/parent-history";
  if (isParentFeatureApi) {
    const token = req.cookies.get("parent_token")?.value;
    if (!token) return parentApiAuthFailure("Not authenticated.", 401);
    try {
      const verified = await jwtVerify(token, SECRET);
      if (verified.payload.role !== "parent") {
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
      if (verified.payload.role !== "adviser") throw new Error("Invalid role");
      const adviserId = Number(verified.payload.id);
      if (!(await passwordSessionCanAccess("adviser", adviserId, verified.payload))) throw new Error("Session revoked");
      if (adviserPasswordSetup) {
        return verified.payload.passwordSet === false
          ? NextResponse.next()
          : NextResponse.redirect(new URL("/dashboard/adviser", req.url));
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
      if (verified.payload.role !== "guidance") throw new Error("Invalid role");
      const guidanceId = Number(verified.payload.id);
      if (!(await passwordSessionCanAccess("guidance", guidanceId, verified.payload))) throw new Error("Session revoked");
      if (guidancePasswordSetup) {
        return verified.payload.passwordSet === false
          ? NextResponse.next()
          : NextResponse.redirect(new URL("/dashboard/guidance", req.url));
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
      if (verified.payload.role !== "principal") throw new Error("Invalid role");
      if (principalPasswordSetup && verified.payload.passwordSet !== false) {
        return NextResponse.redirect(new URL("/dashboard/principal", req.url));
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
      if (verified.payload.role !== "ict") throw new Error("Invalid role");
      if (ictPasswordSetup) {
        return verified.payload.passwordSet === false
          ? NextResponse.next()
          : NextResponse.redirect(new URL("/dashboard/ict", req.url));
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
      if (verified.payload.role !== "parent") throw new Error("Invalid role");
      if (verified.payload.passwordSet === false) {
        if (verified.payload.temporaryPasswordVerified !== true) {
          return NextResponse.redirect(new URL("/login/guardian/verify-temp-password", req.url));
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
  matcher: ["/dashboard/adviser/:path*", "/dashboard/guidance/:path*", "/dashboard/principal/:path*", "/dashboard/ict/:path*", "/dashboard/parent/:path*", "/set-password/adviser/:path*", "/set-password/guidance/:path*", "/set-password/principal/:path*", "/set-password/ict/:path*", "/api/parents/:path*", "/api/excuse-letters/:path*", "/api/attendance/parent-history"],
};
