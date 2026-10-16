import { NextRequest, NextResponse } from "next/server";
import { getAdviserSession, getGuidanceSession, getParentSession, getPrincipalSession } from "@/app/api/reports/parent-adviser/_lib";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { realtimeChannelTopic, type RealtimeRecipient } from "@/lib/realtimeInvalidation";

export const dynamic = "force-dynamic";

type DashboardRealtimeRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

const dashboardRealtimeRoles = new Set<DashboardRealtimeRole>([
  "parent",
  "adviser",
  "guidance",
  "principal",
  "ict",
]);

async function recipientForRole(role: DashboardRealtimeRole): Promise<RealtimeRecipient | null> {
  if (role === "parent") {
    const parent = await getParentSession();
    return parent ? { role, id: parent.id } : null;
  }
  if (role === "adviser") {
    const adviser = await getAdviserSession();
    return adviser ? { role, id: adviser.id } : null;
  }
  if (role === "guidance") {
    const guidance = await getGuidanceSession();
    return guidance ? { role, id: guidance.id } : null;
  }
  if (role === "principal") {
    const principal = await getPrincipalSession();
    return principal ? { role, id: principal.id } : null;
  }
  const ict = await getIctFromToken();
  return ict ? { role: "ict", id: ict.id } : null;
}

export async function GET(req: NextRequest) {
  try {
    const requestedRole = req.nextUrl.searchParams.get("role");
    if (requestedRole && !dashboardRealtimeRoles.has(requestedRole as DashboardRealtimeRole)) {
      return NextResponse.json({ success: false, message: "Invalid dashboard role." }, { status: 400 });
    }

    // Modern clients always name the dashboard role. This prevents a Parent
    // session cookie left in the same browser from hijacking an Adviser,
    // Guidance, Principal, or ICT live channel. The ordered fallback keeps an
    // already-loaded older client working during a rolling deployment.
    const recipient = requestedRole
      ? await recipientForRole(requestedRole as DashboardRealtimeRole)
      : (await recipientForRole("parent"))
        ?? (await recipientForRole("adviser"))
        ?? (await recipientForRole("guidance"))
        ?? (await recipientForRole("principal"))
        ?? (await recipientForRole("ict"));

    if (!recipient) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    return NextResponse.json(
      { success: true, topic: realtimeChannelTopic(recipient) },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  } catch (error) {
    console.error("GET /api/realtime/channel error:", error);
    return NextResponse.json({ success: false, message: "Unable to start live updates." }, { status: 500 });
  }
}
