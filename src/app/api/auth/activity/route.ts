import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import {
  dashboardSessionCookieOptions,
  dashboardSessionCookies,
  DashboardRole,
  isCurrentDashboardIdleSession,
  issueDashboardIdleSession,
} from "@/lib/dashboardIdleSession";
import { getJwtSecret } from "@/lib/authSecret";

export const dynamic = "force-dynamic";

function requestedRole(request: NextRequest): DashboardRole | null {
  const role = request.nextUrl.searchParams.get("role");
  return role === "parent" || role === "adviser" || role === "guidance" || role === "principal" || role === "ict"
    ? role
    : null;
}

async function readCurrentSession(request: NextRequest, role: DashboardRole) {
  const cookieName = dashboardSessionCookies[role];
  const token = request.cookies.get(cookieName)?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, getJwtSecret());
    if (verified.payload.role !== role || !isCurrentDashboardIdleSession(verified.payload)) return null;
    return verified.payload;
  } catch {
    return null;
  }
}

function expiredResponse(role: DashboardRole) {
  const response = NextResponse.json(
    { success: false, message: "Your session expired after 30 minutes of inactivity. Please sign in again." },
    { status: 401 },
  );
  response.cookies.delete(dashboardSessionCookies[role]);
  return response;
}

/** Read-only session check used when a dashboard first mounts. */
export async function GET(request: NextRequest) {
  const role = requestedRole(request);
  if (!role) return NextResponse.json({ success: false, message: "Invalid session role." }, { status: 400 });

  const payload = await readCurrentSession(request, role);
  if (!payload) return expiredResponse(role);

  return NextResponse.json({
    success: true,
    sessionId: payload.sessionId,
    expiresAt: payload.exp,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Renew only after a real pointer, keyboard, touch, or scroll interaction. */
export async function POST(request: NextRequest) {
  const role = requestedRole(request);
  if (!role) return NextResponse.json({ success: false, message: "Invalid session role." }, { status: 400 });

  const payload = await readCurrentSession(request, role);
  if (!payload) return expiredResponse(role);

  const { token, sessionId, expiresAt } = await issueDashboardIdleSession(payload);
  const response = NextResponse.json(
    { success: true, sessionId, expiresAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  response.cookies.set(dashboardSessionCookies[role], token, dashboardSessionCookieOptions);
  return response;
}
