import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { logAudit } from "@/lib/audit";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

// POST /api/auth/logout  (parent logout)
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("parent_token")?.value;

  // Try to get user info before deleting the cookie
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      const name = String(payload.parentName ?? "Unknown Parent");
      await logAudit({
        action:          "Logout",
        performedBy:     name,
        performedByRole: "Parent",
        details:         `Parent "${name}" logged out.`,
        module:          "Auth",
      });
    } catch { /* token invalid — still log out */ }
  }

  cookieStore.delete("parent_token");
  return NextResponse.json({ success: true });
}