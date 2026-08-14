import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import { isWithinNotificationRetention, notificationRetentionStart } from "@/lib/notificationRetention";

export async function GET() {
    try {
        const guidance = await getGuidanceFromToken();
        if (!guidance) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const retentionStart = notificationRetentionStart();
        await supabase.from("guidance_notification_reads")
            .delete()
            .eq("guidance_id", guidance.id)
            .lt("created_at", retentionStart);

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
            .select("id, parent_name, student_name, subject, created_at, status_updated_at, status, escalated_to_principal")
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

        // Add adviser escalations and principal resolutions to the same real-time feed.
        for (const report of escalatedReports ?? []) {
            const resolvedByPrincipal = String(report.status ?? "").toLowerCase() === "resolved" && report.escalated_to_principal === true;
            const key = resolvedByPrincipal ? `principal-resolved-${report.id}` : `escalated-${report.id}`;
            notifications.push({
                id: key,
                type: resolvedByPrincipal ? "resolved" : "escalated",
                title: resolvedByPrincipal ? "Concern Resolved by Principal" : "Report Escalated to Guidance",
                message: resolvedByPrincipal
                    ? `The Principal resolved the concern for ${report.student_name}: ${report.subject}`
                    : `${report.parent_name} has an escalated concern for ${report.student_name}: ${report.subject}`,
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
                type: "ict-announcement",
                title: `[ICT] ${ann.title}`,
                message: ann.message,
                time: ann.created_at,
                read: readKeys.has(key),
            });
        }

        const retainedNotifications = notifications.filter((notification) =>
            isWithinNotificationRetention(notification.time, retentionStart)
        );
        retainedNotifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        const unreadCount = retainedNotifications.filter(n => !n.read).length;
        const announcementUnreadCount = retainedNotifications.filter(
            n => (n.type === "principal-announcement" || n.type === "ict-announcement") && !n.read
        ).length;

        return NextResponse.json({ success: true, notifications: retainedNotifications, unreadCount, announcementUnreadCount });
    } catch (error) {
        console.error("GET /api/guidance/notifications error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch notifications." }, { status: 500 });
    }
}
