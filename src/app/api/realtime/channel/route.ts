import { NextResponse } from "next/server";
import { getAdviserSession, getGuidanceSession, getParentSession, getPrincipalSession } from "@/app/api/reports/parent-adviser/_lib";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { realtimeChannelTopic, type RealtimeRecipient } from "@/lib/realtimeInvalidation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let recipient: RealtimeRecipient | null = null;

    const parent = await getParentSession();
    if (parent) recipient = { role: "parent", id: parent.id };

    if (!recipient) {
      const adviser = await getAdviserSession();
      if (adviser) recipient = { role: "adviser", id: adviser.id };
    }

    if (!recipient) {
      const guidance = await getGuidanceSession();
      if (guidance) recipient = { role: "guidance", id: guidance.id };
    }

    if (!recipient) {
      const principal = await getPrincipalSession();
      if (principal) recipient = { role: "principal", id: principal.id };
    }

    if (!recipient) {
      const ict = await getIctFromToken();
      if (ict) recipient = { role: "ict", id: ict.id };
    }

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
