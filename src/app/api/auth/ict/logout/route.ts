import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { logAudit } from "@/lib/audit";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

// POST /api/auth/ict/logout
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      const name = [payload.first_name, payload.middle_name, payload.last_name, payload.suffix]
        .filter(Boolean).join(" ") || "Unknown ICT Admin";
      await logAudit({
        action:          "Logout",
        performedById:   Number(payload.id),
        performedBy:     name,
        performedByRole: "ICT Admin",
        performedByEmail: typeof payload.email === "string" ? payload.email : undefined,
        details:         `ICT Admin "${name}" logged out.`,
        module:          "Auth",
      });
    } catch { /* token invalid */ }
  }

  cookieStore.delete("ict_token");
  return NextResponse.json({ success: true });
}
