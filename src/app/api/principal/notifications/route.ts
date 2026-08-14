import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";

export async function GET() {
    try {
        const principal = await getPrincipalFromToken();
        if (!principal) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

const [adviserAnnRes, guidanceAnnRes, readsRes, ictAnnRes, escalationsRes] = await Promise.all([
            supabase
                .from("adviser_announcements")
                .select("id, title, message, created_at, adviser_id")
                .order("created_at", { ascending: false })
                .limit(20),
            supabase
                .from("guidance_announcements")
                .select("id, title, message, created_at")
                .eq("status", "Published")
                .order("created_at", { ascending: false })
                .limit(20),
            supabase
                .from("principal_notification_reads")
                .select("notif_key")
                .eq("principal_id", principal.id),
            supabase
                .from("ict_announcements")
                .select("id, title, message, created_at")
                .contains("audience", ["Principal"])
                .eq("status", "Published")
                .order("created_at", { ascending: false })
                .limit(20),
            supabase.from("parent_adviser_reports").select("id, parent_name, student_name, subject, created_at, status_updated_at").eq("escalated_to_principal", true).order("status_updated_at", { ascending: false }).limit(30),
        ]);

        const readKeys = new Set(
            (readsRes.data ?? []).map((r: { notif_key: string }) => r.notif_key)
        );

        const notifications: {
            id: string;
            type: string;
            title: string;
            message: string;
            time: string;
            read: boolean;
        }[] = [];

        for (const ann of adviserAnnRes.data ?? []) {
            const key = `adviser-${ann.id}`;
            notifications.push({
                id: key,
                type: "adviser-announcement",
                title: ann.title ?? "Adviser Announcement",
                message: ann.message,
                time: ann.created_at,
                read: readKeys.has(key),
            });
        }

        for (const ann of guidanceAnnRes.data ?? []) {
            const key = `guidance-${ann.id}`;
            notifications.push({
                id: key,
                type: "guidance-announcement",
                title: ann.title ?? "Guidance Announcement",
                message: ann.message,
                time: ann.created_at,
                read: readKeys.has(key),
            });
        }
        for (const ann of ictAnnRes.data ?? []) {
            const key = `ict-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "ict-announcement",
                title: `[ICT] ${ann.title}`,
                message: ann.message,
                time: ann.created_at,
                read: readKeys.has(key),
            });
        }
        for (const report of escalationsRes.data ?? []) {
            const key = `guidance-escalated-${report.id}`;
            notifications.push({ id: key, type: "guidance-escalated", title: "Report Escalated by Guidance", message: `Guidance escalated ${report.parent_name}'s report for ${report.student_name}: ${report.subject}`, time: report.status_updated_at ?? report.created_at, read: readKeys.has(key) });
        }

        notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        const unreadCount = notifications.filter(n => !n.read).length;

        return NextResponse.json({ success: true, notifications, unreadCount });
    } catch (error) {
        console.error("GET /api/principal/notifications error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch notifications." }, { status: 500 });
    }
}
