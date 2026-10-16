import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

export async function PATCH(req: NextRequest) {
    try {
        const ict = await getIctFromToken();
        if (!ict) return NextResponse.json({ success: false }, { status: 401 });

        const body = await req.json();
        if (typeof body.notif_key !== "string") {
            return NextResponse.json({ success: false }, { status: 400 });
        }

        const { error } = await supabase
            .from("ict_notification_reads")
            .upsert(
                { ict_id: ict.id, notif_key: body.notif_key },
                { onConflict: "ict_id,notif_key" }
            );

        if (error) throw error;
        await publishRealtimeInvalidation([{ role: "ict", id: ict.id }], "notifications");
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("PATCH /api/ict/notifications/read error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
