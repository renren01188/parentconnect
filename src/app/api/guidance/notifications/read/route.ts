import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

export async function PATCH(req: NextRequest) {
    try {
        const guidance = await getGuidanceFromToken();
        if (!guidance) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const body = await req.json();

        if (body.mark_all && Array.isArray(body.notif_keys)) {
            const rows = body.notif_keys.map((key: string) => ({
                guidance_id: guidance.id,
                notif_key: key,
            }));

            if (rows.length > 0) {
                const { error } = await supabase
                    .from("guidance_notification_reads")
                    .upsert(rows, { onConflict: "guidance_id,notif_key" });
                if (error) throw error;
            }

            await publishRealtimeInvalidation([{ role: "guidance", id: guidance.id }], "notifications");

            return NextResponse.json({ success: true });
        }

        if (typeof body.notif_key === "string") {
            const { error } = await supabase
                .from("guidance_notification_reads")
                .upsert(
                    { guidance_id: guidance.id, notif_key: body.notif_key },
                    { onConflict: "guidance_id,notif_key" }
                );
            if (error) throw error;
            await publishRealtimeInvalidation([{ role: "guidance", id: guidance.id }], "notifications");
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
    } catch (error) {
        console.error("PATCH /api/guidance/notifications/read error:", error);
        return NextResponse.json({ success: false, message: "Failed to mark as read." }, { status: 500 });
    }
}
