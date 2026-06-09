import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";

export async function GET() {
    try {
        const guidance = await getGuidanceFromToken();
        if (!guidance) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const [principalAnnRes, ictAnnRes, readsRes] = await Promise.all([
            supabase
                .from("principal_announcements")
                .select("id, title, message, created_at")
                .in("audience", ["Everyone", "Advisers"])
                .eq("status", "Published")
                .order("created_at", { ascending: false })
                .limit(20),
            supabase
                .from("ict_announcements")
                .select("id, title, message, created_at")
                .contains("audience", ["Guidance"])
                .eq("status", "Published")
                .order("created_at", { ascending: false })
                .limit(20),
            supabase
                .from("guidance_notification_reads")
                .select("notif_key")
                .eq("guidance_id", guidance.id),
        ]);

        const readKeys = new Set(
            (readsRes.data ?? []).map((r: { notif_key: string }) => r.notif_key)
        );

        // Fetch escalated reports for this guidance counselor
        // Fetch escalated reports for this guidance counselor
        const { data: escalatedReports } = await supabase
            .from("parent_adviser_reports")
            .select("id, parent_name, student_name, subject, created_at, status_updated_at")
            .eq("escalated_to_guidance", true)
            .order("status_updated_at", { ascending: false })
            .limit(30);

        const notifications: {
            id: string;
            type: string;
            title: string;
            message: string;
            time: string;
            read: boolean;
            parentName?: string;
        }[] = [];

        // Add principal announcements
        for (const ann of principalAnnRes.data ?? []) {
            const key = `principal-${ann.id}`;
            notifications.push({
                id: key,
                type: "principal-announcement",
                title: ann.title ?? "Principal Announcement",
                message: ann.message,
                time: ann.created_at,
                read: readKeys.has(key),
            });
        }

        // Add escalated reports
        for (const report of escalatedReports ?? []) {
            const key = `escalated-${report.id}`;
            notifications.push({
                id: key,
                type: "escalated",
                title: "Report Escalated to Guidance",
                message: `${report.parent_name} has an escalated concern for ${report.student_name}: ${report.subject}`,
                time: report.status_updated_at ?? report.created_at,
                read: readKeys.has(key),
                parentName: report.parent_name,
            });
        }

        // Add ICT announcements
        for (const ann of ictAnnRes.data ?? []) {
            const key = `ict-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "principal-announcement",
                title: `[ICT] ${ann.title}`,
                message: ann.message,
                time: ann.created_at,
                read: readKeys.has(key),
            });
        }

        // Sort by time descending
        notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        const unreadCount = notifications.filter(n => !n.read).length;

        return NextResponse.json({ success: true, notifications, unreadCount });
    } catch (error) {
        console.error("GET /api/guidance/notifications error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch notifications." }, { status: 500 });
    }
}