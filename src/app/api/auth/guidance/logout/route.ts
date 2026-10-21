import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const cookieStore = await cookies();
  const guidance = await getGuidanceSession();

  if (guidance) {
    // Logging must never trap someone in a session if the audit store is
    // temporarily unavailable. This matches the ICT logout behavior.
    try {
      await logAudit({
        action: "Logout",
        performedById: guidance.id,
        performedBy: guidance.name,
        performedByRole: "Guidance Counselor",
        performedByEmail: guidance.email || undefined,
        module: "Auth",
        details: `Guidance Counselor "${guidance.name}" logged out.`,
      });
    } catch {
      // The session still must be cleared below.
    }
  }

  cookieStore.delete("guidance_token");
  return NextResponse.json({ success: true });
}
