import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken"; // use your actual ICT auth helper

export async function GET() {
    try {
        const ict = await getIctFromToken();
        if (!ict) return NextResponse.json({ success: false }, { status: 401 });

        const { data, error } = await supabase
            .from("principal_announcements")
            .select("id, title, message, audience, sender_id, created_at")
            .in("audience", ["Everyone", "Advisers"])
            .eq("status", "Published")
            .order("created_at", { ascending: false });

        if (error) throw error;

        const senderIds = [...new Set((data ?? []).map((a: any) => a.sender_id).filter(Boolean))];
        const { data: profiles } = senderIds.length
            ? await supabase.from("principals").select("id, profile_picture").in("id", senderIds)
            : { data: [] as Array<{ id: number; profile_picture: string | null }> };
        const pictureById = new Map((profiles ?? []).map((profile) => [profile.id, profile.profile_picture]));
        const announcements = (data ?? []).map((a: any) => ({
            id: String(a.id),
            title: a.title,
            message: a.message,
            body: a.message,
            audience: [a.audience],
            author: "Principal",
            source: "principal",
            profilePicture: pictureById.get(a.sender_id) ?? null,
            created_at: a.created_at,
        }));

        return NextResponse.json({ success: true, announcements });
    } catch (error) {
        console.error("GET /api/ict/principal-announcements error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
