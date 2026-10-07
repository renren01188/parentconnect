import { NextRequest, NextResponse } from "next/server";
import {
  getRememberedLoginGuard,
  PARENT_LOGIN_GUARD_SCOPE,
  type ProtectedLoginRole,
} from "@/lib/loginProtection";

const ROLES = new Set<ProtectedLoginRole>(["parent", "adviser", "guidance", "principal", "ict"]);

export const dynamic = "force-dynamic";

/** Restores the server-owned guard state after a page refresh or browser restart. */
export async function GET(request: NextRequest) {
  const role = new URL(request.url).searchParams.get("role");
  if (!role || !ROLES.has(role as ProtectedLoginRole)) {
    return NextResponse.json({ success: false }, { status: 404 });
  }

  try {
    const protectedRole = role as ProtectedLoginRole;
    const guard = await getRememberedLoginGuard(
      protectedRole,
      request,
      protectedRole === "parent" ? PARENT_LOGIN_GUARD_SCOPE : undefined,
    );
    return NextResponse.json(
      {
        success: true,
        captchaRequired: guard?.captchaRequired ?? false,
        lockedUntil: guard?.lockedUntil ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Do not disclose a stored account identifier or silently remove a guard.
    return NextResponse.json(
      { success: false, message: "Login protection is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
