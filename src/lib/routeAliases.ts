/**
 * Stable, public-facing aliases for routes whose purpose should not be
 * disclosed by their URL. These are routing aliases only: authentication and
 * role authorization remain enforced by the request proxy and route handlers.
 *
 * Do not derive these identifiers from an account, role, or an irreversible
 * hash. They are intentionally fixed application routes so bookmarked URLs,
 * refreshes, and browser history remain reliable.
 */
export const PUBLIC_ROUTE_ALIASES = {
  dashboard: {
    parent: "/a/5qN8vK2x",
    adviser: "/a/9mR3tC7w",
    guidance: "/a/4yH6pL1d",
    ict: "/a/8fB2zW5n",
    principal: "/a/1kD7sV4r",
  },
  parentRecovery: {
    forgotPassword: "/a/3uJ9cE6h",
    verifyTemporaryPassword: "/a/7gP2nR8b",
    signupOtp: "/a/6wL4xT9q",
    resetOtp: "/a/2dM7kF5s",
    resetNewPassword: "/a/8zC1vH4p",
  },
} as const;

export type DashboardRouteRole = keyof typeof PUBLIC_ROUTE_ALIASES.dashboard;

const INTERNAL_DASHBOARD_ROUTES: Record<DashboardRouteRole, string> = {
  parent: "/dashboard/parent",
  adviser: "/dashboard/adviser",
  guidance: "/dashboard/guidance",
  ict: "/dashboard/ict",
  principal: "/dashboard/principal",
};

const INTERNAL_PARENT_RECOVERY_ROUTES = {
  forgotPassword: "/login/guardian/forgot-password",
  verifyTemporaryPassword: "/login/guardian/verify-temp-password",
  signupOtp: "/login/guardian/send-otp",
  resetOtp: "/login/guardian/reset-password",
  resetNewPassword: "/login/guardian/reset-password/new-password",
} as const;

/** Builds an opaque dashboard URL while preserving a path suffix or query. */
export function dashboardPath(role: DashboardRouteRole, suffix = "") {
  return `${PUBLIC_ROUTE_ALIASES.dashboard[role]}${suffix}`;
}

/**
 * Converts an opaque request path to the existing app route before the
 * request proxy applies its role/session checks.
 */
export function internalPathnameForOpaqueRoute(pathname: string) {
  for (const role of Object.keys(PUBLIC_ROUTE_ALIASES.dashboard) as DashboardRouteRole[]) {
    const publicBase = PUBLIC_ROUTE_ALIASES.dashboard[role];
    if (pathname === publicBase || pathname.startsWith(`${publicBase}/`)) {
      return `${INTERNAL_DASHBOARD_ROUTES[role]}${pathname.slice(publicBase.length)}`;
    }
  }

  for (const key of Object.keys(PUBLIC_ROUTE_ALIASES.parentRecovery) as (keyof typeof PUBLIC_ROUTE_ALIASES.parentRecovery)[]) {
    if (pathname === PUBLIC_ROUTE_ALIASES.parentRecovery[key]) {
      return INTERNAL_PARENT_RECOVERY_ROUTES[key];
    }
  }

  return pathname;
}

/** Rewrites keep the opaque URL visible while serving the existing page. */
export const OPAQUE_ROUTE_REWRITES = [
  ...((Object.keys(PUBLIC_ROUTE_ALIASES.dashboard) as DashboardRouteRole[]).map((role) => ({
    source: `${PUBLIC_ROUTE_ALIASES.dashboard[role]}/:path*`,
    destination: `${INTERNAL_DASHBOARD_ROUTES[role]}/:path*`,
  }))),
  ...((Object.keys(PUBLIC_ROUTE_ALIASES.parentRecovery) as (keyof typeof PUBLIC_ROUTE_ALIASES.parentRecovery)[]).map((key) => ({
    source: PUBLIC_ROUTE_ALIASES.parentRecovery[key],
    destination: INTERNAL_PARENT_RECOVERY_ROUTES[key],
  }))),
];

/**
 * Retire the readable public paths without permanently caching that decision.
 * A temporary redirect allows aliases to be rotated later if necessary.
 */
export const READABLE_ROUTE_REDIRECTS = [
  ...((Object.keys(PUBLIC_ROUTE_ALIASES.dashboard) as DashboardRouteRole[]).map((role) => ({
    source: `${INTERNAL_DASHBOARD_ROUTES[role]}/:path*`,
    destination: `${PUBLIC_ROUTE_ALIASES.dashboard[role]}/:path*`,
    permanent: false,
  }))),
  ...((Object.keys(PUBLIC_ROUTE_ALIASES.parentRecovery) as (keyof typeof PUBLIC_ROUTE_ALIASES.parentRecovery)[]).map((key) => ({
    source: INTERNAL_PARENT_RECOVERY_ROUTES[key],
    destination: PUBLIC_ROUTE_ALIASES.parentRecovery[key],
    permanent: false,
  }))),
];
