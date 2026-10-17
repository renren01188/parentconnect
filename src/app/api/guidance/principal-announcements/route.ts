import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";

type AnnouncementSource = "principal" | "ict";

export async function GET() {
    try {
        const guidance = await getGuidanceFromToken();
        if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

        // This is the sole incoming-announcement feed for Guidance. Principal
        // announcements must target Everyone or Guidance; ICT announcements
        // must target Guidance.
        const [principalRes, ictRes, principalsRes, readsRes] = await Promise.all([
            supabase
                .from("principal_announcements")
                .select("id, title, message, audience, sender_id, created_at")
                .in("audience", ["Everyone", "Guidance"])
                .eq("status", "Published")
                .order("created_at", { ascending: false }),
            supabase
                .from("ict_announcements")
                .select("id, title, message, audience, sender_name, created_at")
                .contains("audience", ["Guidance"])
                .eq("status", "Published")
                .order("created_at", { ascending: false }),
            supabase
                .from("principals")
                .select("id, first_name, middle_name, last_name, suffix"),
            supabase
                .from("guidance_notification_reads")
                .select("notif_key")
                .eq("guidance_id", guidance.id),
        ]);

        const queryError = [principalRes, ictRes, principalsRes, readsRes]
            .find((result) => result.error)?.error;
        if (queryError) throw queryError;

        const readKeys = new Set(
            (readsRes.data ?? []).map((read: { notif_key: string }) => read.notif_key)
        );
        const principalNames = new Map(
            (principalsRes.data ?? []).map((principal) => [
                String(principal.id),
                [principal.first_name, principal.middle_name, principal.last_name, principal.suffix]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "Principal",
            ])
        );

        const announcements = [
            ...(principalRes.data ?? []).map((announcement) => {
                const notificationKey = `principal-${announcement.id}`;
                return {
                    id: `principal-${announcement.id}`,
                    source: "principal" as AnnouncementSource,
                    notificationKey,
                    title: announcement.title,
                    message: announcement.message,
                    audience: announcement.audience,
                    senderName: principalNames.get(String(announcement.sender_id)) ?? "Principal",
                    senderRole: "Principal",
                    created_at: announcement.created_at,
                    read: readKeys.has(notificationKey),
                };
            }),
            ...(ictRes.data ?? []).map((announcement) => {
                const notificationKey = `ict-announcement-${announcement.id}`;
                return {
                    id: `ict-${announcement.id}`,
                    source: "ict" as AnnouncementSource,
                    notificationKey,
                    title: announcement.title,
                    message: announcement.message,
                    audience: announcement.audience,
                    senderName: announcement.sender_name ?? "ICT Office",
                    senderRole: "ICT",
                    created_at: announcement.created_at,
                    read: readKeys.has(notificationKey),
                };
            }),
        ].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

        return NextResponse.json({
            success: true,
            announcements,
            unreadCount: announcements.filter((announcement) => !announcement.read).length,
        });
    } catch (error) {
        console.error("GET /api/guidance/principal-announcements error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
