import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { logAudit } from "@/lib/audit";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

// POST /api/auth/principal/logout
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("principal_token")?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      const name = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "Unknown Principal";
      await logAudit({
        action:          "Logout",
        performedBy:     name,
        performedByRole: "Principal",
        details:         `Principal "${name}" logged out.`,
        module:          "Auth",
      });
    } catch { /* token invalid */ }
  }

  cookieStore.delete("principal_token");
  return NextResponse.json({ success: true });
}
