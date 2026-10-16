import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

const isValidPrincipalNotificationKey = (key: unknown): key is string =>
    typeof key === "string" && [
        "parent-report-submitted-",
        "guidance-ticket-accepted-",
        "guidance-escalated-",
    ].some((prefix) => key.startsWith(prefix));

export async function PATCH(req: NextRequest) {
    try {
        const principal = await getPrincipalFromToken();
        if (!principal) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const body = await req.json();

        if (body.mark_all && Array.isArray(body.notif_keys)) {
            const notifKeys = [...new Set(body.notif_keys.filter(isValidPrincipalNotificationKey))];
            if (!notifKeys.length) {
                return NextResponse.json({ success: false, message: "No valid notification keys supplied." }, { status: 400 });
            }
            const rows = notifKeys.map((key) => ({
                principal_id: principal.id,
                notif_key: key,
            }));

            if (rows.length > 0) {
                const { error } = await supabase
                    .from("principal_notification_reads")
                    .upsert(rows, { onConflict: "principal_id,notif_key" });

                if (error) throw error;
            }

            await publishRealtimeInvalidation([{ role: "principal", id: principal.id }], "notifications");

            return NextResponse.json({ success: true });
        }

        if (isValidPrincipalNotificationKey(body.notif_key)) {
            const { error } = await supabase
                .from("principal_notification_reads")
                .upsert(
                    { principal_id: principal.id, notif_key: body.notif_key },
                    { onConflict: "principal_id,notif_key" }
                );

            if (error) throw error;
            await publishRealtimeInvalidation([{ role: "principal", id: principal.id }], "notifications");
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
    } catch (error) {
        console.error("PATCH /api/principal/notifications/read error:", error);
        return NextResponse.json({ success: false, message: "Failed to mark as read." }, { status: 500 });
    }
}
