import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

export async function PATCH(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();

    // ── Mark all as read ──────────────────────────────────────────────────────
    if (body.mark_all && Array.isArray(body.notif_keys)) {
      const notifKeys = [...new Set(body.notif_keys.filter(
        (key: unknown): key is string => typeof key === "string" && key.trim().length > 0
      ))];
      const rows = notifKeys.map((key) => ({
        adviser_id: adviser.id,
        notif_key: key,
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("adviser_notification_reads")
          .upsert(rows, { onConflict: "adviser_id,notif_key" });

        if (error) throw error;
        await publishRealtimeInvalidation([{ role: "adviser", id: adviser.id }], "notifications");
      }

      return NextResponse.json({ success: true, marked: rows.length });
    }

    // ── Mark one as read ──────────────────────────────────────────────────────
    if (typeof body.notif_key === "string" && body.notif_key.trim().length > 0) {
      const { error } = await supabase
        .from("adviser_notification_reads")
        .upsert(
          { adviser_id: adviser.id, notif_key: body.notif_key },
          { onConflict: "adviser_id,notif_key" }
        );

      if (error) throw error;
      await publishRealtimeInvalidation([{ role: "adviser", id: adviser.id }], "notifications");
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/adviser/notifications/read error:", error);
    return NextResponse.json({ success: false, message: "Failed to mark as read." }, { status: 500 });
  }
}
