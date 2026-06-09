import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken"; // use your actual ICT auth helper

export async function GET() {
    try {
        const ict = await getIctFromToken();
        if (!ict) return NextResponse.json({ success: false }, { status: 401 });

        const { data, error } = await supabase
            .from("principal_announcements")
            .select("id, title, message, audience, created_at")
            .in("audience", ["Everyone", "Advisers"])
            .eq("status", "Published")
            .order("created_at", { ascending: false });

        if (error) throw error;

        const announcements = (data ?? []).map((a: any) => ({
            id: String(a.id),
            title: a.title,
            message: a.message,
            body: a.message,
            audience: [a.audience],
            author: "Principal",
            source: "principal",
            created_at: a.created_at,
        }));

        return NextResponse.json({ success: true, announcements });
    } catch (error) {
        console.error("GET /api/ict/principal-announcements error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}