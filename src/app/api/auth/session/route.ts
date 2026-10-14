import { NextRequest, NextResponse } from "next/server";
import { getAdviserSession, getGuidanceSession, getParentSession } from "@/app/api/reports/parent-adviser/_lib";

export const dynamic = "force-dynamic";

const roles = {
  parent: { cookie: "parent_token", getSession: getParentSession },
  adviser: { cookie: "adviser_token", getSession: getAdviserSession },
  guidance: { cookie: "guidance_token", getSession: getGuidanceSession },
} as const;

/** Validates a targeted Realtime logout and clears only the affected cookie. */
export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role");
  if (role !== "parent" && role !== "adviser" && role !== "guidance") {
    return NextResponse.json({ success: false, message: "Invalid session role." }, { status: 400 });
  }

  const entry = roles[role];
  const session = await entry.getSession();
  if (session) return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });

  const response = NextResponse.json({ success: false, message: "Your password was changed. Please sign in again." }, { status: 401 });
  response.cookies.delete(entry.cookie);
  return response;
}
