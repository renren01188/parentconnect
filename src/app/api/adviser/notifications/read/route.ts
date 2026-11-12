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
      const rawNotifKeys: unknown[] = body.notif_keys;
      const notifKeys: string[] = [...new Set(rawNotifKeys.filter(
        (key: unknown): key is string => typeof key === "string" && key.trim().length > 0
      ))];
      const earlyOutIds = notifKeys
        .map((key) => /^early-out-(\d+)$/.exec(key)?.[1])
        .filter((id): id is string => Boolean(id))
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0);
      const rows = notifKeys.filter((key) => !/^early-out-\d+$/.test(key)).map((key) => ({
        adviser_id: adviser.id,
        notif_key: key,
      }));

      if (rows.length > 0 || earlyOutIds.length > 0) {
        if (rows.length > 0) {
        const { error } = await supabase
          .from("adviser_notification_reads")
          .upsert(rows, { onConflict: "adviser_id,notif_key" });
        if (error) throw error;
        }
        if (earlyOutIds.length > 0) {
          const { error } = await supabase
            .from("early_out_notifications")
            .update({ read_at: new Date().toISOString() })
            .eq("recipient_role", "Adviser")
            .eq("recipient_id", adviser.id)
            .in("id", [...new Set(earlyOutIds)])
            .is("read_at", null);
          if (error) throw error;
        }
        await publishRealtimeInvalidation([{ role: "adviser", id: adviser.id }], "notifications");
      }

      return NextResponse.json({ success: true, marked: rows.length + earlyOutIds.length });
    }

    // ── Mark one as read ──────────────────────────────────────────────────────
    if (typeof body.notif_key === "string" && body.notif_key.trim().length > 0) {
      const earlyOutMatch = /^early-out-(\d+)$/.exec(body.notif_key.trim());
      if (earlyOutMatch) {
        const earlyOutId = Number(earlyOutMatch[1]);
        if (!Number.isSafeInteger(earlyOutId) || earlyOutId <= 0) {
          return NextResponse.json({ success: false, message: "Invalid notification." }, { status: 400 });
        }
        const { error } = await supabase
          .from("early_out_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("recipient_role", "Adviser")
          .eq("recipient_id", adviser.id)
          .eq("id", earlyOutId)
          .is("read_at", null);
        if (error) throw error;
        await publishRealtimeInvalidation([{ role: "adviser", id: adviser.id }], "notifications");
        return NextResponse.json({ success: true });
      }
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
