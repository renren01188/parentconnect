import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";

export async function GET() {
    try {
        const guidance = await getGuidanceFromToken();
        if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

        const [{ data, error }, readsRes] = await Promise.all([
            supabase
                .from("principal_announcements")
                .select("id, title, message, audience, sender_id, created_at")
                .in("audience", ["Everyone", "Class Advisers", "Advisers"])
                .eq("status", "Published")
                .order("created_at", { ascending: false }),
            supabase
                .from("guidance_notification_reads")
                .select("notif_key")
                .eq("guidance_id", guidance.id),
        ]);

        if (error) throw error;

        const readKeys = new Set(
            (readsRes.data ?? []).map((r: { notif_key: string }) => r.notif_key)
        );

        const announcements = (data ?? []).map((a: any) => ({
            id: a.id,
            title: a.title,
            message: a.message,
            audience: a.audience,
            guidance_name: "Principal",
            created_at: a.created_at,
            read: readKeys.has(`principal-${a.id}`),
        }));

        return NextResponse.json({ success: true, announcements });
    } catch (error) {
        console.error("GET /api/guidance/principal-announcements error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}