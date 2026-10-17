import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken";

export async function GET() {
    try {
        const ict = await getIctFromToken();
        if (!ict) return NextResponse.json({ success: false }, { status: 401 });

        const [{ data: principalAnns }, { data: reads }] = await Promise.all([
            supabase
                .from("principal_announcements")
                .select("id, title, message, audience, created_at")
                .in("audience", ["Everyone", "ICT", "Advisers"])
                .eq("status", "Published")
                .order("created_at", { ascending: false }),
            supabase
                .from("ict_notification_reads")
                .select("notif_key")
                .eq("ict_id", ict.id),
        ]);

        const readKeys = new Set((reads ?? []).map((r: any) => r.notif_key));

        const notifications = (principalAnns ?? []).map((a: any) => ({
            id: `principal-${a.id}`,
            title: a.title,
            read: readKeys.has(`principal-${a.id}`),
        }));

        const unreadCount = notifications.filter(n => !n.read).length;
        return NextResponse.json({ success: true, notifications, unreadCount });
    } catch (error) {
        console.error("GET /api/ict/notifications error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
